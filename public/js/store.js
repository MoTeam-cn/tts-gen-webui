// 全局状态与动作（组件共享的单一数据源）
import { api, openEventStream } from './api.js';
import { buildSystemPrompt, buildUserMessage, buildRepairMessage, streamAgent, parseAgentPayload } from './agent.js';
import { repairBlocks } from './agent-repair.js';
import { buildSpeak, validateSsml } from './ssml.js';
import {
  STORE_KEY, WORKSPACE_KEY, DEFAULT_CFG, DEFAULT_BLOCK_PARAMS, DATA,
  FORMATS, SSML_TEMPLATE, normalizeVoice, localeName, voiceLabel
} from './constants.js';

const Vue = window.Vue;
const ElMessage = window.ElementPlus.ElMessage;
const ElMessageBox = window.ElementPlus.ElMessageBox;

let seq = 0;
let previewTimer = null;
let saveTimer = null;
let source = null;
let reloading = false;

export function newBlock(patch) {
  seq += 1;
  return Object.assign({
    id: 'b' + seq + '-' + Date.now().toString(36),
    enabled: true,
    text: ''
  }, DEFAULT_BLOCK_PARAMS, state.defaults, patch || {});
}

const AGENT_KEY = 'ms_tts_agent_v1';

export const state = Vue.reactive({
  cfg: Object.assign({}, DEFAULT_CFG),
  defaults: Object.assign({}, DEFAULT_BLOCK_PARAMS),
  blocks: [],
  ssmlText: SSML_TEMPLATE,
  resolved: { apiDomain: '', ttsDomain: '', ttsEndpoint: '', stsEndpoint: '' },
  regions: [],
  voices: (DATA.voices || []).map(normalizeVoice),
  voiceSource: '内置',
  localeFilter: '',
  logs: [],
  info: { chunks: 0, ms: 0, bytes: 0, endpoint: '', lang: '', voices: '' },
  preview: { ssml: '', parts: 0, error: '', loading: false },
  lastError: { message: '', hint: '', attempts: [] },
  diagnose: { visible: false, loading: false, ok: false, steps: [], region: '', format: '' },
  validation: { ok: null, message: '' },
  audioUrl: '',
  hasAudio: false,
  busy: false,
  testing: false,
  loadingVoices: false,
  hot: { connected: false, watch: false, lastEvent: '', reloads: 0, backendStale: false },
  agent: {
    baseUrl: '',
    key: '',
    model: '',
    temperature: 0.2,
    jsonMode: true,
    autoSynth: true,
    models: [],
    running: false,
    loadingModels: false,
    raw: '',
    reasoning: '',
    showReasoning: true,
    fixes: [],
    reply: '',
    error: '',
    pending: null,
    lastPrompt: '',
    history: []
  }
});

export const localeOptions = Vue.computed(function () {
  const seen = {};
  const out = [];
  state.voices.forEach(function (v) {
    if (!v.Locale || seen[v.Locale]) return;
    seen[v.Locale] = true;
    out.push({ value: v.Locale, label: localeName(v.Locale) + ' · ' + v.Locale });
  });
  return out.sort(function (a, b) { return a.label.localeCompare(b.label, 'zh'); });
});

export const voiceOptions = Vue.computed(function () {
  const filter = state.localeFilter;
  return state.voices.filter(function (v) { return !filter || v.Locale === filter; });
});

export const statusText = Vue.computed(function () {
  if (!state.cfg.key) return '未填写密钥';
  return state.hot.connected ? '通道在线' : '待测试';
});

export const statusType = Vue.computed(function () {
  if (!state.cfg.key) return 'info';
  return state.hot.connected ? 'success' : 'warning';
});

export const totalChars = Vue.computed(function () {
  return state.blocks.reduce(function (sum, b) { return sum + (b.text || '').length; }, 0);
});

export function log(level, msg) {
  state.logs.unshift({ t: clockText(), level: level, msg: String(msg) });
  if (state.logs.length > 200) state.logs.length = 200;
}

