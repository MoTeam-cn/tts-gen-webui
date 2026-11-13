// SSML 组装、校验与文本切分
import { CHUNK_MAX, MAX_SSML_BYTES, ROLES, STYLES, mapRoleLoose, mapStyleLoose } from './config.ts';
import { clampNumber, optionalNumber, str } from './http.ts';
import type { BlockPayload, TtsPayload } from './types.ts';

export const SPEAK_OPEN = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
  + 'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="';
export const VOICE_NS = 'http://www.w3.org/2001/10/synthesis';
export const MSTTS_NS = 'https://www.w3.org/2001/mstts';

export function escapeXml(value: unknown): string {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function percentValue(value: unknown, fallback = 0): string {
  const n = Math.round(Number(value === undefined || value === null || value === '' ? fallback : value));
  if (!Number.isFinite(n)) return (fallback >= 0 ? '+' : '') + Math.round(fallback) + '%';
  return (n >= 0 ? '+' : '') + n + '%';
}

export interface NormalizedBlock {
  text: string;
  voice: string;
  lang: string;
  style: string;
  role: string;
  styleDegree: number | undefined;
  rate: number | undefined;
  pitch: number | undefined;
  volume: number | undefined;
  contour: string;
  pauseAfter: number;
}

export function normalizeBlock(block: BlockPayload, fallbackVoice: string, fallbackLang: string, warnings: string[] = []): NormalizedBlock {
  const text = str(block.text);
  const voice = str(block.voice, fallbackVoice);
  const lang = str(block.locale) || voice.split('-').slice(0, 2).join('-') || fallbackLang || 'zh-CN';

  const rawStyle = str(block.style);
  let style = mapStyleLoose(rawStyle);
  if (rawStyle && !style) {
    warnings.push('风格 "' + rawStyle + '" 不在微软官方取值内，已忽略（官方共 ' + STYLES.length + ' 个英文枚举）');
  } else if (rawStyle && style !== rawStyle) {
    warnings.push('风格 "' + rawStyle + '" 已改写为官方取值 "' + style + '"');
  }

  const rawRole = str(block.role);
  let role = mapRoleLoose(rawRole);
  if (rawRole && rawRole !== role) {
    warnings.push(role ? '角色 "' + rawRole + '" 已改写为官方取值 "' + role + '"' : '角色 "' + rawRole + '" 不是 role 取值（旁白请用 style），已移除');
  }

  // 官方规则：style 是 mstts:express-as 的必填属性，只给 role 不给 style 时整段会被忽略
  if (role && !style) {
    style = 'general';
    warnings.push('role 需要 style 配合（style 为必填），已自动补 style="general"');
  }

  const styleDegreeRaw = optionalNumber(block.styleDegree);
  const styleDegree = styleDegreeRaw === undefined ? undefined : Math.max(0.01, Math.min(2, styleDegreeRaw));
  const rate = block.rate === undefined || block.rate === '' ? undefined : clampNumber(block.rate, -50, 100, 0);
  const pitch = block.pitch === undefined || block.pitch === '' ? undefined : clampNumber(block.pitch, -50, 50, 0);
  const volume = block.volume === undefined || block.volume === '' ? undefined : clampNumber(block.volume, -50, 50, 0);
  const contour = str(block.contour);
  const pauseAfter = block.pauseAfter === undefined || block.pauseAfter === '' ? 0 : clampNumber(block.pauseAfter, 0, 10000, 0);

  return { text, voice, lang, style, role, styleDegree, rate, pitch, volume, contour, pauseAfter };
}

export interface BuildOptions {
  text: string;
  voice: string;
  lang: string;
  style?: string;
  role?: string;
  styleDegree?: number;
  rate?: number;
  pitch?: number;
  volume?: number;
  contour?: string;
  pauseAfter?: number;
  withSpeak?: boolean;
}

export function buildVoiceSsml(o: BuildOptions): string {
  const prosodyAttrs: string[] = [];
  if (o.rate !== undefined) prosodyAttrs.push('rate="' + percentValue(o.rate) + '"');
  if (o.pitch !== undefined) prosodyAttrs.push('pitch="' + percentValue(o.pitch) + '"');
  if (o.volume !== undefined) prosodyAttrs.push('volume="' + percentValue(o.volume) + '"');
  if (o.contour) prosodyAttrs.push('contour="' + escapeXml(o.contour) + '"');

  const body = prosodyAttrs.length
    ? '<prosody ' + prosodyAttrs.join(' ') + '>' + escapeXml(o.text) + '</prosody>'
    : escapeXml(o.text);

  const expressAttrs: string[] = [];
  if (o.style) expressAttrs.push('style="' + escapeXml(o.style) + '"');
  if (o.role) expressAttrs.push('role="' + escapeXml(o.role) + '"');
  if (o.styleDegree !== undefined) expressAttrs.push('styledegree="' + String(o.styleDegree) + '"');

  const inner = expressAttrs.length
    ? '<mstts:express-as ' + expressAttrs.join(' ') + '>' + body + '</mstts:express-as>'
    : body;

  const voiceBlock = '<voice name="' + escapeXml(o.voice) + '">' + inner + '</voice>';
  const pause = o.pauseAfter && o.pauseAfter > 0 ? '<break time="' + o.pauseAfter + 'ms"/>' : '';
  if (o.withSpeak === false) return voiceBlock + pause;
  return SPEAK_OPEN + escapeXml(o.lang || 'zh-CN') + '">' + voiceBlock + pause + '</speak>';
}

export interface ComposedPayload {
  parts: string[];
  lang: string;
  voices: string[];
  mode: 'params' | 'ssml';
  ssml: string;
  warnings: string[];
  blocks: NormalizedBlock[];
}

export function rawBlocksOf(payload: TtsPayload): BlockPayload[] {
  if (Array.isArray(payload.blocks) && payload.blocks.length) return payload.blocks;
  return [{
    text: payload.text,
    voice: payload.voice,
    locale: payload.locale,
    style: payload.style,
    role: payload.role,
    styleDegree: payload.styleDegree,
    rate: payload.rate,
    pitch: payload.pitch,
    volume: payload.volume,
    contour: payload.contour
  }];
}

export function composeParamParts(payload: TtsPayload, blocks: NormalizedBlock[], warnings: string[]): ComposedPayload {
  const parts: string[] = [];
  const voices: string[] = [];
  const previews: string[] = [];

  blocks.forEach(function (b) {
    if (!b.text) return;
    if (voices.indexOf(b.voice) < 0) voices.push(b.voice);
    const chunks = splitText(b.text, CHUNK_MAX);
    chunks.forEach(function (chunk, idx) {
      const isLast = idx === chunks.length - 1;
      parts.push(buildVoiceSsml({
        text: chunk,
        voice: b.voice,
        lang: b.lang,
        style: b.style,
        role: b.role,
        styleDegree: b.styleDegree,
        rate: b.rate,
        pitch: b.pitch,
        volume: b.volume,
        contour: b.contour,
        pauseAfter: isLast ? b.pauseAfter : 0
      }));
    });
    previews.push(buildVoiceSsml({
      text: b.text,
      voice: b.voice,
      lang: b.lang,
      style: b.style,
      role: b.role,
      styleDegree: b.styleDegree,
      rate: b.rate,
      pitch: b.pitch,
      volume: b.volume,
      contour: b.contour,
      pauseAfter: b.pauseAfter
    }));
  });

  const lang = blocks.length ? blocks[0].lang : 'zh-CN';
  return { parts, lang, voices, mode: 'params', ssml: previews.join('\n'), warnings, blocks };
}

export interface ValidateResult {
  ok: boolean;
  error?: string;
  lang?: string;
  voices?: string[];
  warnings?: string[];
}

export function validateSsml(xml: string): ValidateResult {
  const src = String(xml || '').trim();
  if (!src) return { ok: false, error: 'SSML 内容为空' };
  if (Buffer.byteLength(src, 'utf8') > MAX_SSML_BYTES) {
    return { ok: false, error: 'SSML 超过 ' + Math.round(MAX_SSML_BYTES / 1024) + 'KB，Azure 单次请求无法接收，请拆分' };
  }
  if (!/^<speak[\s>]/.test(src)) return { ok: false, error: '必须以 <speak version="1.0" ...> 作为根节点' };
  if (!/<\/speak>\s*$/.test(src)) return { ok: false, error: '必须以 </speak> 结尾' };
  if (src.indexOf('mstts:') >= 0 && src.indexOf('xmlns:mstts') < 0) {
    return { ok: false, error: '使用了 mstts: 前缀，但根节点缺少 xmlns:mstts="https://www.w3.org/2001/mstts"' };
  }
  if (src.indexOf('<voice') >= 0 && src.indexOf('xmlns="http://www.w3.org/2001/10/synthesis"') < 0) {
    return { ok: false, error: '根节点缺少 xmlns="http://www.w3.org/2001/10/synthesis" 命名空间' };
  }

  const tagRe = /<(\/?)([A-Za-z_][\w:.-]*)([^<>]*?)(\/?)>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(src)) !== null) {
    const closing = match[1] === '/';
    const name = match[2];
    const selfClosing = match[4] === '/';
    if (selfClosing) continue;
    if (closing) {
      const top = stack.pop();
      if (top !== name) return { ok: false, error: '标签未正确闭合：期望 </' + (top || '?') + '>，实际 </' + name + '>' };
    } else {
      stack.push(name);
    }
  }
  if (stack.length) return { ok: false, error: '存在未闭合标签：<' + stack.join('>, <') + '>' };

  const warnings: string[] = [];
  // 官方规则：role 只支持 8 个取值；style 必填
  const roleMatches = [...src.matchAll(/role\s*=\s*["']([^"']+)["']/g)];
  for (const item of roleMatches) {
    if (ROLES.indexOf(item[1]) < 0) {
      return { ok: false, error: 'role="' + item[1] + '" 不是官方取值，只支持：' + ROLES.join(' / ') };
    }
  }
  const expressBlocks = [...src.matchAll(/<mstts:express-as\b([^>]*)>/g)];
  for (const block of expressBlocks) {
    if (!/\bstyle\s*=/.test(block[1])) {
      warnings.push('<mstts:express-as> 缺少 style，Azure 会忽略整个元素（style 为必填）');
    }
  }

  const langMatch = src.match(/xml:lang\s*=\s*["']([^"']+)["']/);
  const voiceMatches = src.match(/<voice[^>]*name\s*=\s*["']([^"']+)["']/g) || [];
  const voices = voiceMatches.map(function (m) {
    const mm = m.match(/name\s*=\s*["']([^"']+)["']/);
    return mm ? mm[1] : '';
  }).filter(Boolean);

  return { ok: true, lang: langMatch ? langMatch[1] : '', voices, warnings };
}

export function splitText(input: string, max = CHUNK_MAX): string[] {
  const clean = String(input || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const sentences = clean.split(/(?<=[。！？!?.;；\n])/);
  const chunks: string[] = [];
  let buf = '';
  sentences.forEach(function (sentence) {
    if (!sentence) return;
    if (sentence.length > max) {
      if (buf) { chunks.push(buf); buf = ''; }
      for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max));
      return;
    }
    if ((buf + sentence).length > max) {
      chunks.push(buf);
      buf = sentence;
    } else {
      buf += sentence;
    }
  });
  if (buf) chunks.push(buf);
  return chunks;
}
