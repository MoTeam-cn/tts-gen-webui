// 模型输出纠偏：把「磁性男声 / 纪录片旁白 / 旁白」这类中文描述换成机器可读的官方取值
import { ROLES, STYLE_OPTIONS } from './constants.js';

export const VOICE_ALIAS = {
  '低沉男声': 'zh-CN-YunxiNeural',
  '磁性男声': 'zh-CN-YunxiNeural',
  '浑厚男声': 'zh-CN-YunyeNeural',
  '稳重男声': 'zh-CN-YunjianNeural',
  '成熟男声': 'zh-CN-YunjianNeural',
  '播音男声': 'zh-CN-YunyangNeural',
  '新闻男声': 'zh-CN-YunyangNeural',
  '正派男声': 'zh-CN-YunyangNeural',
  '青年男声': 'zh-CN-YunxiNeural',
  '老年男声': 'zh-CN-YunSongNeural',
  '老年男性': 'zh-CN-YunSongNeural',
  '老爷爷': 'zh-CN-YunSongNeural',
  '温柔女声': 'zh-CN-XiaoxiaoNeural',
  '治愈女声': 'zh-CN-XiaoxiaoNeural',
  '甜美女声': 'zh-CN-XiaoyiNeural',
  '活泼女声': 'zh-CN-XiaoyiNeural',
  '元气女声': 'zh-CN-XiaoyiNeural',
  '少女': 'zh-CN-XiaoyiNeural',
  '老年女声': 'zh-CN-XiaomoNeural',
  '老年女性': 'zh-CN-XiaomoNeural',
  '老奶奶': 'zh-CN-XiaomoNeural',
  '解说女声': 'zh-CN-XiaomoNeural',
  '旁白女声': 'zh-CN-XiaomoNeural',
  '旁白男声': 'zh-CN-YunyeNeural',
  '儿童女声': 'zh-CN-XiaoshuangNeural',
  '儿童男声': 'zh-CN-XiaoyouNeural',
  '儿童': 'zh-CN-XiaoshuangNeural',
  '台湾女声': 'zh-TW-HsiaoChenNeural',
  '台湾男声': 'zh-TW-YunJheNeural',
  '粤语女声': 'zh-HK-HiuMaanNeural',
  '粤语男声': 'zh-HK-WanLungNeural',
  '英语女声': 'en-US-AriaNeural',
  '英语男声': 'en-US-GuyNeural'
};

const STYLE_KEYWORDS = [
  ['纪录片', 'narration-professional'], ['旁白', 'narration-professional'], ['解说', 'narration-professional'],
  ['新闻', 'newscast'], ['播报', 'newscast'], ['正式', 'newscast-formal'],
  ['温柔', 'gentle'], ['治愈', 'gentle'], ['轻声', 'whispering'], ['耳语', 'whispering'],
  ['活泼', 'cheerful'], ['元气', 'cheerful'], ['欢快', 'cheerful'], ['开心', 'cheerful'],
  ['兴奋', 'excited'], ['激动', 'excited'], ['客服', 'customerservice'], ['聊天', 'chat'],
  ['对话', 'chat'], ['平静', 'calm'], ['冷静', 'calm'], ['生气', 'angry'], ['愤怒', 'angry'],
  ['悲伤', 'sad'], ['难过', 'sad'], ['低落', 'depressed'], ['严肃', 'serious'],
  ['害怕', 'fearful'], ['恐惧', 'terrified'], ['尴尬', 'embarrassed'], ['友好', 'friendly'],
  ['亲切', 'affectionate'], ['共情', 'empathetic'], ['抒情', 'lyrical'], ['朗诵', 'poetry-reading'],
  ['体育', 'sports_commentary'], ['广告', 'advertisement_upbeat'], ['冷淡', 'unfriendly'], ['助手', 'assistant']
];