function clockText() {
  const d = new Date();
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

export function activeBlocks() {
  return state.blocks.filter(function (b) { return b.enabled && String(b.text || '').trim(); });
}

function toPayloadBlock(b) {
  const out = { text: b.text, voice: b.voice };
  if (b.style) out.style = b.style;
  if (b.role) out.role = b.role;
  if (b.styleDegree !== null && b.styleDegree !== undefined && b.styleDegree !== '') out.styleDegree = Number(b.styleDegree);
  if (b.rate !== null && b.rate !== undefined && b.rate !== '') out.rate = Number(b.rate);
  if (b.pitch !== null && b.pitch !== undefined && b.pitch !== '') out.pitch = Number(b.pitch);
  if (b.volume !== null && b.volume !== undefined && b.volume !== '') out.volume = Number(b.volume);
  if (b.contour) out.contour = b.contour;
  if (Number(b.pauseAfter) > 0) out.pauseAfter = Number(b.pauseAfter);
  if (b.locale) out.locale = b.locale;
  return out;
}

export function buildPayload(includeKey) {
  const base = {
    key: includeKey === false ? '' : state.cfg.key,
    region: state.cfg.region,
    domain: state.cfg.customDomain,
    format: state.cfg.format
  };
  if (state.cfg.mode === 'ssml') {
    return Object.assign(base, { mode: 'ssml', ssml: state.ssmlText });
  }
  return Object.assign(base, {
    mode: 'params',
    locale: state.cfg.lang,
    blocks: activeBlocks().map(toPayloadBlock)
  });
}

// ---------- 持久化 ----------
export function saveCfg() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.cfg)); } catch (e) {}
}

// 旧版本（v1）的 localStorage 键名不同，升级后自动继承，避免「key 突然没了」
export function migrateLegacyStorage() {
  try {
    const raw = localStorage.getItem('ms_tts_cfg_v1');
    if (!raw) return false;
    const old = JSON.parse(raw);
    let changed = false;
    if (old.key && !state.cfg.key) { state.cfg.key = old.key; changed = true; }
    if (old.region && state.cfg.region === DEFAULT_CFG.region && old.region !== DEFAULT_CFG.region) { state.cfg.region = old.region; changed = true; }
    if (old.customDomain && !state.cfg.customDomain) { state.cfg.customDomain = old.customDomain; changed = true; }
    if (old.format && state.cfg.format === DEFAULT_CFG.format) { state.cfg.format = old.format; changed = true; }
    if (old.voice && state.defaults.voice === DEFAULT_BLOCK_PARAMS.voice) { state.defaults.voice = old.voice; changed = true; }
    if (old.style && !state.defaults.style) { state.defaults.style = old.style; changed = true; }
    if (typeof old.rate === 'number' && state.defaults.rate === null) { state.defaults.rate = old.rate; changed = true; }
    if (typeof old.pitch === 'number' && state.defaults.pitch === null) { state.defaults.pitch = old.pitch; changed = true; }
    if (changed) {
      log('info', '已从旧版本（v1）继承上次的密钥 / 区域 / 格式设置');
      saveCfg();
    }
    return changed;
  } catch (e) {
    return false;
  }
}

export function loadCfg() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.keys(DEFAULT_CFG).forEach(function (k) {
      if (data[k] !== undefined && data[k] !== null) state.cfg[k] = data[k];
    });
  } catch (e) {}
}

export function saveWorkspace() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    saveTimer = null;
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify({
        blocks: state.blocks,
        ssmlText: state.ssmlText,
        defaults: state.defaults
      }));
    } catch (e) {}
  }, 400);
}

export function loadWorkspace() {
  let loaded = false;
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.blocks) && data.blocks.length) {
        state.blocks = data.blocks.map(function (b) { return newBlock(b); });
        loaded = true;
      }
      if (data.ssmlText) state.ssmlText = data.ssmlText;
      if (data.defaults) Object.assign(state.defaults, data.defaults);
    }
  } catch (e) {}
  if (!loaded) {
    state.blocks = [
      newBlock({
        text: '你好，这是微软 Azure 语音合成的演示文案。段落可以单独设置音色、风格、角色、语速与停顿。',
        voice: 'zh-CN-XiaoxiaoNeural'
      })
    ];
  }
}

