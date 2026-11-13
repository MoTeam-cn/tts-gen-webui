// AI 调参助手：自然语言 -> 参数 -> 直接套到工作台
import * as store from '../store.js';

const Vue = window.Vue;

const PRESETS = [
  { label: '低沉男声 · 纪录片', text: '想要一个低沉、有磁性的男声，语速稍慢，像纪录片旁白。' },
  { label: '温柔女声 · 治愈', text: '温柔治愈的女声，语速慢一点，音量轻一些，像深夜电台。' },
  { label: '活泼女声 · 短视频', text: '活泼元气的年轻女声，语速快一点，音调稍高，适合短视频口播。' },
  { label: '正式新闻播报', text: '正式新闻播报腔，语速正常，专业严肃。' },
  { label: '儿童故事（双角色）', text: '儿童故事：旁白用温柔女声，对话部分分别用小女孩和小男孩的声音。' },
  { label: '客服', text: '客服女声，友好耐心，语速略慢。' }
];

export default {
  name: 'AgentPanel',
  template: document.getElementById('tpl-agent').innerHTML,
  setup() {
    const prompt = Vue.ref('');
    const showRaw = Vue.ref(false);

    function usePreset(text) {
      prompt.value = text;
    }

    function run() {
      return store.runAgentPrompt(prompt.value);
    }

    return {
      state: store.state,
      prompt: prompt,
      presets: PRESETS,
      showRaw: showRaw,
      usePreset: usePreset,
      run: run,
      stop: store.stopAgent,
      clear: store.clearAgent,
      retry: store.retryAgent,
      apply: store.applyAgentResult,
      openSettings: store.openSettings,
      openImport: store.openImport
    };
  }
};
