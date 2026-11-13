// 能力清单：给前端提示词、给 agent 当说明书用
import { AUDIO_TYPE, CHUNK_MAX, DEFAULT_FORMAT, MAX_SSML_BYTES, ROLES, STYLES } from './config.ts';

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

export const CAPABILITIES = {
  name: 'Azure 语音合成控制台（ms-tts-web）',
  version: '2.0.0',
  modes: [
    { id: 'params', title: '参数模式', desc: '按段落填写参数，后端自动拼 SSML；每段可独立设置音色、风格、角色、语速、音调、音量、段后停顿。' },
    { id: 'ssml', title: 'SSML 源码模式', desc: '直接提交完整 SSML，后端只做合法性校验与透传，可实现任意 mstts 标记（express-as、backgroundaudio、phoneme 等）。' }
  ],
  params: [
    { name: 'voice', type: 'string', scope: 'voice name', desc: '音色短名，如 zh-CN-XiaomoNeural；从 /api/voices 或内置音色库获取', example: 'zh-CN-XiaomoNeural' },
    { name: 'locale', type: 'string', scope: 'speak xml:lang', desc: '语言标签，一般与音色前缀一致', example: 'zh-CN' },
    { name: 'style', type: 'string', scope: 'mstts:express-as style', desc: '说话风格，取值随音色不同', example: 'calm' },
    { name: 'role', type: 'string', scope: 'mstts:express-as role', desc: '角色扮演，需音色支持 RolePlayList', example: 'YoungAdultFemale' },
    { name: 'styleDegree', type: 'number', range: '0.01 ~ 2', scope: 'mstts:express-as styledegree', desc: '风格强度，1 为默认', example: '1.2' },
    { name: 'rate', type: 'number', range: '-50 ~ 100', scope: 'prosody rate', desc: '语速百分比，负数变慢', example: '-8' },
    { name: 'pitch', type: 'number', range: '-50 ~ 50', scope: 'prosody pitch', desc: '音调百分比，负数变低', example: '-12' },
    { name: 'volume', type: 'number', range: '-50 ~ 50', scope: 'prosody volume', desc: '音量百分比', example: '-20' },
    { name: 'contour', type: 'string', scope: 'prosody contour', desc: '音调曲线，形如 (0%,+20Hz) (100%,+40Hz)', example: '(0%,+20Hz) (100%,+40Hz)' },
    { name: 'pauseAfter', type: 'number', range: '0 ~ 10000', scope: 'break time', desc: '段后停顿毫秒数', example: '400' }
  ],
  roles: ROLES,
  styles: STYLES,
  endpoints_official: {
    synth: 'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1',
    token: 'https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken',
    tokenWithCustomSubdomain: 'https://{resource}.cognitiveservices.azure.com/sts/v1.0/issueToken',
    voices: 'https://{region}.tts.speech.microsoft.com/cognitiveservices/voices/list',
    legacy404: 'https://{region}.api.cognitive.microsoft.com/cognitiveservices/v1 已返回 404，仅作兜底'
  },
  ssml_rules: [
    'mstts:express-as 的 style 是必填属性，缺 style 时 Azure 会忽略整个元素',
    'role 只支持 8 个取值：' + ROLES.join(' / ') + '；音色需在 RolePlayList 中声明才生效',
    'style 取值共 ' + STYLES.length + ' 个，且需该音色 StyleList 支持',
    'styledegree 取值 0.01 ~ 2，默认 1',
    'prosody 的 rate / pitch / volume 用百分比字符串，break 用毫秒'
  ],
  docs: {
    ssmlVoice: 'https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/speech-synthesis-markup-voice',
    restTts: 'https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/rest-text-to-speech'
  },
  formats: Object.keys(AUDIO_TYPE),
  defaultFormat: DEFAULT_FORMAT,
  limits: {
    maxSsmlBytes: MAX_SSML_BYTES,
    chunkMax: CHUNK_MAX,
    note: '参数模式下超长文本按句切段后逐段合成再拼接；SSML 模式下超过 ' + Math.round(MAX_SSML_BYTES / 1024) + 'KB 会被拒绝，请自行拆分多次请求。'
  },
  endpoints: {
    health: 'GET /api/health',
    capabilities: 'GET /api/capabilities',
    regions: 'GET /api/regions',
    resolve: 'GET /api/resolve?region=japaneast',
    voices: 'GET /api/voices?region=japaneast（请求头 x-tts-key）',
    preview: 'POST /api/ssml/preview（参数模式 -> 拼好的 SSML，不需要 key）',
    tts: 'POST /api/tts',
    events: 'GET /api/events（SSE 热更新）',
    reload: 'POST /api/reload'
  },
  ttsPayloadExample: {
    key: '<Azure 密钥>',
    region: 'japaneast',
    mode: 'params',
    format: 'audio-24khz-48kbitrate-mono-mp3',
    blocks: [
      {
        text: '文案放这里',
        voice: 'zh-CN-XiaomoNeural',
        style: 'calm',
        role: 'YoungAdultFemale',
        styleDegree: 1.2,
        rate: -8,
        pitch: -12,
        volume: -20,
        pauseAfter: 400
      }
    ]
  },
  ssmlExample: SSML_TEMPLATE
};
