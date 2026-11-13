// 应用入口：组装组件并挂载
import CfgPanel from './components/cfg-panel.js';
import ParamsPanel from './components/params-panel.js';
import ScriptPanel from './components/script-panel.js';
import SsmlPanel from './components/ssml-panel.js';
import ResultPanel from './components/result-panel.js';
import LogPanel from './components/log-panel.js';
import PromptDialog from './components/prompt-dialog.js';
import QuickPanel from './components/quick-panel.js';
import ImportDialog from './components/import-dialog.js';
import SummaryCard from './components/summary-card.js';
import AgentPanel from './components/agent-panel.js';
import AgentConfig from './components/agent-config.js';
import * as store from './store.js';

const Vue = window.Vue;

const App = {
  template: document.getElementById('tpl-app').innerHTML,
  components: {
    CfgPanel: CfgPanel,
    ParamsPanel: ParamsPanel,
    ScriptPanel: ScriptPanel,
    SsmlPanel: SsmlPanel,
    ResultPanel: ResultPanel,
    LogPanel: LogPanel,
    PromptDialog: PromptDialog,
    QuickPanel: QuickPanel,
    ImportDialog: ImportDialog,
    SummaryCard: SummaryCard,
    AgentPanel: AgentPanel,
    AgentConfig: AgentConfig
  },
  setup() {
    const showPrompt = Vue.ref(false);
    const showImport = Vue.ref(false);

    const uiMode = Vue.computed({
      get: function () { return store.state.cfg.uiMode || 'simple'; },
      set: function (value) { store.setUiMode(value); }
    });

    Vue.onMounted(function () { store.init(); });

    return {
      state: store.state,
      statusText: store.statusText,
      statusType: store.statusType,
      uiMode: uiMode,
      setUiMode: store.setUiMode,
      showPrompt: showPrompt,
      showImport: showImport,
      importVisible: store.importVisible,
      openImport: store.openImport,
      settingsVisible: store.settingsVisible,
      openSettings: store.openSettings,
      reconnect: store.connectEvents
    };
  }
};

const app = Vue.createApp(App);
app.use(window.ElementPlus);
const icons = window.ElementPlusIconsVue || {};
Object.keys(icons).forEach(function (name) {
  app.component(name, icons[name]);
});
app.mount('#app');

// 调试钩子：带 ?debug=1 时把 store 挂到 window，便于自动化测试
if (location.search.indexOf('debug=1') >= 0) {
  window.__store = store;
  window.__app = app;
}