const ROLE_KEYWORDS = [
  ['小女孩', 'Girl'], ['女孩', 'Girl'], ['女童', 'Girl'], ['男孩', 'Boy'], ['男童', 'Boy'],
  ['少年', 'Boy'], ['少女', 'YoungAdultFemale'], ['年轻女', 'YoungAdultFemale'], ['年轻男', 'YoungAdultMale'],
  ['青年女', 'YoungAdultFemale'], ['青年男', 'YoungAdultMale'], ['中年女', 'OlderAdultFemale'],
  ['中年男', 'OlderAdultMale'], ['老年女', 'SeniorFemale'], ['老奶奶', 'SeniorFemale'],
  ['老年男', 'SeniorMale'], ['老爷爷', 'SeniorMale']
];

const NARRATION_WORDS = ['旁白', '解说', '叙述', 'narrator', '画外音'];

const VOICE_PATTERN = /^[a-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z]+Neural$/;

// 老年女声优先挑「真的支持 SeniorFemale / OlderAdultFemale 角色」的女声
function pickSeniorFemale(state) {
  const voices = state.voices || [];
  const cn = voices.filter(function (v) {
    return String(v.ShortName || '').indexOf('zh-CN-') === 0 && v.Gender === 'Female';
  });
  const withRole = cn.find(function (v) {
    const roles = v.RolePlayList || [];
    return roles.indexOf('SeniorFemale') >= 0 || roles.indexOf('OlderAdultFemale') >= 0;
  });
  if (withRole) return withRole.ShortName;
  const xiaomo = cn.find(function (v) { return v.ShortName === 'zh-CN-XiaomoNeural'; });
  if (xiaomo) return xiaomo.ShortName;
  return cn.length ? cn[0].ShortName : 'zh-CN-XiaoxiaoNeural';
}

export function coerceVoice(value, state) {
  const raw = String(value || '').trim();
  if (!raw) return { voice: '', fix: '' };
  if (VOICE_PATTERN.test(raw)) return { voice: raw, fix: '' };
  const aliasKey = VOICE_ALIAS[raw] ? raw : Object.keys(VOICE_ALIAS).find(function (k) { return raw.indexOf(k) >= 0; });
  if (aliasKey) {
    const dynamic = /老年女|老奶奶/.test(aliasKey) ? pickSeniorFemale(state) : '';
    const target = dynamic || VOICE_ALIAS[aliasKey];
    return { voice: target, fix: '音色「' + raw + '」→ ' + target };
  }

  // 中文名匹配（如「晓晓」「云松（老年）」）
  const voices = state.voices || [];
  const byNick = voices.find(function (v) {
    const nick = String(v.Nick || '');
    const base = String(v.ShortName || '').replace(/^[a-z]{2,3}-[A-Za-z]{2,4}-/, '').replace(/Neural$/, '');
    return (nick && raw.indexOf(nick.replace(/[（(].*?[)）]/g, '')) >= 0);
  });
  if (byNick) return { voice: byNick.ShortName, fix: '音色「' + raw + '」→ ' + byNick.ShortName };

  // 按性别/年龄兜底
  const wantsMale = /男/.test(raw) && !/女/.test(raw);
  const wantsFemale = /女/.test(raw);
  const wantsOld = /老年|老奶奶|老爷爷|爷爷|奶奶/.test(raw);
  const pool = voices.filter(function (v) {
    if (!String(v.ShortName || '').startsWith('zh-CN-')) return false;
    if (wantsMale && v.Gender !== 'Male') return false;
    if (wantsFemale && v.Gender !== 'Female') return false;
    return true;
  });
  const aged = wantsOld ? pool.find(function (v) { return /老年/.test(String(v.Nick || '')); }) : null;
  const fallback = aged || pool[0] || null;
  if (fallback) return { voice: fallback.ShortName, fix: '音色「' + raw + '」→ ' + fallback.ShortName };
  const def = (state.cfg && state.cfg.voice) || 'zh-CN-XiaoxiaoNeural';
  return { voice: def, fix: '音色「' + raw + '」无法识别，已用默认 ' + def };
}