// ---------- 区域与音色 ----------
export async function onRegionChange() {
  saveCfg();
  try {
    const data = await api.resolve(state.cfg.region);
    state.resolved.apiDomain = data.apiDomain || '';
    state.resolved.ttsDomain = data.ttsDomain || '';
    state.resolved.ttsEndpoint = data.ttsEndpoint || '';
    state.resolved.stsEndpoint = data.stsEndpoint || '';
    log('info', '区域 ' + (data.id || '-') + ' → ' + state.resolved.apiDomain + ' / ' + state.resolved.ttsDomain);
  } catch (e) {
    log('err', '区域映射失败：' + e.message);
  }
}

export async function loadRegions() {
  try {
    const data = await api.regions();
    state.regions = data.regions || [];
    log('info', '已加载 ' + state.regions.length + ' 个区域');
    await onRegionChange();
  } catch (e) {
    log('err', '加载区域列表失败：' + e.message);
  }
}

export async function loadVoices(interactive) {
  if (!state.cfg.key) {
    ElMessage.warning('请先填写订阅密钥 Key');
    return false;
  }
  state.loadingVoices = true;
  try {
    const data = await api.voices(state.cfg.region, state.cfg.customDomain, state.cfg.key);
    const list = (data.voices || []).filter(function (v) { return v && (v.ShortName || v.Name); });
    if (!list.length) throw new Error('返回音色列表为空');
    state.voices = list.map(normalizeVoice);
    state.voiceSource = '微软全量';
    log('ok', '拉取到 ' + list.length + ' 个音色（' + data.host + '）');
    if (interactive !== false) ElMessage.success('已获取 ' + list.length + ' 个音色');
    return true;
  } catch (e) {
    log('err', '拉取音色失败：' + e.message);
    (e.attempts || []).forEach(function (a) { log('err', a); });
    if (interactive !== false) ElMessage.error('拉取音色失败，详见运行日志');
    return false;
  } finally {
    state.loadingVoices = false;
  }
}

export async function testConn() {
  if (!state.cfg.key) {
    ElMessage.warning('请先填写订阅密钥 Key');
    return;
  }
  state.testing = true;
  const ok = await loadVoices(false);
  state.testing = false;
  if (ok) ElMessage.success('连接正常：密钥有效，区域 ' + state.cfg.region);
  else ElMessage.error('连接失败，详见运行日志');
}

// ---------- 一键诊断 ----------
export function openDiagnose() {
  state.diagnose.visible = true;
}

export async function runDiagnose() {
  state.diagnose.loading = true;
  try {
    const payload = { key: state.cfg.key, region: state.cfg.region, domain: state.cfg.customDomain, format: state.cfg.format };
    const data = await api.diagnose(payload);
    state.diagnose.ok = !!data.ok;
    state.diagnose.steps = data.steps || [];
    state.diagnose.region = data.region || '';
    state.diagnose.format = data.format || '';
    log(data.ok ? 'ok' : 'warn', '诊断完成：' + (data.ok ? '全链路可用' : '有步骤失败，详见诊断窗口'));
  } catch (e) {
    state.diagnose.steps = [{ name: '诊断请求失败', ok: false, detail: e.message }];
    state.diagnose.ok = false;
    log('err', '诊断失败：' + e.message);
  } finally {
    state.diagnose.loading = false;
  }
}

// ---------- Agent（自然语言调参） ----------
export function saveAgentCfg() {
  try {
    localStorage.setItem(AGENT_KEY, JSON.stringify({
      baseUrl: state.agent.baseUrl,
      key: state.agent.key,
      model: state.agent.model,
      temperature: state.agent.temperature,
      jsonMode: state.agent.jsonMode,
      autoSynth: state.agent.autoSynth
    }));
  } catch (e) {}
}

