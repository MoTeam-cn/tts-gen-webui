// 语音合成：端点候选、鉴权降级、分段合成、参数预校验
import { AUDIO_TYPE, DEFAULT_FORMAT, ROLES, TOKEN_TTL, mapVoiceLoose } from './config.ts';
import { parseDomain, requestUrl, str } from './http.ts';
import { resolveRegion } from './regions.ts';
import { composeParamParts, normalizeBlock, rawBlocksOf, validateSsml, type NormalizedBlock } from './ssml.ts';
import { getVoiceList, lookupCapability, type VoiceCapability } from './voiceCache.ts';
import type { RegionInfo, SynthResult, TtsPayload, VoiceEntry } from './types.ts';

export interface Target { name: string; base: string; authBase: string; }

interface SynthContext {
  key: string;
  format: string;
  targets: Target[];
  used: string;
}

const tokenCache = new Map<string, { token: string; exp: number }>();

export class RequestError extends Error {
  status: number;
  hint: string;
  attempts: string[];
  constructor(status: number, message: string, attempts: string[] = [], hint = '') {
    super(message);
    this.status = status;
    this.attempts = attempts;
    this.hint = hint;
  }
}

export function derivedTtsHost(host: string): string {
  const value = String(host || '').toLowerCase();
  if (value.indexOf('.api.cognitive.microsoft.com') >= 0) {
    return host.replace(/\.api\.cognitive\.microsoft\.com$/i, '.tts.speech.microsoft.com');
  }
  if (value.indexOf('.api.cognitive.azure.cn') >= 0) {
    return host.replace(/\.api\.cognitive\.azure\.cn$/i, '.tts.speech.azure.cn');
  }
  return '';
}

// 合成端点候选：自定义域名（api.cognitive 主机先试派生 tts.speech）→ tts.speech → api.cognitive
// 官方文档：合成用 {region}.tts.speech.microsoft.com/cognitiveservices/v1，令牌用 {region}.api.cognitive.microsoft.com/sts/v1.0/issueToken
export function buildTargets(region: RegionInfo, customDomain: string): Target[] {
  const list: Target[] = [];
  const push = function (name: string, base: string, authBase: string) {
    if (list.some(function (t) { return t.base === base; })) return;
    list.push({ name, base, authBase });
  };
  const apiBase = 'https://' + region.apiDomain;
  const ttsBase = 'https://' + region.ttsDomain;
  const custom = parseDomain(customDomain);
  if (custom) {
    const derived = derivedTtsHost(custom.host);
    if (derived && derived !== custom.host) push('自定义域名派生 · ' + derived, 'https://' + derived, apiBase);
    push('自定义域名 · ' + custom.origin, custom.origin, apiBase);
  }
  push('语音合成端点 · ' + region.ttsDomain, ttsBase, apiBase);
  push('认知服务入口 · ' + region.apiDomain, apiBase, apiBase);
  return list;
}

function synthHeaders(format: string, auth: { key?: string; token?: string }): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/ssml+xml',
    'x-microsoft-outputformat': format,
    'user-agent': 'ms-tts-web/2.1',
    accept: '*/*'
  };
  if (auth.key) headers['ocp-apim-subscription-key'] = auth.key;
  if (auth.token) headers.authorization = 'Bearer ' + auth.token;
  return headers;
}

async function getToken(authBase: string, key: string): Promise<string> {
  const cached = tokenCache.get(authBase);
  if (cached && cached.exp > Date.now()) return cached.token;
  const res = await requestUrl(authBase + '/sts/v1.0/issueToken', {
    method: 'POST',
    headers: {
      'ocp-apim-subscription-key': key,
      'content-length': '0',
      'user-agent': 'ms-tts-web/2.1'
    },
    timeout: 20000
  });
  if (res.status !== 200) {
    throw new Error('换取访问令牌失败 HTTP ' + res.status + ' · ' + res.body.toString('utf8').slice(0, 200));
  }
  const token = res.body.toString('utf8');
  tokenCache.set(authBase, { token, exp: Date.now() + TOKEN_TTL });
  return token;
}

