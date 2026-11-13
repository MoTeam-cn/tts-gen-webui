// 导入解析：把 AI 输出的 JSON / SSML 归一化成工作台能直接吃的结构
import { str } from './http.ts';
import { validateSsml } from './ssml.ts';
import type { BlockPayload } from './types.ts';

export interface ImportBlock {
  text: string;
  voice: string;
  style: string;
  role: string;
  styleDegree: number | null;
  rate: number | null;
  pitch: number | null;
  volume: number | null;
  contour: string;
  pauseAfter: number;
  locale: string;
}

export interface ImportResult {
  ok: boolean;
  mode: 'params' | 'ssml';
  blocks: ImportBlock[];
  ssml: string;
  warnings: string[];
  summary: string;
  error: string;
}

const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
const TICK = String.fromCharCode(96);

// 字段别名表：兼容 AI 常见的各种写法
const ALIAS: Record<string, string> = {
  text: 'text', content: 'text', 文案: 'text', sentence: 'text', line: 'text', utterance: 'text', utterancetext: 'text',
  voice: 'voice', voicename: 'voice', 音色: 'voice', speaker: 'voice',
  style: 'style', 风格: 'style', expressas: 'style', express_as: 'style',
  role: 'role', roleplay: 'role', role_play: 'role', 角色: 'role',
  styledegree: 'styleDegree', style_degree: 'styleDegree', 强度: 'styleDegree', degree: 'styleDegree',
  rate: 'rate', speed: 'rate', 语速: 'rate', prosodyrate: 'rate',
  pitch: 'pitch', 音调: 'pitch', prosodypitch: 'pitch',
  volume: 'volume', 音量: 'volume', prosodyvolume: 'volume',
  contour: 'contour', 音调曲线: 'contour',
  pauseafter: 'pauseAfter', pause: 'pauseAfter', pause_after: 'pauseAfter', break: 'pauseAfter', breaktime: 'pauseAfter', 停顿: 'pauseAfter',
  locale: 'locale', lang: 'locale', language: 'locale', 语言: 'locale', xmllang: 'locale'
};

function pickKey(key: string): string {
  const normalized = String(key || '').replace(/[\s_-]/g, '').toLowerCase();
  return ALIAS[normalized] || ALIAS[String(key || '').trim()] || '';
}

function numeric(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const matched = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!matched) return null;
  const n = Number(matched[0]);
  return Number.isFinite(n) ? n : null;
}

function clampWarn(warnings: string[], label: string, value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  if (value < min) {
    warnings.push(label + ' ' + value + ' 低于下限，已按 ' + min + ' 处理');
    return min;
  }
  if (value > max) {
    warnings.push(label + ' ' + value + ' 高于上限，已按 ' + max + ' 处理');
    return max;
  }
  return value;
}

function normalizeBlock(raw: Record<string, unknown>, warnings: string[], indexLabel: string): ImportBlock | null {
  const mapped: Record<string, unknown> = {};
  Object.keys(raw).forEach(function (key) {
    const target = pickKey(key);
    if (target) {
      if (mapped[target] === undefined) mapped[target] = raw[key];
    } else if (key !== 'id' && key !== 'index') {
      warnings.push(indexLabel + '：忽略未知字段 ' + key);
    }
  });

  const text = str(mapped.text);
  if (!text) {
    warnings.push(indexLabel + '：没找到文本字段（text / content / 文案）');
    return null;
  }

  const degree = numeric(mapped.styleDegree);
  return {
    text,
    voice: str(mapped.voice) || DEFAULT_VOICE,
    style: str(mapped.style),
    role: str(mapped.role),
    styleDegree: degree === null ? null : Math.max(0.01, Math.min(2, degree)),
    rate: clampWarn(warnings, indexLabel + ' 的 rate', numeric(mapped.rate), -50, 100),
    pitch: clampWarn(warnings, indexLabel + ' 的 pitch', numeric(mapped.pitch), -50, 50),
    volume: clampWarn(warnings, indexLabel + ' 的 volume', numeric(mapped.volume), -50, 50),
    contour: str(mapped.contour),
    pauseAfter: clampWarn(warnings, indexLabel + ' 的 pauseAfter', numeric(mapped.pauseAfter), 0, 10000) || 0,
    locale: str(mapped.locale)
  };
}

