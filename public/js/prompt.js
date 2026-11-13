// 生成「交给 agent 的提示词」——让外部 agent 知道这个工具支持什么、该填什么
import { ROLES, STYLE_OPTIONS, FORMATS, SSML_TEMPLATE } from './constants.js';

const LINES = [];

function section(title, body) {
  LINES.push('');
  LINES.push('## ' + title);
  LINES.push(body);
}

export function buildPrompt(state) {
  const blocks = state && state.blocks ? state.blocks : [];
  const first = blocks[0] || {};
  const cfg = state && state.cfg ? state.cfg : {};
  const lang = cfg.lang || 'zh-CN';
  const voice = first.voice || 'zh-CN-XiaomoNeural';
  const region = cfg.region || 'japaneast';

  const out = [];
  const push = function (line) { out.push(line); };

  push('你是 Azure 语音合成（Microsoft Speech / Azure TTS）配置助手。');
  push('用户正在使用一个本地工具「ms-tts-web」，它把参数拼成 SSML 并调用 Azure 合成语音。');
  push('请根据用户的文案与语气需求，直接产出该工具可以接受的内容：要么是【参数模式 JSON】，要么是【完整 SSML】。');
  push('');

  push('### 一、两种提交方式（二选一）');
  push('1. 参数模式：给出一段 JSON 的 blocks 数组，工具自动拼 SSML。适合普通文案。');
  push('2. SSML 源码模式：给出完整 <speak>...</speak>，工具只校验并透传。适合需要 phoneme、backgroundaudio、多 voice 拼接、复杂 prosody contour 等高级写法。');
  push('');

  push('### 二、参数模式字段（blocks[] 内每一项）');
  push('| 字段 | 类型 | 取值范围 | 对应 SSML | 说明 |');
  push('| --- | --- | --- | --- | --- |');
  push('| text | string | 建议 <= 900 字/段 | prosody 内文本 | 要读的文案，特殊字符会被自动转义 |');
  push('| voice | string | 音色短名 | <voice name="..."> | 如 zh-CN-XiaomoNeural、zh-CN-XiaoxiaoNeural、ja-JP-NanamiNeural |');
  push('| locale | string | 语言标签 | speak xml:lang | 一般留空，工具按 voice 前缀推断 |');
  push('| style | string | 见风格清单 | mstts:express-as style | 如 calm、cheerful、newscast；不可用时 Azure 报错 |');
  push('| role | string | 见角色清单 | mstts:express-as role | 角色扮演，需音色支持 RolePlayList |');
  push('| styleDegree | number | 0.01 ~ 2 | mstts:express-as styledegree | 风格强度，1 为默认 |');
  push('| rate | number | -50 ~ 100 | prosody rate | 语速百分比，负数更慢 |');
  push('| pitch | number | -50 ~ 50 | prosody pitch | 音调百分比，负数更低 |');
  push('| volume | number | -50 ~ 50 | prosody volume | 音量百分比 |');
  push('| contour | string | 如 (0%,+20Hz) (100%,+40Hz) | prosody contour | 音调曲线，高级用法 |');
  push('| pauseAfter | number | 0 ~ 10000 | <break time="Nms"/> | 该段读完后的停顿毫秒数 |');
  push('');

  push('### 三、角色（role）可取值（微软官方只有这 8 个）');
  push(ROLES.map(function (r) { return r.value + '（' + r.label.split('·')[1] + '）'; }).join('、'));
  push('注意：role 必须配合 style 使用（style 是 mstts:express-as 的必填属性，只给 role 会被整段忽略）；且该音色需在 voices/list 的 RolePlayList 中声明支持，否则会报错或被忽略。');
  push('旁白/Narrator 不是 role 取值，请用 style="narration-professional" 或 newscast。');
  push('');

  push('### 四、说话风格（style）常用取值');
  push(STYLE_OPTIONS.slice(0, 24).map(function (s) { return s.value + '（' + s.label.split('（')[0] + '）'; }).join('、'));
  push('注意：风格与角色都是「音色支持才可用」，不确定时先不加，或用 general。');
  push('');

  push('### 五、输出格式（format）可选值');
  push(FORMATS.map(function (f) { return f.value; }).join('、'));
  push('默认 ' + FORMATS[0].value + '。');
  push('');

  push('### 六、SSML 模板（源码模式直接照着改）');
  push(SSML_TEMPLATE);
  push('');

  push('### 七、SSML 硬性规则（违反会报错）');
  push('1. 根节点必须是 <speak>，且带 version="1.0"、xmlns="http://www.w3.org/2001/10/synthesis"、xmlns:mstts="https://www.w3.org/2001/mstts"、xml:lang="' + lang + '"。');
  push('2. 用了 mstts: 前缀就必须声明 xmlns:mstts，否则校验失败。');
  push('3. 文本里的 & < > " 必须转义成 &amp; &lt; &gt; &quot;，否则 SSML 非法。');
  push('4. 单次请求 SSML 不超过 60KB；长文案请拆成多次请求。');
  push('4.1 mstts:express-as 的 style 必填；role 只能是上面 8 个值，且需音色支持。');
  push('5. <prosody> 的 rate/pitch/volume 用百分比字符串（如 -8%），<break> 用毫秒（400ms）。');
  push('6. 标签必须闭合，express-as 只能包在 <voice> 内。');
  push('');

  push('### 八、参数模式 JSON 示例（用户点「导入 JSON / SSML」直接粘贴即可）');
  push(JSON.stringify([
    {
      text: '文案放这里',
      voice: voice,
      style: 'calm',
      role: 'YoungAdultFemale',
      styleDegree: 1.2,
      rate: -8,
      pitch: -12,
      volume: -20,
      pauseAfter: 400
    }
  ], null, 2));
  push('');

  push('### 九、当前面板状态（供你参考，可沿用）');
  push('- 区域：' + region + '（后端自动映射域名，不需要你填域名）');
  push('- 语言：' + lang);
  push('- 当前音色：' + voice);
  push('- 段落数：' + blocks.length);
  push('');

  push('### 十、请你输出');
  push('按用户需求给出：');
  push('A. 若是参数模式：只输出 { blocks: [...] } 或 blocks 数组的 JSON（用户会整段粘贴进「导入」弹窗，不要加解释）；');
  push('B. 若是 SSML：只输出完整可提交的 SSML。');
  push('如果需要多种语气连续朗读，请拆成多个 block（每段独立 voice/style/rate/pitch）；段间停顿用 pauseAfter 控制。');

  return out.join('\n');
}