function postSynth(target: Target, ssml: string, format: string, auth: { key?: string; token?: string }) {
  return requestUrl(target.base + '/cognitiveservices/v1', {
    method: 'POST',
    headers: synthHeaders(format, auth),
    body: Buffer.from(ssml, 'utf8'),
    timeout: 60000
  });
}

async function synthOne(ctx: SynthContext, ssml: string): Promise<Buffer> {
  const attempts: string[] = [];
  for (const target of ctx.targets) {
    try {
      const res = await postSynth(target, ssml, ctx.format, { key: ctx.key });
      if (res.status === 200 && res.body.length > 0) {
        ctx.used = target.name + ' · 订阅密钥直连';
        return res.body;
      }
      const bodyText = res.body.toString('utf8');
      const where = res.headers['x-ms-request-id'] ? ' requestId=' + String(res.headers['x-ms-request-id']) : '';
      attempts.push(target.name + ' [密钥直连] format=' + ctx.format + ' HTTP ' + res.status + where + ' ' + bodyText.slice(0, 800) +
        (explainStatus(res.status, bodyText) ? ' ⟶ ' + explainStatus(res.status, bodyText) : '') +
        (res.status === 400 ? '｜请求 SSML：' + ssml.slice(0, 300) : ''));
    } catch (e) {
      attempts.push(target.name + ' [密钥直连] ' + (e as Error).message);
    }

    let token = '';
    try {
      token = await getToken(target.authBase, ctx.key);
    } catch (e) {
      attempts.push(target.name + ' [换取令牌] ' + (e as Error).message);
    }
    if (token) {
      try {
        const res2 = await postSynth(target, ssml, ctx.format, { token });
        if (res2.status === 200 && res2.body.length > 0) {
          ctx.used = target.name + ' · 临时令牌鉴权';
          return res2.body;
        }
        const bodyText2 = res2.body.toString('utf8');
        attempts.push(target.name + ' [令牌鉴权] HTTP ' + res2.status + ' ' + bodyText2.slice(0, 800) +
          (explainStatus(res2.status, bodyText2) ? ' ⟶ ' + explainStatus(res2.status, bodyText2) : ''));
      } catch (e) {
        attempts.push(target.name + ' [令牌鉴权] ' + (e as Error).message);
      }
    }
  }
  const joined = attempts.join('\n');
  // 优先给出「第一处可解释的原因」，避免把鉴权失败和参数问题糊在一起
  let hint = '';
  const explanations = attempts
    .map(function (line) {
      const idx = line.indexOf(' ⟶ ');
      return idx >= 0 ? line.slice(idx + 3) : '';
    })
    .filter(Boolean);
  if (explanations.length) {
    hint = explanations[0];
  } else if (/\b401\b|\b403\b/.test(joined)) {
    hint = '出现 401/403：密钥无效、已过期，或密钥与所选区域不匹配；也请确认该区域已创建「语音服务」资源，且没有把「认知服务多服务资源」的 Key 用到语音专用端点上。';
  }
  if (/role|style/i.test(joined) && /invalid ssml|unsupported/i.test(joined)) {
    const roleHint = 'role 只支持 Girl/Boy/YoungAdultFemale/YoungAdultMale/OlderAdultFemale/OlderAdultMale/SeniorFemale/SeniorMale，且必须配合 style（style 为必填）。';
    hint = hint ? hint + ' ' + roleHint : roleHint;
  }
  const head = hint ? hint.split('。')[0] : '';
  throw new RequestError(502, '合成失败' + (head ? ' · ' + head : '：所有端点都失败了（逐条尝试记录见下方）'), attempts, hint);
}

export interface PreparedParts {
  parts: string[];
  lang: string;
  voices: string[];
  mode: 'params' | 'ssml';
  ssml: string;
  warnings: string[];
  blocks?: NormalizedBlock[];
}