export function loadAgentCfg() {
  try {
    const raw = localStorage.getItem(AGENT_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.baseUrl) state.agent.baseUrl = data.baseUrl;
    if (data.key) state.agent.key = data.key;
    if (data.model) state.agent.model = data.model;
    if (typeof data.temperature === 'number') state.agent.temperature = data.temperature;
    if (typeof data.jsonMode === 'boolean') state.agent.jsonMode = data.jsonMode;
    if (typeof data.autoSynth === 'boolean') state.agent.autoSynth = data.autoSynth;
  } catch (e) {}
}

export async function fetchAgentModels() {
  if (!state.agent.baseUrl) {
    ElMessage.warning('请先填模型地址，例如 https://api.openai.com/v1');
    return false;
  }
  state.agent.loadingModels = true;
  try {
    const data = await api.agentModels(state.agent);
    const models = data.models || [];
    state.agent.models = models;
    if (!state.agent.model && models.length) state.agent.model = models[0];
    log('ok', '模型列表拉取成功：' + models.length + ' 个（' + (models.slice(0, 3).join(', ') || '-') + '）');
    ElMessage.success('已拉取 ' + models.length + ' 个模型');
    saveAgentCfg();
    return true;
  } catch (e) {
    state.agent.error = e.message;
    log('err', '拉取模型失败：' + e.message);
    ElMessage.error('拉取模型失败：' + e.message.slice(0, 80));
    return false;
  } finally {
    state.agent.loadingModels = false;
  }
}

export async function testAgent() {
  if (!state.agent.baseUrl || !state.agent.model) {
    ElMessage.warning('先填模型地址和模型名');
    return;
  }
  state.agent.loadingModels = true;
  try {
    await api.agentModels(state.agent);
    ElMessage.success('连通正常：地址可访问、密钥可用');
    log('ok', 'Agent 通道测试通过（' + state.agent.model + '）');
  } catch (e) {
    log('err', 'Agent 通道测试失败：' + e.message);
    ElMessage.error('测试失败：' + e.message.slice(0, 80));
  } finally {
    state.agent.loadingModels = false;
  }
}

let agentAbort = null;

export function stopAgent() {
  if (agentAbort) {
    try { agentAbort.abort(); } catch (e) {}
    agentAbort = null;
  }
  state.agent.running = false;
  log('warn', '已停止等待模型响应');
}

async function askAgent(messages, onDelta, signal) {
  return streamAgent(state.agent, messages, onDelta, signal, function (_piece, all) {
    state.agent.reasoning = all;
  });
}

export async function runAgentPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (!text) {
    ElMessage.warning('先描述你想要的声音');
    return false;
  }
  if (!state.agent.baseUrl || !state.agent.model) {
    ElMessage.warning('先在「设置 → Agent 模型」里填模型地址并选模型');
    openSettings();
    return false;
  }
  state.agent.running = true;
  state.agent.lastPrompt = text;
  state.agent.error = '';
  state.agent.raw = '';
  state.agent.reasoning = '';
  state.agent.fixes = [];
  state.agent.reply = '';
  state.agent.pending = null;
  agentAbort = new AbortController();
  const started = Date.now();

  const baseMessages = [{ role: 'system', content: buildSystemPrompt(state) }]
    .concat(state.agent.history.slice(-4))
    .concat([{ role: 'user', content: buildUserMessage(state, text) }]);

  try {
    log('info', '请求 agent 调参（' + state.agent.model + (state.agent.jsonMode ? ' · JSON 模式' : '') + '）');
    let full = await askAgent(baseMessages, function (_piece, all) { state.agent.raw = all; }, agentAbort.signal);
    state.agent.raw = full;
    let parsed = parseAgentPayload(full);

    // 模型跑偏（反问/解释/非 JSON）时，自动纠正一次
    if (!parsed.ok) {
      log('warn', '模型输出不是 JSON，自动纠正重试一次：' + parsed.reason);
      const repairMessages = baseMessages.concat([
        { role: 'assistant', content: full.slice(0, 2000) },
        { role: 'user', content: buildRepairMessage() }
      ]);
      const retried = await askAgent(repairMessages, function (piece, all) {
        state.agent.raw = full + '\n\n--- 自动纠正重试 ---\n' + all;
      }, agentAbort.signal);
      parsed = parseAgentPayload(retried);
      state.agent.raw = full + '\n\n--- 自动纠正重试 ---\n' + retried;
      if (parsed.ok) full = retried;
    }

    state.agent.history = state.agent.history.concat([
      { role: 'user', content: text },
      { role: 'assistant', content: parsed.ok ? (parsed.jsonText || '') : String(full).slice(0, 400) }
    ]).slice(-8);

    if (!parsed.ok) {
      state.agent.error = parsed.reason;
      log('err', 'agent 输出仍无法解析：' + parsed.reason);
      ElMessage.warning('模型没按 JSON 输出，可点「手动看看/改改」或换个模型再试');
      return false;
    }
    state.agent.pending = parsed;
    state.agent.reply = parsed.reply || '';
    log('ok', 'agent 返回参数（' + (Date.now() - started) + 'ms）：' + (parsed.reply || '已生成配置'));
    return true;
  } catch (e) {
    if (e.name === 'AbortError') {
      log('warn', 'agent 调用已取消');
    } else {
      state.agent.error = e.message;
      log('err', 'agent 调用失败：' + e.message);
      ElMessage.error('agent 调用失败：' + e.message.slice(0, 90));
    }
    return false;
  } finally {
    state.agent.running = false;
    agentAbort = null;
  }
}

