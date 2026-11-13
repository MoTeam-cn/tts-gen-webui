// 前端 agent：把「想要的声音」压成参数 JSON；提示词按“参数生成器”来写，禁止聊天/反问
import { ROLES, STYLE_OPTIONS, nickOf, localeName } from './constants.js';

const MAX_VOICES_IN_PROMPT = 80;

const OUTPUT_SHAPE = '{"reply":"一句话参数思路(<=30字)","blocks":[{"text":"要朗读的文本","voice":"音色短名","style":"风格","role":"可选角色","styleDegree":1,"rate":0,"pitch":0,"volume":0,"pauseAfter":300}]}';

function firstText(state) {
  const blocks = state.blocks || [];
  const first = blocks.find(function (b) { return String(b.text || '').trim(); });
  return first ? String(first.text) : '';
}

export function buildSystemPrompt(state) {
  const L = [];
  L.push('你是一个「TTS 参数生成器」接口，不是聊天助手。');
  L.push('你的唯一职责是：把用户对声音的描述，翻译成参数 JSON。你的整条回复必须是一个 JSON 对象本身，不能有任何其它文字。');
  L.push('');
  L.push('## 绝对禁止（违反即视为失败）');
  L.push('- 禁止提问、禁止反问、禁止让用户选择方案（如「你要哪一种」「你想往哪个方向走」）。');
  L.push('- 禁止说「我无法生成音频 / 我不能直接合成 / 我可以帮你…」这类能力说明。');
  L.push('- 禁止输出多个方案列表、禁止 markdown 代码围栏、禁止表格、禁止在 JSON 前后加解释。');
  L.push('- 禁止向用户索要文案：需要文本时，直接使用下面「当前段落文本」；若为空则用一句占位文本「这里放要朗读的文案」。');
  L.push('');
  L.push('## 唯一允许的输出结构');
  L.push(OUTPUT_SHAPE);
  L.push('');
  L.push('## 示例（必须照这个形状输出，不要输出示例本身之外的内容）');
  L.push('输入：低沉有磁性的男声，语速慢一点，像纪录片旁白');
  L.push('输出：{"reply":"低沉男声配纪录片旁白，语速放慢、音调下压","blocks":[{"text":"这里放要朗读的文案","voice":"zh-CN-YunxiNeural","style":"narration-professional","styleDegree":1,"rate":-12,"pitch":-8,"volume":0,"pauseAfter":400}]}');
  L.push('输入：温柔治愈的深夜电台女声，慢一点，轻一点');
  L.push('输出：{"reply":"温柔气声女声，慢速轻音量","blocks":[{"text":"这里放要朗读的文案","voice":"zh-CN-XiaoxiaoNeural","style":"gentle","styleDegree":1.1,"rate":-10,"pitch":-3,"volume":-20,"pauseAfter":500}]}');
  L.push('输入：两个人在对话，一个温柔女生、一个活泼小男孩');
  L.push('输出：{"reply":"拆成女声与小男孩两段对话","blocks":[{"text":"第一句对话","voice":"zh-CN-XiaoxiaoNeural","style":"chat","role":"YoungAdultFemale","rate":-4,"pitch":0,"pauseAfter":300},{"text":"第二句对话","voice":"zh-CN-XiaoxiaoNeural","style":"cheerful","role":"Boy","rate":6,"pitch":6,"pauseAfter":300}]}');
  L.push('');
  L.push('## 取值必须是「机器可读的英文枚举」（最容易翻车的地方，务必遵守）');
  L.push('- voice：必须是形如 zh-CN-YunxiNeural 的短名，**且必须是下面清单里真实存在的音色**（不在清单的组合会 400）。**禁止**写「磁性男声」「老年女性」「低沉男声」这种描述，也禁止自己发明音色名。');
  L.push('- style：必须是英文枚举值。**禁止**写「纪录片旁白」，要写 narration-professional。');
  L.push('- role：只能是 8 个英文枚举之一，或空字符串 ""。**禁止**写「旁白」——旁白是风格不是角色，请把 role 留空并写 style=narration-professional。');
  L.push('反例（禁止这样输出）：{"text":"测试一下老年女性解说的声音效果","voice":"磁性男声","style":"纪录片旁白","role":"旁白"}');
  L.push('正确改写：{"text":"测试一下老年女性解说的声音效果","voice":"zh-CN-XiaomoNeural","style":"narration-professional","role":"SeniorFemale","rate":-10,"pitch":-2,"volume":0,"pauseAfter":300}');
  L.push('');
  L.push('## 常见需求 → 音色短名（可直接照抄，也可从下面清单里挑）');
  L.push('- 低沉/磁性/浑厚男声：zh-CN-YunxiNeural、zh-CN-YunyeNeural');
  L.push('- 播音/新闻男声：zh-CN-YunyangNeural；稳重男声：zh-CN-YunjianNeural');
  L.push('- 老年男性：zh-CN-YunSongNeural（云松·老年）');
  L.push('- 老年女性：zh-CN-XiaomoNeural + role=SeniorFemale（role 只在该音色 RolePlayList 里有时才生效）');
  L.push('- 温柔/治愈女声：zh-CN-XiaoxiaoNeural；活泼元气：zh-CN-XiaoyiNeural');
  L.push('- 儿童：zh-CN-XiaoshuangNeural（女）、zh-CN-XiaoyouNeural（男），可配 role=Girl/Boy');
  L.push('- 台湾腔：zh-TW-HsiaoChenNeural（女）、zh-TW-YunJheNeural（男）；粤语：zh-HK-HiuMaanNeural（女）、zh-HK-WanLungNeural（男）');
  L.push('- 英语：en-US-AriaNeural（女）、en-US-GuyNeural（男）');
  L.push('');
  L.push('## 参数规则');
  L.push('1. voice 取下面音色清单里的短名；不确定用 zh-CN-XiaoxiaoNeural。');
  L.push('2. style 只能取这 34 个之一：' + STYLE_OPTIONS.map(function (s) { return s.value; }).join(', ') + '。');
  L.push('3. role 只能是 8 个之一：' + ROLES.map(function (r) { return r.value; }).join(', ') + '；只有该音色「角色」列里有的才能用，否则留空字符串。');
  L.push('4. 写了 role 必须同时有 style（style 是 mstts:express-as 的必填属性）。');
  L.push('5. rate -50~100（%），pitch -50~50（%），volume -50~50（%），pauseAfter 0~10000（毫秒），styleDegree 0.01~2。');
  L.push('6. text：用户给了文案就原样用；没给就用「当前段落文本」；都为空就写「这里放要朗读的文案」。不要改写、不要续写。');
  L.push('7. 一句话描述 → 1 个 block；多角色对话 → 按对话拆多个 block。');
  L.push('');
  L.push('## 音色清单（短名 | 中文名 | 语言 | 支持风格 | 支持角色）');
  const voices = (state.voices || []).slice(0, MAX_VOICES_IN_PROMPT);
  voices.forEach(function (v) {
    const styles = (v.StyleList && v.StyleList.length) ? v.StyleList.slice(0, 10).join(',') : '-';
    const roles = (v.RolePlayList && v.RolePlayList.length) ? v.RolePlayList.join(',') : '-';
    L.push(v.ShortName + ' | ' + (v.Nick || nickOf(v.ShortName)) + ' | ' + (v.Locale || '') + ' ' + (v.LocaleName || localeName(v.Locale)) + ' | ' + styles + ' | ' + roles);
  });
  L.push('（清单只列了前 ' + voices.length + ' 个，真实可用音色更多）');
  L.push('');
  L.push('## 当前段落文本（用户没给文案时直接用它）');
  L.push(firstText(state) ? JSON.stringify(firstText(state)) : '（空）');
  L.push('');
  L.push('## 当前工作台状态');
  const cfg = state.cfg || {};
  L.push('- 区域：' + (cfg.region || 'japaneast') + '，语言：' + (cfg.lang || 'zh-CN') + '，格式：' + (cfg.format || ''));
  L.push('');
  L.push('## 口语 → 参数参考');
  L.push('- 低沉/磁性/稳重：男声（YunxiNeural/YunyeNeural/CONRAD 等）+ pitch -8~-15 + rate -8~-15');
  L.push('- 温柔/治愈/耳语：style=gentle 或 whispering + rate -10 + volume -20');
  L.push('- 活泼/元气：style=cheerful 或 excited + rate +8~+15 + pitch +5~+10');
  L.push('- 新闻播报：style=newscast / newscast-formal + rate 0');
  L.push('- 纪录片旁白：style=narration-professional + rate -10 + pitch -5');
  L.push('- 儿童故事：zh-CN-XiaoshuangNeural / XiaoyouNeural + style=cheerful，对话可加 role=Girl/Boy');
  L.push('- 客服：style=customerservice + rate -5');
  L.push('');
  L.push('现在开始：用户的下一条消息只是「声音描述」，你直接返回 JSON 对象，不要询问、不要解释。');
  return L.join('\n');
}