// 简易编辑距离，用于给拼错/不存在的音色找相近的可用音色
function editDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const d = b.toLowerCase();
  const rows = s.length + 1;
  const cols = d.length + 1;
  const grid: number[] = new Array(rows * cols);
  for (let i = 0; i < rows; i++) grid[i * cols] = i;
  for (let j = 0; j < cols; j++) grid[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === d[j - 1] ? 0 : 1;
      const del = grid[(i - 1) * cols + j] + 1;
      const ins = grid[i * cols + j - 1] + 1;
      const sub = grid[(i - 1) * cols + j - 1] + cost;
      grid[i * cols + j] = Math.min(del, ins, sub);
    }
  }
  return grid[rows * cols - 1];
}

export function suggestVoiceNames(voice: string, voices: VoiceEntry[], limit = 4): string[] {
  const target = String(voice || '');
  const prefix = target.split('-').slice(0, 2).join('-');
  const scored = voices.map(function (item) {
    const name = String(item.ShortName || '');
    let score = editDistance(target, name);
    if (prefix && name.indexOf(prefix + '-') === 0) score -= 12;
    if (/Neural$/.test(name) === /Neural$/.test(target)) score -= 2;
    return { name: name, score: score };
  }).filter(function (x) { return x.name; });
  scored.sort(function (a, b) { return a.score - b.score; });
  const out: string[] = [];
  scored.forEach(function (x) {
    if (out.length < limit && out.indexOf(x.name) < 0) out.push(x.name);
  });
  return out;
}

// 把 Azure 原始报错翻成人话
export function explainStatus(status: number, body: string): string {
  const text = String(body || '');
  if (/unsupported voice|invalid voice|voice.*not.*found|voice name/i.test(text)) {
    return '音色不可用：该音色在你选的区域内不存在，或名称拼写有误。用「拉取音色」核对短名（形如 zh-CN-XiaoxiaoNeural）。';
  }
  if (/invalid ssml|ssml.*invalid|invalid request/i.test(text)) {
    return 'SSML 被拒：常见原因是该音色不支持所选 style / role（style 为必填）、prosody 数值越界，或标签没闭合。';
  }
  if (/outputformat|output format/i.test(text)) {
    return '输出格式不被支持：换回 audio-24khz-48kbitrate-mono-mp3 等常见格式再试。';
  }
  if (status === 401 || status === 403) {
    return '鉴权失败：密钥无效/过期，或密钥与所选区域不匹配（密钥必须来自该区域的语音资源）。';
  }
  if (status === 429) {
    return '触发限流/配额：请求太频繁或免费额度用尽，稍后重试或提升配额。';
  }
  if (status === 404) {
    return '端点不存在：区域拼错，或该区域没有语音合成端点。';
  }
  if (status === 400) {
    if (!text.trim()) {
      return '请求被拒（400 且响应体为空）：通常是网关层拒绝——常见原因：该区域/该资源不支持这个音色、X-Microsoft-OutputFormat 取值不被接受，或请求体被当成非法实体。工具已尝试自动降级重试。';
    }
    return '请求被拒（400）：多为 SSML 内容问题，下面「逐条尝试记录」里有 Azure 原始响应。';
  }
  return '';
}

function styleFallbackForRole(cap: VoiceCapability): string {
  if (cap.styles.indexOf('general') >= 0) return 'general';
  return cap.styles.length ? cap.styles[0] : '';
}