// 把 agent 结果套到工作台（走统一导入解析，顺带做字段校验）
export async function applyAgentResult(options) {
  const pending = state.agent.pending;
  if (!pending) return false;
  const opts = options || {};

  // 模型常见错误：把「磁性男声 / 纪录片旁白 / 旁白」写成中文描述，这里统一纠偏
  let jsonText = pending.jsonText;
  if (Array.isArray(pending.blocks)) {
    const repaired = repairBlocks(pending.blocks, state);
    state.agent.fixes = repaired.fixes;
    if (repaired.fixes.length) {
      repaired.fixes.forEach(function (f) { log('warn', '纠偏：' + f); });
    }
    jsonText = JSON.stringify(repaired.blocks);
  }

  const result = await parseImportText(jsonText);
  const ok = applyImport(result, opts.target || 'replace');
  if (!ok) return false;
  state.agent.pending = null;
  if (opts.synthesize !== false) {
    if (!state.cfg.key) {
      ElMessage.warning('参数已应用，但还没填 Azure 密钥，暂时无法合成');
      openSettings();
      return true;
    }
    await synthesize();
  }
  return true;
}

export function retryAgent() {
  if (!state.agent.lastPrompt) return Promise.resolve(false);
  return runAgentPrompt(state.agent.lastPrompt);
}

export function clearAgent() {
  state.agent.raw = '';
  state.agent.reasoning = '';
  state.agent.fixes = [];
  state.agent.reply = '';
  state.agent.error = '';
  state.agent.pending = null;
  state.agent.history = [];
}

// ---------- 导入弹窗（手动兜底） ----------
export const importVisible = Vue.ref(false);

export function openImport() {
  importVisible.value = true;
}

// ---------- 设置抽屉（两套界面共用同一份设置） ----------
export const settingsVisible = Vue.ref(false);

export function openSettings() {
  settingsVisible.value = true;
}

export function closeSettings() {
  settingsVisible.value = false;
}

// ---------- 界面模式 ----------
export function setUiMode(mode) {
  state.cfg.uiMode = mode === 'advanced' ? 'advanced' : 'simple';
  if (state.cfg.uiMode === 'simple' && !state.blocks.length) addBlock();
  saveCfg();
}

export const quickBlock = Vue.computed(function () {
  return state.blocks[0] || null;
});

// ---------- 导入 AI 输出 ----------
export async function parseImportText(raw) {
  try {
    const result = await api.importText(raw);
    return result;
  } catch (e) {
    return { ok: false, mode: 'params', blocks: [], ssml: '', warnings: [], summary: '', error: e.message };
  }
}