export function coerceStyle(value) {
  const raw = String(value || '').trim();
  if (!raw) return { style: '', fix: '' };
  const exact = STYLE_OPTIONS.find(function (s) { return s.value === raw; });
  if (exact) return { style: raw, fix: '' };
  const byLabel = STYLE_OPTIONS.find(function (s) { return s.label.indexOf(raw) >= 0 || raw.indexOf(s.value) >= 0; });
  if (byLabel) return { style: byLabel.value, fix: '风格「' + raw + '」→ ' + byLabel.value };
  const lowered = raw.toLowerCase();
  const enumInText = STYLE_OPTIONS.find(function (s) { return lowered.indexOf(s.value.toLowerCase()) >= 0; });
  if (enumInText) return { style: enumInText.value, fix: '风格「' + raw + '」→ ' + enumInText.value };
  const kw = STYLE_KEYWORDS.find(function (pair) { return raw.indexOf(pair[0]) >= 0; });
  if (kw) return { style: kw[1], fix: '风格「' + raw + '」→ ' + kw[1] };
  return { style: '', fix: '风格「' + raw + '」不在官方 34 个取值内，已忽略' };
}

export function coerceRole(value) {
  const raw = String(value || '').trim();
  if (!raw) return { role: '', fix: '' };
  const exact = ROLES.find(function (r) { return r.value === raw; });
  if (exact) return { role: raw, fix: '' };
  const lowered = raw.toLowerCase();
  if (NARRATION_WORDS.some(function (w) { return lowered.indexOf(w) >= 0; })) {
    return { role: '', fix: '角色「' + raw + '」不是 role 取值（旁白属于风格），已移除' };
  }
  const kw = ROLE_KEYWORDS.find(function (pair) { return raw.indexOf(pair[0]) >= 0; });
  if (kw) return { role: kw[1], fix: '角色「' + raw + '」→ ' + kw[1] };
  return { role: '', fix: '角色「' + raw + '」不是官方 8 个取值，已移除' };
}

// 逐段纠偏；返回改好的段落与改动说明
export function repairBlocks(blocks, state) {
  const fixes = [];
  const out = [];
  (blocks || []).forEach(function (block, i) {
    const label = '第 ' + (i + 1) + ' 段';
    const item = Object.assign({}, block);
    const v = coerceVoice(item.voice, state);
    if (v.fix) fixes.push(label + '：' + v.fix);
    if (v.voice) item.voice = v.voice;

    // 文案里明确写了「老年女性」「小男孩」这类，而音色性别对不上时，以文案为准
    const text = String(item.text || '');
    const textAlias = Object.keys(VOICE_ALIAS)
      .filter(function (k) { return k.length >= 3 && text.indexOf(k) >= 0; })
      .sort(function (a, b) { return b.length - a.length; })[0];
    if (textAlias) {
      const target = VOICE_ALIAS[textAlias];
      const current = (state.voices || []).find(function (x) { return x.ShortName === item.voice; }) || {};
      const wantFemale = /女/.test(textAlias);
      const wantMale = /男/.test(textAlias);
      const conflict = (wantFemale && current.Gender === 'Male') || (wantMale && current.Gender === 'Female');
      if (conflict && target !== item.voice) {
        fixes.push(label + '：文案写的是「' + textAlias + '」，音色改为 ' + target);
        item.voice = target;
      }
    }

    const s = coerceStyle(item.style);
    if (s.fix) fixes.push(label + '：' + s.fix);
    item.style = s.style;

    const r = coerceRole(item.role);
    if (r.fix) fixes.push(label + '：' + r.fix);
    item.role = r.role;

    // 旁白类写法：去掉 role 后补 narration-professional
    if (!item.role && /旁白|解说|叙述|画外音/.test(String(block.role || '')) && !item.style) {
      item.style = 'narration-professional';
      fixes.push(label + '：已补 style=narration-professional');
    }
    // style 是 express-as 的必填项
    if (item.role && !item.style) {
      item.style = 'general';
      fixes.push(label + '：有 role 缺 style，已补 style=general');
    }
    out.push(item);
  });
  return { blocks: out, fixes: fixes };
}