// 参数预校验 + 拼 SSML（async：会按需拉一次 voices/list 校验 style / role 支持）
export async function prepareParts(payload: TtsPayload): Promise<PreparedParts> {
  const warnings: string[] = [];
  const ssmlText = str(payload.ssml);
  const explicitSsml = str(payload.mode) === 'ssml';
  const hasBlocks = Array.isArray(payload.blocks) && payload.blocks.length > 0;
  const useSsml = ssmlText !== '' && (explicitSsml || (!hasBlocks && !str(payload.text)));

  if (useSsml) {
    const result = validateSsml(ssmlText);
    if (!result.ok) throw new RequestError(400, 'SSML 校验失败：' + (result.error || '未知错误'));
    (result.warnings || []).forEach(function (w) { warnings.push(w); });
    return { parts: [ssmlText], lang: result.lang || '', voices: result.voices || [], mode: 'ssml', ssml: ssmlText, warnings, blocks: [] };
  }

  const key = str(payload.key);
  const region = resolveRegion(str(payload.region) || 'japaneast');
  const custom = parseDomain(payload.domain);
  const customOrigin = custom ? custom.origin : '';
  const fallbackVoice = str(payload.voice, 'zh-CN-XiaoxiaoNeural');
  const fallbackLang = str(payload.locale) || fallbackVoice.split('-').slice(0, 2).join('-') || 'zh-CN';

  const raws = rawBlocksOf(payload).filter(function (b) { return str(b.text); });
  if (!raws.length) throw new RequestError(400, '没有可合成的文本（text / blocks 都为空）');

  // ① 中文/口语写法的兜底改写（模型常直接把「磁性男声」「纪录片旁白」写进字段）
  raws.forEach(function (raw, i) {
    const label = '第 ' + (i + 1) + ' 段';
    const voice = str(raw.voice);
    if (voice) {
      const mapped = mapVoiceLoose(voice);
      if (mapped && mapped !== voice) {
        warnings.push(label + ' 的音色 "' + voice + '" 已改写为 ' + mapped);
        raw.voice = mapped;
      } else if (!mapped && !/^[a-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z]+Neural$/.test(voice)) {
        warnings.push(label + ' 的音色 "' + voice + '" 不是合法短名（形如 zh-CN-XiaoxiaoNeural），已改用 ' + fallbackVoice);
        raw.voice = '';
      }
    }
  });

  // ② 按音色校验 style / role 支持情况（voices/list 拿不到就跳过，best-effort）
  const caps = new Map<string, VoiceCapability>();
  if (key) {
    const names: string[] = [];
    raws.forEach(function (b) {
      const v = str(b.voice, fallbackVoice);
      if (names.indexOf(v) < 0) names.push(v);
    });
    const results = await Promise.all(names.map(function (name) {
      return lookupCapability(name, key, region, customOrigin);
    }));
    results.forEach(function (item) { caps.set(item.voice, item); });
  }

  // 音色是否存在：直接用 voices/list 校验，避免白打一次 Azure 拿 400
  if (key) {
    const list = await getVoiceList(key, region, customOrigin);
    if (list && list.length) {
      const available = list.map(function (v) { return String(v.ShortName || ''); });
      raws.forEach(function (raw, i) {
        const voice = str(raw.voice, fallbackVoice);
        if (available.indexOf(voice) >= 0) return;
        const suggestions = suggestVoiceNames(voice, list, 4);
        throw new RequestError(
          400,
          '第 ' + (i + 1) + ' 段的音色 ' + voice + ' 在区域 ' + region.id + ' 不可用（不在 voices/list 里）。' +
          (suggestions.length ? '最接近的可用音色：' + suggestions.join(' / ') : ''),
          [],
          '这是 400 的常见原因：音色短名写错或该音色在该区域未上线。点「拉取音色」可以拿到当前密钥+区域下真实可用的列表。'
        );
      });
    }
  }

  const blocks = raws.map(function (raw, i) {
    const label = '第 ' + (i + 1) + ' 段';
    const block = normalizeBlock(raw, fallbackVoice, fallbackLang, warnings);
    const cap = caps.get(block.voice);
    if (!cap || !cap.found) return block;

    if (block.role) {
      if (!cap.roles.length) {
        throw new RequestError(
          400,
          label + ' 使用的音色 ' + block.voice + ' 不支持角色扮演（RolePlayList 为空）。请换用支持 role 的音色，或去掉 role。',
          [],
          '可用 role 的音色一般是中文多风格音色（如 zh-CN-XiaomoNeural / zh-CN-XiaoxiaoNeural 等），具体以 voices/list 的 RolePlayList 为准。'
        );
      }
      if (cap.roles.indexOf(block.role) < 0) {
        throw new RequestError(
          400,
          label + ' 的 role="' + block.role + '" 不被音色 ' + block.voice + ' 支持。该音色支持的角色：' + cap.roles.join(' / '),
          []
        );
      }
    }

    if (block.style && cap.styles.length && cap.styles.indexOf(block.style) < 0) {
      warnings.push(label + ' 的风格 "' + block.style + '" 不被 ' + block.voice + ' 支持，已忽略。该音色可用风格：' + cap.styles.slice(0, 10).join('、') + (cap.styles.length > 10 ? ' 等' : ''));
      block.style = '';
      if (block.role) {
        const fallback = styleFallbackForRole(cap);
        if (fallback) {
          block.style = fallback;
          warnings.push(label + ' 为了保留 role，已自动改用 style="' + fallback + '"');
        } else {
          warnings.push(label + ' 找不到可用 style，role 已被去掉');
          block.role = '';
        }
      }
    }
    return block;
  });

  const composed = composeParamParts(payload, blocks, warnings);
  if (!composed.parts.length) throw new RequestError(400, '没有可合成的文本（text / blocks 都为空）');
  return { parts: composed.parts, lang: composed.lang, voices: composed.voices, mode: 'params', ssml: composed.ssml, warnings, blocks: blocks };
}