export function applyImport(result, target) {
  if (!result || !result.ok) {
    log('err', '导入失败：' + ((result && result.error) || '未知错误'));
    return false;
  }
  (result.warnings || []).forEach(function (w) { log('warn', '导入提示：' + w); });

  if (result.mode === 'ssml') {
    state.cfg.mode = 'ssml';
    state.ssmlText = result.ssml;
    state.cfg.uiMode = 'advanced';
    refreshPreview();
    log('ok', '已导入 SSML（' + result.summary + '）');
    saveCfg();
    return true;
  }

  const imported = (result.blocks || []).map(function (b) {
    return newBlock({
      text: b.text,
      voice: b.voice,
      style: b.style || '',
      role: b.role || '',
      styleDegree: b.styleDegree === null || b.styleDegree === undefined ? null : b.styleDegree,
      rate: b.rate === null || b.rate === undefined ? null : b.rate,
      pitch: b.pitch === null || b.pitch === undefined ? null : b.pitch,
      volume: b.volume === null || b.volume === undefined ? null : b.volume,
      contour: b.contour || '',
      pauseAfter: b.pauseAfter || 0
    });
  });

  if (target === 'append') {
    const existing = state.blocks.filter(function (b) { return String(b.text || '').trim(); });
    state.blocks = existing.concat(imported);
  } else {
    state.blocks = imported;
  }

  state.cfg.mode = 'params';
  if (state.blocks.length > 1) state.cfg.uiMode = 'advanced';
  saveWorkspace();
  refreshPreview();
  log('ok', '已导入 ' + imported.length + ' 段（' + result.summary + '）');
  saveCfg();
  return true;
}

export async function importText(raw, target) {
  const result = await parseImportText(raw);
  return applyImport(result, target || 'replace');
}

// ---------- 段落操作 ----------
// role 必须配 style（官方要求 style 必填），否则整段 express-as 会被忽略
export function ensureStyleForRole(block) {
  if (block && block.role && !block.style) block.style = 'general';
}

export function addBlock(patch) {
  state.blocks.push(newBlock(patch));
  schedulePreview();
}

export function removeBlock(index) {
  if (state.blocks.length <= 1) {
    ElMessage.warning('至少保留一个段落');
    return;
  }
  state.blocks.splice(index, 1);
  schedulePreview();
}

export function duplicateBlock(index) {
  const copy = newBlock(Object.assign({}, state.blocks[index], { id: undefined }));
  state.blocks.splice(index + 1, 0, copy);
  schedulePreview();
}

export function moveBlock(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.blocks.length) return;
  const item = state.blocks.splice(index, 1)[0];
  state.blocks.splice(target, 0, item);
  schedulePreview();
}

export function clearBlocks() {
  ElMessageBox.confirm('清空所有段落？', '确认', { type: 'warning' }).then(function () {
    state.blocks = [newBlock()];
    schedulePreview();
    ElMessage.success('已清空');
  }).catch(function () {});
}

export function applyDefaultsToAll() {
  state.blocks.forEach(function (b) {
    b.style = state.defaults.style;
    b.role = state.defaults.role;
    b.styleDegree = state.defaults.styleDegree;
    b.rate = state.defaults.rate;
    b.pitch = state.defaults.pitch;
    b.volume = state.defaults.volume;
    b.pauseAfter = state.defaults.pauseAfter;
  });
  schedulePreview();
  ElMessage.success('已把默认参数应用到全部段落');
}

export function insertSample() {
  state.blocks = [
    newBlock({
      text: '窗外下着小雨，他把伞收起来，慢慢地走进了屋子。',
      voice: 'zh-CN-YunxiNeural',
      style: 'calm',
      role: 'YoungAdultMale',
      rate: -8,
      pitch: -12,
      pauseAfter: 500
    }),
    newBlock({
      text: '妈，我回来了。今天的风真大。',
      voice: 'zh-CN-XiaoxiaoNeural',
      style: 'cheerful',
      role: 'YoungAdultFemale',
      rate: 4,
      pitch: 6,
      pauseAfter: 300
    })
  ];
  schedulePreview();
}

// ---------- SSML 预览与校验 ----------
export function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(function () {
    previewTimer = null;
    refreshPreview();
  }, 400);
}