// 把用户描述包一层，重复约束（有些网关会丢掉 system 消息）
export function buildUserMessage(state, text) {
  const current = firstText(state);
  return [
    '【声音描述】' + String(text || '').trim(),
    '【当前段落文本】' + (current ? JSON.stringify(current) : '（空，请用「这里放要朗读的文案」）'),
    '【输出】立刻返回一个 JSON 对象，形如 ' + OUTPUT_SHAPE,
    '【要求】只输出 JSON：不要提问、不要给方案选项、不要解释、不要 markdown。'
  ].join('\n');
}

export function buildRepairMessage() {
  return [
    '你上一条回复不是合法 JSON，违反了输出契约。',
    '请重新输出，并且只输出一个 JSON 对象，形状必须是：' + OUTPUT_SHAPE,
    '不要任何解释、不要问句、不要 markdown 围栏、不要多个方案。'
  ].join('\n');
}

// 从模型输出里抠出 JSON（容忍 markdown 围栏、前后废话）
export function extractJsonCandidate(text) {
  let source = String(text || '').trim();
  if (!source) return '';
  const tick = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
  const fence = source.indexOf(tick);
  if (fence >= 0) {
    const rest = source.slice(source.indexOf('\n', fence) + 1);
    const endFence = rest.indexOf(tick);
    source = (endFence >= 0 ? rest.slice(0, endFence) : rest).trim();
  }
  const start = source.search(/[\[{]/);
  if (start < 0) return '';
  const open = source[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

export function parseAgentPayload(text) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return { ok: false, reason: '模型没输出 JSON（可能又在反问/解释）', reply: '', blocks: 0, raw: String(text || '') };
  let data;
  try {
    data = JSON.parse(candidate);
  } catch (e) {
    return { ok: false, reason: 'JSON 解析失败：' + e.message, reply: '', blocks: 0, raw: candidate };
  }
  if (Array.isArray(data)) return { ok: true, reply: '', jsonText: JSON.stringify(data), blocks: data, raw: candidate };
  if (data && typeof data === 'object') {
    const blocks = data.blocks || data.segments || data.sections || data.items;
    const reply = String(data.reply || data.explanation || data.summary || '');
    if (Array.isArray(blocks)) return { ok: true, reply: reply, jsonText: JSON.stringify(blocks), blocks: blocks, raw: candidate };
    if (typeof data.ssml === 'string') return { ok: true, reply: reply, jsonText: JSON.stringify({ mode: 'ssml', ssml: data.ssml }), ssml: data.ssml, raw: candidate };
    if (typeof data.text === 'string') return { ok: true, reply: reply, jsonText: JSON.stringify([data]), raw: candidate };
  }
  return { ok: false, reason: 'JSON 结构不认识（需要 blocks 数组或 {mode:"ssml",ssml:"..."}）', reply: '', blocks: 0, raw: candidate };
}

export async function streamAgent(cfg, messages, onDelta, signal, onReasoning) {
  const res = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: cfg.baseUrl,
      key: cfg.key,
      model: cfg.model,
      temperature: cfg.temperature,
      jsonMode: cfg.jsonMode !== false,
      messages: messages,
      stream: true
    }),
    signal: signal
  });
  const type = res.headers.get('content-type') || '';
  if (type.indexOf('text/event-stream') < 0) {
    let payload = {};
    try { payload = await res.json(); } catch (e) {}
    throw new Error(payload.error || ('HTTP ' + res.status));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let reasoningFull = '';
  let serverError = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf('\n\n');
      const eventLine = block.match(/^event: (.+)$/m);
      const dataLine = block.match(/^data: (.+)$/m);
      if (!eventLine) continue;
      const event = eventLine[1].trim();
      let data = {};
      try { data = dataLine ? JSON.parse(dataLine[1]) : {}; } catch (e) { data = {}; }
      if (event === 'reasoning' && data.text) {
        reasoningFull += data.text;
        if (onReasoning) onReasoning(data.text, reasoningFull);
      } else if (event === 'delta' && data.text) {
        full += data.text;
        if (onDelta) onDelta(data.text, full);
      } else if (event === 'error') {
        serverError = data.error || '未知错误';
      }
    }
  }
  if (serverError) throw new Error(serverError);
  return full;
}