// 400 时逐级退让：先去掉 role，再去掉 style/styledegree，最后只留音色与文本
function degradeLevels(blocks: NormalizedBlock[]): { label: string; blocks: NormalizedBlock[] }[] {
  const clone = function (patch: Partial<NormalizedBlock>) {
    return blocks.map(function (b) { return Object.assign({}, b, patch); });
  };
  return [
    { label: '完整参数', blocks: blocks },
    { label: '去掉 role', blocks: clone({ role: '' }) },
    { label: '去掉 role 与 style（保留语速/音调/音量）', blocks: clone({ role: '', style: '', styleDegree: undefined }) },
    { label: '只用音色与文本（去掉所有 prosody 与停顿）', blocks: clone({ role: '', style: '', styleDegree: undefined, rate: undefined, pitch: undefined, volume: undefined, contour: '', pauseAfter: 0 }) }
  ];
}

export async function synthesize(payload: TtsPayload): Promise<SynthResult> {
  const key = str(payload.key);
  if (!key) throw new RequestError(400, '缺少订阅密钥 key');
  const region = resolveRegion(str(payload.region) || 'japaneast');
  const customDomain = str(payload.domain);
  let format = str(payload.format, DEFAULT_FORMAT);
  if (!AUDIO_TYPE[format]) {
    throw new RequestError(
      400,
      '输出格式 "' + format + '" 不被支持，X-Microsoft-OutputFormat 必须是微软列出的取值，例如 ' + DEFAULT_FORMAT,
      [],
      '可用格式：' + Object.keys(AUDIO_TYPE).slice(0, 6).join(' / ') + ' …'
    );
  }
  const prepared = await prepareParts(payload);

  const ctx: SynthContext = {
    key,
    format,
    targets: buildTargets(region, customDomain),
    used: ''
  };
  const started = Date.now();
  const warnings = prepared.warnings.slice();

  const runParts = async function (parts: string[]): Promise<Buffer[]> {
    const out: Buffer[] = [];
    for (const part of parts) out.push(await synthOne(ctx, part));
    return out;
  };

  let buffers: Buffer[] = [];
  try {
    buffers = await runParts(prepared.parts);
  } catch (e) {
    const err = e as RequestError;
    const attempts = err.attempts || [];
    // 只要主端点（第一条记录）是 400 就值得降级试探；后续兜底端点的 401/404 不算
    const all400 = attempts.length > 0 && /HTTP 400/.test(attempts[0]);
    const blocks = prepared.blocks || [];
    if (!all400 || prepared.mode !== 'params' || !blocks.length) throw e;

    const levels = degradeLevels(blocks);
    let recovered = false;
    for (let i = 1; i < levels.length; i++) {
      const level = levels[i];
      const composed = composeParamParts(payload, level.blocks, warnings);
      if (!composed.parts.length) continue;
      try {
        buffers = await runParts(composed.parts);
        warnings.push('Azure 拒绝了完整参数（400），已自动降级为「' + level.label + '」合成成功。想要原效果请换用支持该 style / role 的音色。');
        recovered = true;
        break;
      } catch (e2) {
        warnings.push('降级「' + level.label + '」仍被拒绝');
      }
    }
    if (!recovered) {
      err.hint = (err.hint ? err.hint + ' ' : '') + '已按「去 role → 去 style → 只留音色与文本」逐级降级重试，仍然 400，说明问题不在 style/role，而在音色、输出格式或密钥所属资源。';
      throw err;
    }
  }

  return {
    warnings: warnings,
    audio: Buffer.concat(buffers),
    endpoint: ctx.used,
    chunks: prepared.parts.length,
    ms: Date.now() - started,
    lang: prepared.lang,
    voices: prepared.voices
  };
}