// 精简版：只保留最关键的信息，方便快速贴给 agent
export function buildShortPrompt(state) {
  const cfg = state && state.cfg ? state.cfg : {};
  return [
    '用 Azure 语音合成写一段 SSML 或参数 JSON，交给本地工具 ms-tts-web 直接合成。',
    '',
    '可用字段（参数模式 blocks[] 每项）：text, voice, locale, style, role, styleDegree(0.01~2), rate(-50~100), pitch(-50~50), volume(-50~50), contour, pauseAfter(0~10000)。',
    'role 取值：' + ROLES.map(function (r) { return r.value; }).join(', ') + '。',
    'style 取值随音色不同，常用：calm, cheerful, sad, angry, newscast, customerservice, chat, whispering, serious, affectionate。',
    '',
    'SSML 骨架：',
    SSML_TEMPLATE,
    '',
    '规则：必须是 <speak> 根节点且声明 xmlns 与 xmlns:mstts；文本里的 & < > " 要转义；单次不超过 60KB；prosody 用百分比，break 用 ms。',
    '当前：区域 ' + (cfg.region || 'japaneast') + '，语言 ' + (cfg.lang || 'zh-CN') + '。',
    '直接输出可粘贴的 JSON 或 SSML，不要解释。'
  ].join('\n');
}