// 剥掉代码块围栏与前后闲聊，抽出 SSML 或 JSON 主体
export function extractPayload(raw: string): string {
  let text = String(raw || '').replace(/^\uFEFF/, '').trim();
  const lines = text.split('\n').filter(function (line) {
    const trimmed = line.trim();
    return trimmed.indexOf(TICK + TICK + TICK) !== 0;
  });
  text = lines.join('\n').trim();

  const ssmlStart = text.toLowerCase().indexOf('<speak');
  if (ssmlStart >= 0) {
    const ssmlEnd = text.toLowerCase().lastIndexOf('</speak>');
    if (ssmlEnd > ssmlStart) return text.slice(ssmlStart, ssmlEnd + 8).trim();
    return text.slice(ssmlStart).trim();
  }

  const startObj = text.indexOf('{');
  const startArr = text.indexOf('[');
  let start = -1;
  if (startObj < 0) start = startArr;
  else if (startArr < 0) start = startObj;
  else start = Math.min(startObj, startArr);
  if (start < 0) return text;

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
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
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

function asBlocks(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(function (item) { return item && typeof item === 'object'; }) as Record<string, unknown>[];
}

function summarize(blocks: ImportBlock[]): string {
  const voices: string[] = [];
  const styles: string[] = [];
  let chars = 0;
  blocks.forEach(function (b) {
    chars += b.text.length;
    if (b.voice && voices.indexOf(b.voice) < 0) voices.push(b.voice);
    if (b.style && styles.indexOf(b.style) < 0) styles.push(b.style);
  });
  return blocks.length + ' 段 · ' + chars + ' 字 · ' + voices.length + ' 个音色' + (styles.length ? ' · 风格 ' + styles.join('/') : '');
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function fail(mode: 'params' | 'ssml', error: string, ssml = ''): ImportResult {
  return { ok: false, mode: mode, blocks: [], ssml: ssml, warnings: [], summary: '', error: error };
}

export function parseImport(raw: string): ImportResult {
  const warnings: string[] = [];
  const payload = extractPayload(raw);
  if (!payload) return fail('params', '内容为空');

  if (/^<speak[\s>]/i.test(payload)) {
    const check = validateSsml(payload);
    if (!check.ok) return fail('ssml', 'SSML 校验失败：' + (check.error || ''), payload);
    return {
      ok: true,
      mode: 'ssml',
      blocks: [],
      ssml: payload,
      warnings: warnings,
      summary: 'SSML 源码 · ' + (check.voices || []).length + ' 个音色 · ' + humanSize(Buffer.byteLength(payload, 'utf8')),
      error: ''
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch (e) {
    return fail('params', 'JSON 解析失败：' + (e as Error).message);
  }

  let rawBlocks: Record<string, unknown>[] | null = null;
  let ssmlText = '';
  let locale = '';

  if (Array.isArray(data)) {
    rawBlocks = asBlocks(data);
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.ssml === 'string' && obj.ssml.trim()) ssmlText = obj.ssml;
    if (typeof obj.speak === 'string' && obj.speak.trim()) ssmlText = String(obj.speak);
    locale = str(obj.locale) || str(obj.lang);
    rawBlocks = asBlocks(obj.blocks) || asBlocks(obj.segments) || asBlocks(obj.sections) || asBlocks(obj.items) || asBlocks(obj.data) || asBlocks(obj.paragraphs);
    if (!rawBlocks) {
      if (typeof obj.text === 'string' || typeof obj.content === 'string') rawBlocks = [obj];
      else if (obj.blocks && typeof obj.blocks === 'object') rawBlocks = [obj.blocks as Record<string, unknown>];
    }
  }

  if (ssmlText) {
    const check = validateSsml(ssmlText);
    if (!check.ok) return fail('ssml', 'SSML 校验失败：' + (check.error || ''), ssmlText);
    return {
      ok: true,
      mode: 'ssml',
      blocks: [],
      ssml: ssmlText,
      warnings: warnings,
      summary: 'SSML 源码 · ' + (check.voices || []).length + ' 个音色',
      error: ''
    };
  }

  if (!rawBlocks || !rawBlocks.length) {
    return fail('params', '没找到可用的段落：支持 blocks 数组、单个 {text...} 对象、{mode:"ssml",ssml:"..."}，或直接粘贴 <speak>...</speak>');
  }

  const blocks: ImportBlock[] = [];
  rawBlocks.forEach(function (item, i) {
    const normalized = normalizeBlock(item || {}, warnings, '第 ' + (i + 1) + ' 段');
    if (normalized) {
      if (!normalized.locale && locale) normalized.locale = locale;
      blocks.push(normalized);
    }
  });

  if (!blocks.length) return fail('params', '解析到 ' + rawBlocks.length + ' 个对象，但没有一个含有效文本字段');

  return { ok: true, mode: 'params', blocks: blocks, ssml: '', warnings: warnings, summary: summarize(blocks), error: '' };
}

export function toBlockPayload(block: ImportBlock): BlockPayload {
  return {
    text: block.text,
    voice: block.voice,
    style: block.style || undefined,
    role: block.role || undefined,
    styleDegree: block.styleDegree === null ? undefined : block.styleDegree,
    rate: block.rate === null ? undefined : block.rate,
    pitch: block.pitch === null ? undefined : block.pitch,
    volume: block.volume === null ? undefined : block.volume,
    contour: block.contour || undefined,
    pauseAfter: block.pauseAfter || undefined,
    locale: block.locale || undefined
  };
}