export interface DiagnoseStep { name: string; ok: boolean; detail: string; }

// 一键诊断：音色列表 → 最小 SSML → 带 style → 当前格式，逐项报告
export async function diagnose(payload: TtsPayload): Promise<{ ok: boolean; region: string; format: string; steps: DiagnoseStep[] }> {
  const key = str(payload.key);
  const region = resolveRegion(str(payload.region) || 'japaneast');
  const customDomain = str(payload.domain);
  const format = str(payload.format, DEFAULT_FORMAT);
  const steps: DiagnoseStep[] = [];

  if (!key) {
    return { ok: false, region: region.id, format: format, steps: [{ name: '订阅密钥', ok: false, detail: '还没填 Key，先填 Azure 语音服务密钥' }] };
  }

  const custom = parseDomain(customDomain);
  const customOrigin = custom ? custom.origin : '';
  const ctx: SynthContext = { key, format: format, targets: buildTargets(region, customDomain), used: '' };

  // 1) voices/list
  let voicesOk = false;
  let voice = 'zh-CN-XiaoxiaoNeural';
  try {
    const list = await getVoiceList(key, region, customOrigin);
    if (list && list.length) {
      voicesOk = true;
      const zh = list.filter(function (v) { return String(v.ShortName || '').indexOf('zh-CN-') === 0; });
      if (zh.length) voice = String(zh[0].ShortName);
      steps.push({ name: '① 音色列表 voices/list', ok: true, detail: '拿到 ' + list.length + ' 个音色；本次探测用 ' + voice });
    } else {
      steps.push({ name: '① 音色列表 voices/list', ok: false, detail: '拉取失败或为空：检查 Key 与区域是否匹配' });
    }
  } catch (e) {
    steps.push({ name: '① 音色列表 voices/list', ok: false, detail: '异常：' + (e as Error).message });
  }

  const probe = async function (name: string, ssml: string): Promise<boolean> {
    try {
      await synthOne(ctx, ssml);
      steps.push({ name: name, ok: true, detail: '成功，命中 ' + (ctx.used || '未知端点') });
      return true;
    } catch (e) {
      const err = e as RequestError;
      const first = (err.attempts || [])[0] || '';
      steps.push({ name: name, ok: false, detail: (first || err.message).slice(0, 400) });
      return false;
    }
  };

  const minimal = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="' + voice + '">诊断测试</voice></speak>';
  const withStyle = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="' + voice + '"><mstts:express-as style="general"><prosody rate="-10%">诊断测试</prosody></mstts:express-as></voice></speak>';

  const s2 = await probe('② 最小 SSML 合成（无 style / 无 prosody）', minimal);
  const s3 = s2 ? await probe('③ 带 style=general + prosody 合成', withStyle) : false;
  const s4 = s3 ? await probe('④ 当前输出格式 ' + format + ' 合成', minimal) : false;

  return { ok: s2 && s3 && s4, region: region.id, format: format, steps: steps };
}
