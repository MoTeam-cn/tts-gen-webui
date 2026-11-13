// 运行时配置与常量
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

export const PORT = Number(process.env.PORT || 8899);
export const HOST = process.env.HOST || '127.0.0.1';

export const MAX_BODY = 8 * 1024 * 1024;
export const MAX_SSML_BYTES = 60 * 1024;      // Azure 单次请求 SSML 上限约 64KB，留出余量
export const CHUNK_MAX = 900;                  // 参数模式下每段文本切分上限
export const TOKEN_TTL = 8 * 60 * 1000;
export const DEFAULT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

export const AUDIO_TYPE: Record<string, string> = {
  'audio-24khz-48kbitrate-mono-mp3': 'audio/mpeg',
  'audio-24khz-96kbitrate-mono-mp3': 'audio/mpeg',
  'audio-16khz-32kbitrate-mono-mp3': 'audio/mpeg',
  'audio-48khz-96kbitrate-mono-mp3': 'audio/mpeg',
  'riff-24khz-16bit-mono-pcm': 'audio/wav',
  'riff-16khz-16bit-mono-pcm': 'audio/wav',
  'webm-24khz-16bit-mono-opus': 'audio/webm',
  'ogg-24khz-16bit-mono-opus': 'audio/ogg'
};

// 官方文档（2026-11 核对）：mstts:express-as 的 style 必填，role 只支持这 8 个取值
// https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/speech-synthesis-markup-voice
export const ROLES: string[] = [
  'Girl', 'Boy', 'YoungAdultFemale', 'YoungAdultMale',
  'OlderAdultFemale', 'OlderAdultMale', 'SeniorFemale', 'SeniorMale'
];

export const STYLES: string[] = [
  'advertisement_upbeat', 'affectionate', 'angry', 'assistant', 'calm', 'chat', 'cheerful',
  'customerservice', 'depressed', 'disgruntled', 'documentary-narration', 'embarrassed',
  'empathetic', 'envious', 'excited', 'fearful', 'friendly', 'gentle', 'hopeful', 'lyrical',
  'narration-professional', 'narration-relaxed', 'newscast', 'newscast-casual', 'newscast-formal',
  'poetry-reading', 'sad', 'serious', 'shouting', 'sports_commentary', 'sports_commentary_excited',
  'terrified', 'unfriendly', 'whispering'
];

// 常见笔误 / 旧写法 -> 官方值
export const STYLE_ALIASES: Record<string, string> = {
  'sports-commentary': 'sports_commentary',
  'sports_commentary_excited': 'sports_commentary_excited',
  'documentary_narration': 'documentary-narration',
  'narration_professional': 'narration-professional',
  'narration_relaxed': 'narration-relaxed',
  'newscast_casual': 'newscast-casual',
  'newscast_formal': 'newscast-formal',
  'poetry_reading': 'poetry-reading',
  'advertisement-upbeat': 'advertisement_upbeat',
  'customer-service': 'customerservice'
};

export function normalizeStyleName(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  return STYLE_ALIASES[lower] || STYLE_ALIASES[raw] || raw;
}


// 中文口语标签 -> 官方英文取值（模型经常直接写中文，这里兜一层）
export const STYLE_LABELS: Record<string, string> = {
  '纪录片旁白': 'narration-professional',
  '旁白': 'narration-professional',
  '解说': 'narration-professional',
  '专业旁白': 'narration-professional',
  '轻松旁白': 'narration-relaxed',
  '新闻': 'newscast',
  '新闻播报': 'newscast',
  '播报': 'newscast',
  '正式新闻': 'newscast-formal',
  '轻松新闻': 'newscast-casual',
  '温柔': 'gentle',
  '治愈': 'gentle',
  '轻声': 'whispering',
  '耳语': 'whispering',
  '活泼': 'cheerful',
  '元气': 'cheerful',
  '欢快': 'cheerful',
  '兴奋': 'excited',
  '激动': 'excited',
  '客服': 'customerservice',
  '聊天': 'chat',
  '对话': 'chat',
  '平静': 'calm',
  '冷静': 'calm',
  '生气': 'angry',
  '愤怒': 'angry',
  '悲伤': 'sad',
  '难过': 'sad',
  '低落': 'depressed',
  '严肃': 'serious',
  '害怕': 'fearful',
  '恐惧': 'terrified',
  '尴尬': 'embarrassed',
  '友好': 'friendly',
  '亲切': 'affectionate',
  '共情': 'empathetic',
  '抒情': 'lyrical',
  '诗歌': 'poetry-reading',
  '朗诵': 'poetry-reading',
  '体育解说': 'sports_commentary',
  '广告': 'advertisement_upbeat',
  '冷淡': 'unfriendly',
  '助手': 'assistant'
};