export async function refreshPreview() {
  if (state.cfg.mode === 'ssml') {
    const result = validateSsml(state.ssmlText);
    state.validation = { ok: result.ok, message: result.ok ? 'SSML 校验通过' : result.error };
    state.preview.ssml = state.ssmlText;
    state.preview.parts = 1;
    return;
  }
  state.preview.loading = true;
  try {
    const data = await api.preview(buildPayload(false));
    state.preview.ssml = data.ssml || '';
    state.preview.parts = data.parts || 0;
    state.preview.error = '';
    state.validation = { ok: true, message: 'SSML 生成正常（' + data.parts + ' 段请求）' };
  } catch (e) {
    state.preview.error = e.message;
    state.validation = { ok: false, message: e.message };
  } finally {
    state.preview.loading = false;
  }
}

export function localRebuildPreview() {
  const blocks = activeBlocks().map(toPayloadBlock);
  if (!blocks.length) {
    state.preview.ssml = '';
    state.preview.parts = 0;
    return;
  }
  let text = buildSpeak(blocks, state.cfg.lang || 'zh-CN');
  state.preview.ssml = text;
}

// 参数模式 -> 源码模式：用后端预览结果填充，保证一致
export function switchToSsmlMode() {
  localRebuildPreview();
  if (state.preview.ssml) state.ssmlText = state.preview.ssml;
  state.cfg.mode = 'ssml';
  refreshPreview();
  saveCfg();
}

export function switchToParamsMode() {
  state.cfg.mode = 'params';
  refreshPreview();
  saveCfg();
}

export function resetSsmlTemplate() {
  state.ssmlText = SSML_TEMPLATE;
  refreshPreview();
}

// ---------- 合成 ----------
export async function synthesize() {
  if (!state.cfg.key) {
    ElMessage.warning('请先填写订阅密钥 Key');
    return;
  }
  if (state.cfg.mode === 'params' && !activeBlocks().length) {
    ElMessage.warning('没有可合成的段落（请填写文本或启用段落）');
    return;
  }
  if (state.cfg.mode === 'ssml') {
    const result = validateSsml(state.ssmlText);
    if (!result.ok) {
      state.validation = { ok: false, message: result.error };
      ElMessage.error('SSML 校验失败：' + result.error);
      return;
    }
  }
  state.busy = true;
  state.lastError = { message: '', hint: '', attempts: [] };
  const started = performance.now();
  try {
    const data = await api.tts(buildPayload(true));
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(data.blob);
    state.hasAudio = true;
    state.info = {
      chunks: data.chunks,
      ms: data.ms || Math.round(performance.now() - started),
      bytes: data.blob.size,
      endpoint: data.endpoint,
      lang: data.lang,
      voices: data.voices
    };
    log('ok', '合成成功 · ' + (data.blob.size / 1024).toFixed(1) + ' KB · ' + state.info.ms + ' ms · ' + (data.endpoint || '未知端点'));
    if (data.warnings) {
      data.warnings.split(' | ').filter(Boolean).forEach(function (w) { log('warn', '后端提示：' + w); });
    }
    const audio = document.getElementById('tts-player');
    if (audio) {
      audio.src = state.audioUrl;
      audio.play().catch(function () {});
    }
  } catch (e) {
    state.lastError = { message: String(e.message || ''), hint: e.hint || '', attempts: e.attempts || [] };
    log('err', '合成失败：' + e.message);
    if (e.hint) log('err', e.hint);
    (e.attempts || []).forEach(function (a) { log('err', a); });
    ElMessage.error(String(e.message).slice(0, 140));
  } finally {
    state.busy = false;
  }
}

export function downloadAudio() {
  if (!state.hasAudio || !state.audioUrl) return;
  const ext = state.cfg.format.indexOf('riff') === 0 ? 'wav'
    : state.cfg.format.indexOf('ogg') === 0 ? 'ogg'
      : state.cfg.format.indexOf('webm') === 0 ? 'webm' : 'mp3';
  const d = new Date();
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  const stamp = String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  const a = document.createElement('a');
  a.href = state.audioUrl;
  a.download = 'tts-' + stamp + '.' + ext;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function copyText(value, tip) {
  if (!value) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(function () {
      ElMessage.success(tip || '已复制');
    }).catch(function () { ElMessage.warning('复制失败，请手动选择'); });
  } else {
    ElMessage.warning('当前环境不支持自动复制');
  }
}

