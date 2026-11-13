// 常量与静态选项
export const STORE_KEY = 'ms_tts_cfg_v2';
export const WORKSPACE_KEY = 'ms_tts_workspace_v2';

export const DATA = window.TTS_DATA || { voices: [], localeNames: {}, nicknames: {}, styles: [] };

export const FORMATS = [
  { value: 'audio-24khz-48kbitrate-mono-mp3', label: 'MP3 · 24kHz 48kbps（推荐）' },
  { value: 'audio-24khz-96kbitrate-mono-mp3', label: 'MP3 · 24kHz 96kbps' },
  { value: 'audio-16khz-32kbitrate-mono-mp3', label: 'MP3 · 16kHz 32kbps' },
  { value: 'riff-24khz-16bit-mono-pcm', label: 'WAV · 24kHz 16bit' },
  { value: 'ogg-24khz-16bit-mono-opus', label: 'OGG · Opus 24kHz' },
  { value: 'webm-24khz-16bit-mono-opus', label: 'WebM · Opus 24kHz' }
];

// mstts:express-as role —— 官方只支持 8 个取值（style 为必填）
export const ROLES = [
  { value: 'Girl', label: 'Girl · 女孩' },
  { value: 'Boy', label: 'Boy · 男孩' },
  { value: 'YoungAdultFemale', label: 'YoungAdultFemale · 年轻女性' },
  { value: 'YoungAdultMale', label: 'YoungAdultMale · 年轻男性' },
  { value: 'OlderAdultFemale', label: 'OlderAdultFemale · 中年女性' },
  { value: 'OlderAdultMale', label: 'OlderAdultMale · 中年男性' },
  { value: 'SeniorFemale', label: 'SeniorFemale · 老年女性' },
  { value: 'SeniorMale', label: 'SeniorMale · 老年男性' }
];

export const STYLE_OPTIONS = (DATA.styles || []).map(function (s) {
  return { value: s.value, label: s.label + '（' + s.value + '）' };
});

export const DEFAULT_CFG = {
  key: '',
  region: 'japaneast',
  uiMode: 'simple',
  customDomain: '',
  format: FORMATS[0].value,
  lang: 'zh-CN',
  mode: 'params'
};

// 新建段落时套用的默认参数
export const DEFAULT_BLOCK_PARAMS = {
  voice: 'zh-CN-XiaoxiaoNeural',
  style: '',
  role: '',
  styleDegree: null,
  rate: null,
  pitch: null,
  volume: null,
  contour: '',
  pauseAfter: 0
};

export const SSML_TEMPLATE = [
  '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">',
  '  <voice name="zh-CN-XiaomoNeural">',
  '    <mstts:express-as style="calm" role="YoungAdultFemale" styledegree="1.2">',
  '      <prosody pitch="-12%" rate="-8%" volume="-20%">',
  '        文案放这里',
  '      </prosody>',
  '    </mstts:express-as>',
  '  </voice>',
  '  <break time="400ms"/>',
  '</speak>'
].join('\n');

export function localeName(code) {
  if (!code) return '';
  return DATA.localeNames[code] || code;
}

export function nickOf(shortName) {
  if (DATA.nicknames[shortName]) return DATA.nicknames[shortName];
  const parts = String(shortName || '').split('-');
  const last = parts[parts.length - 1] || '';
  return last.replace(/Neural$/, '').replace(/Multilingual$/, '（多语种）').replace(/Dialects$/, '（方言）') || shortName;
}

export function normalizeVoice(v) {
  const sn = v.ShortName || v.Name || '';
  const locale = v.Locale || sn.split('-').slice(0, 2).join('-');
  return {
    ShortName: sn,
    Gender: v.Gender || '',
    Locale: locale,
    LocaleName: localeName(locale),
    Nick: nickOf(sn),
    StyleList: v.StyleList || [],
    RolePlayList: v.RolePlayList || []
  };
}

export function voiceLabel(v) {
  const gender = v.Gender === 'Female' ? '女' : (v.Gender === 'Male' ? '男' : '');
  const out = [v.Nick || nickOf(v.ShortName)];
  if (gender) out.push(gender);
  if (v.Locale) out.push(localeName(v.Locale));
  if (v.Locale) out.push(v.Locale);
  return out.join(' · ');
}

// 按音色的实际能力筛选 style / role（内置音色库没有能力信息时返回全集）
export function voiceCaps(voiceName, voices) {
  const hit = (voices || []).find(function (v) { return v.ShortName === voiceName; });
  if (!hit) return { styles: [], roles: [], known: false };
  const styles = hit.StyleList || [];
  const roles = hit.RolePlayList || [];
  return { styles: styles, roles: roles, known: styles.length > 0 || roles.length > 0 };
}

export function rolesForVoice(voiceName, voices) {
  const caps = voiceCaps(voiceName, voices);
  if (!caps.known) return ROLES;
  const allowed = ROLES.filter(function (r) { return caps.roles.indexOf(r.value) >= 0; });
  return allowed.length ? allowed : ROLES;
}

export function stylesForVoice(voiceName, voices) {
  const caps = voiceCaps(voiceName, voices);
  if (!caps.known || !caps.styles.length) return STYLE_OPTIONS;
  const allowed = STYLE_OPTIONS.filter(function (s) { return caps.styles.indexOf(s.value) >= 0; });
  return allowed.length ? allowed : STYLE_OPTIONS;
}

export function voiceCapHint(voiceName, voices) {
  const caps = voiceCaps(voiceName, voices);
  if (!caps.known) return '音色库还没拉到该音色的能力表（填 Key 后「拉取音色」可精确筛选）';
  const parts = [];
  parts.push(caps.roles.length ? '支持角色：' + caps.roles.join(' / ') : '不支持角色扮演');
  parts.push('支持风格 ' + caps.styles.length + ' 种');
  return parts.join(' · ');
}