export const ROLE_LABELS: Record<string, string> = {
  '女孩': 'Girl',
  '小女孩': 'Girl',
  '女童': 'Girl',
  '男孩': 'Boy',
  '小男孩': 'Boy',
  '男童': 'Boy',
  '年轻女性': 'YoungAdultFemale',
  '年轻女': 'YoungAdultFemale',
  '少女': 'YoungAdultFemale',
  '青年女性': 'YoungAdultFemale',
  '年轻男性': 'YoungAdultMale',
  '年轻男': 'YoungAdultMale',
  '青年男性': 'YoungAdultMale',
  '中年女性': 'OlderAdultFemale',
  '中年女': 'OlderAdultFemale',
  '中年男性': 'OlderAdultMale',
  '中年男': 'OlderAdultMale',
  '老年女性': 'SeniorFemale',
  '老年女': 'SeniorFemale',
  '老奶奶': 'SeniorFemale',
  '老年男性': 'SeniorMale',
  '老年男': 'SeniorMale',
  '老爷爷': 'SeniorMale',
  '旁白': '',
  '解说': '',
  '叙述者': '',
  'narrator': ''
};

// 中文/口语的音色描述 -> 常见音色短名（兜底用，最终以 voices/list 为准）
export const VOICE_LABELS: Record<string, string> = {
  '低沉男声': 'zh-CN-YunxiNeural',
  '磁性男声': 'zh-CN-YunxiNeural',
  '浑厚男声': 'zh-CN-YunyeNeural',
  '稳重男声': 'zh-CN-YunjianNeural',
  '播音男声': 'zh-CN-YunyangNeural',
  '新闻男声': 'zh-CN-YunyangNeural',
  '老年男声': 'zh-CN-YunSongNeural',
  '老年男性': 'zh-CN-YunSongNeural',
  '温柔女声': 'zh-CN-XiaoxiaoNeural',
  '治愈女声': 'zh-CN-XiaoxiaoNeural',
  '活泼女声': 'zh-CN-XiaoyiNeural',
  '元气女声': 'zh-CN-XiaoyiNeural',
  '老年女声': 'zh-CN-XiaomoNeural',
  '老年女性': 'zh-CN-XiaomoNeural',
  '儿童': 'zh-CN-XiaoshuangNeural',
  '儿童女声': 'zh-CN-XiaoshuangNeural',
  '儿童男声': 'zh-CN-XiaoyouNeural',
  '台湾女声': 'zh-TW-HsiaoChenNeural',
  '粤语女声': 'zh-HK-HiuMaanNeural',
  '英语女声': 'en-US-AriaNeural',
  '英语男声': 'en-US-GuyNeural'
};

export function mapStyleLoose(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = normalizeStyleName(raw);
  if (STYLES.indexOf(normalized) >= 0) return normalized;
  if (STYLE_LABELS[raw] !== undefined) return STYLE_LABELS[raw];
  const lowered = raw.toLowerCase();
  const hit = Object.keys(STYLE_LABELS).find(function (k) { return raw.indexOf(k) >= 0; });
  if (hit) return STYLE_LABELS[hit];
  const enumHit = STYLES.find(function (s) { return lowered.indexOf(s.toLowerCase()) >= 0; });
  return enumHit || '';
}

export function mapRoleLoose(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (ROLES.indexOf(raw) >= 0) return raw;
  if (ROLE_LABELS[raw] !== undefined) return ROLE_LABELS[raw];
  const lowered = raw.toLowerCase();
  const key = Object.keys(ROLE_LABELS).find(function (k) { return lowered.indexOf(k.toLowerCase()) >= 0; });
  return key === undefined ? '' : ROLE_LABELS[key];
}

export function mapVoiceLoose(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[a-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z]+Neural$/.test(raw)) return raw;
  if (VOICE_LABELS[raw]) return VOICE_LABELS[raw];
  const key = Object.keys(VOICE_LABELS).find(function (k) { return raw.indexOf(k) >= 0; });
  return key ? VOICE_LABELS[key] : '';
}
