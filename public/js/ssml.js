// SSML 组装与校验（与后端 src/ssml.ts 保持一致的行为）
export function escapeXml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function percentValue(value) {
  if (value === undefined || value === null || value === '' || Number.isNaN(Number(value))) return '';
  const n = Math.round(Number(value));
  return (n >= 0 ? '+' : '') + n + '%';
}

export const SPEAK_ATTRS = 'version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
  + 'xmlns:mstts="https://www.w3.org/2001/mstts"';

// 生成单个段落的 voice 片段（含 express-as / prosody / break）
export function buildBlockSsml(block, lang) {
  // 官方规则：style 是 mstts:express-as 的必填属性，只给 role 会被整段忽略
  const styleValue = block.style || (block.role ? 'general' : '');
  const prosodyAttrs = [];
  const rate = percentValue(block.rate);
  const pitch = percentValue(block.pitch);
  const volume = percentValue(block.volume);
  if (rate) prosodyAttrs.push('rate="' + rate + '"');
  if (pitch) prosodyAttrs.push('pitch="' + pitch + '"');
  if (volume) prosodyAttrs.push('volume="' + volume + '"');
  if (block.contour) prosodyAttrs.push('contour="' + escapeXml(block.contour) + '"');

  const body = prosodyAttrs.length
    ? '<prosody ' + prosodyAttrs.join(' ') + '>' + escapeXml(block.text) + '</prosody>'
    : escapeXml(block.text);

  const expressAttrs = [];
  if (styleValue) expressAttrs.push('style="' + escapeXml(styleValue) + '"');
  if (block.role) expressAttrs.push('role="' + escapeXml(block.role) + '"');
  if (block.styleDegree !== null && block.styleDegree !== undefined && block.styleDegree !== '') {
    expressAttrs.push('styledegree="' + Number(block.styleDegree) + '"');
  }

  const inner = expressAttrs.length
    ? '<mstts:express-as ' + expressAttrs.join(' ') + '>' + body + '</mstts:express-as>'
    : body;

  const voice = '<voice name="' + escapeXml(block.voice) + '">' + inner + '</voice>';
  const pause = Number(block.pauseAfter) > 0 ? '<break time="' + Math.round(Number(block.pauseAfter)) + 'ms"/>' : '';
  return voice + pause;
}

// 多段落 -> 完整 speak
export function buildSpeak(blocks, lang) {
  const inner = blocks.map(function (b) { return buildBlockSsml(b, lang); }).join('\n  ');
  return '<speak ' + SPEAK_ATTRS + ' xml:lang="' + escapeXml(lang || 'zh-CN') + '">\n  ' + inner + '\n</speak>';
}

// 轻量校验：根节点、标签闭合、命名空间、体积
export function validateSsml(source, maxBytes) {
  const text = String(source || '').trim();
  const limit = maxBytes || 60 * 1024;
  if (!text) return { ok: false, error: 'SSML 为空' };
  if (new Blob([text]).size > limit) return { ok: false, error: 'SSML 超过 ' + Math.round(limit / 1024) + 'KB，请拆分成多次请求' };
  if (!/^<speak[\s>]/.test(text)) return { ok: false, error: '必须以 <speak version="1.0" ...> 开头' };
  if (!/<\/speak>\s*$/.test(text)) return { ok: false, error: '必须以 </speak> 结尾' };
  if (text.indexOf('mstts:') >= 0 && text.indexOf('xmlns:mstts') < 0) {
    return { ok: false, error: '缺少 xmlns:mstts="https://www.w3.org/2001/mstts" 命名空间声明' };
  }
  if (text.indexOf('<voice') >= 0 && text.indexOf('xmlns="http://www.w3.org/2001/10/synthesis"') < 0) {
    return { ok: false, error: '缺少 xmlns="http://www.w3.org/2001/10/synthesis" 命名空间声明' };
  }
  const tagRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*?)(\/?)>/g;
  const stack = [];
  let match;
  while ((match = tagRe.exec(text)) !== null) {
    if (match[4] === '/') continue;
    if (match[1] === '/') {
      const top = stack.pop();
      if (top !== match[2]) return { ok: false, error: '标签闭合不匹配：期望 </' + (top || '?') + '>，实际 </' + match[2] + '>' };
    } else {
      stack.push(match[2]);
    }
  }
  if (stack.length) return { ok: false, error: '存在未闭合标签：<' + stack.join('>, <') + '>' };
  return { ok: true };
}

// 简单格式化：<speak ...> 下缩进，便于阅读（不改变语义）
export function prettySsml(source) {
  const compact = String(source || '').replace(/>\s*</g, '><').trim();
  let depth = 0;
  const lines = [];
  const tokens = compact.split(/(?=<)/);
  tokens.forEach(function (token) {
    const piece = token.trim();
    if (!piece) return;
    const isClose = /^<\//.test(piece);
    const isSelf = /\/>$/.test(piece);
    // 一个 token 可能是 "<tag>text" 形式
    const openMatch = piece.match(/^<(\w[^>]*)>([\s\S]*)$/);
    if (isClose) {
      depth = Math.max(0, depth - 1);
      lines.push('  '.repeat(depth) + piece.replace(/^\s+/, ''));
      return;
    }
    if (openMatch && !isSelf) {
      lines.push('  '.repeat(depth) + '<' + openMatch[1] + '>');
      const content = openMatch[2].trim();
      if (content) lines.push('  '.repeat(depth + 1) + content.replace(/^\s+/, ''));
      depth += 1;
      return;
    }
    lines.push('  '.repeat(depth) + piece);
  });
  return lines.join('\n');
}