export function resetAll() {
  ElMessageBox.confirm('将清空本机保存的配置与工作区（含订阅密钥、段落与 SSML），确定继续？', '重置', {
    type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消'
  }).then(function () {
    Object.assign(state.cfg, DEFAULT_CFG);
    Object.assign(state.defaults, DEFAULT_BLOCK_PARAMS);
    state.blocks = [newBlock()];
    state.ssmlText = SSML_TEMPLATE;
    state.hasAudio = false;
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = '';
    state.info = { chunks: 0, ms: 0, bytes: 0, endpoint: '', lang: '', voices: '' };
    saveCfg();
    saveWorkspace();
    onRegionChange();
    refreshPreview();
    log('info', '已重置配置与工作区');
    ElMessage.success('已重置');
  }).catch(function () {});
}

// ---------- 热更新（events 接口） ----------
export function connectEvents() {
  if (source) {
    try { source.close(); } catch (e) {}
    source = null;
  }
  source = openEventStream({
    onOpen: function () { log('info', '热更新通道连接中…'); },
    onHello: function (data) {
      state.hot.connected = true;
      state.hot.watch = !!data.watch;
      log('ok', '热更新已连接（events）· 文件监听' + (data.watch ? '已开启' : '未开启') + ' · 在线面板 ' + (data.clients || 1) + ' 个');
    },
    onReload: function (data) {
      state.hot.lastEvent = data.message || '收到更新事件';
      if (data.type === 'backend') {
        state.hot.backendStale = true;
        log('warn', '后端文件更新（' + (data.file || '-') + '），需重启 node src/server.ts');
        ElMessage.warning('后端代码已更新，请重启服务后再刷新');
        return;
      }
      if (reloading) return;
      reloading = true;
      state.hot.reloads += 1;
      log('ok', '收到刷新事件（' + (data.file || '-') + '），1 秒后刷新页面');
      ElMessage.success('前端文件已更新，正在刷新…');
      setTimeout(function () { location.reload(); }, 900);
    },
    onError: function () {
      if (state.hot.connected) log('err', '热更新通道断开，浏览器会自动重连');
      state.hot.connected = false;
    }
  });
  if (!source) {
    log('err', '当前浏览器不支持 EventSource，热更新不可用');
  }
}

export async function reloadNow(scope) {
  try {
    const data = await api.reload(scope || 'frontend');
    log('info', '已触发 events 事件：' + (data.scope || 'frontend') + ' · 订阅者 ' + (data.clients || 0) + ' 个');
  } catch (e) {
    log('err', '触发失败：' + e.message);
  }
}

// ---------- 初始化 ----------
export function init() {
  loadCfg();
  loadAgentCfg();
  Vue.watch(function () { return state.agent; }, saveAgentCfg, { deep: true });
  migrateLegacyStorage();
  loadWorkspace();
  if (!state.cfg.uiMode) state.cfg.uiMode = 'simple';
  state.voices = (DATA.voices || []).map(normalizeVoice);
  connectEvents();
  loadRegions();
  refreshPreview();
  log('info', '工作台就绪 · 内置音色 ' + state.voices.length + ' 个 · ' + Object.keys(DATA.localeNames).length + ' 种语言');
  Vue.watch(state.cfg, saveCfg, { deep: true });
  Vue.watch(function () { return state.blocks; }, saveWorkspace, { deep: true });
  Vue.watch(function () { return state.ssmlText; }, function () {
    saveWorkspace();
    if (state.cfg.mode === 'ssml') schedulePreview();
  });
  Vue.watch(function () { return state.blocks; }, function () {
    if (state.cfg.mode === 'params') schedulePreview();
  }, { deep: true });
}

export { voiceLabel };
