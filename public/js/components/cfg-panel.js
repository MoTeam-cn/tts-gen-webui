// 服务配置面板
import * as store from '../store.js';
import { FORMATS } from '../constants.js';

const ElMessage = window.ElementPlus.ElMessage;

export default {
  name: 'CfgPanel',
  template: document.getElementById('tpl-cfg').innerHTML,
  setup() {
    const state = store.state;
    return {
      openDiagnose: store.openDiagnose,
      runDiagnose: store.runDiagnose,
      state: state,
      formats: FORMATS,
      onRegionChange: store.onRegionChange,
      testConn: store.testConn,
      loadVoices: store.loadVoices,
      reloadNow: store.reloadNow,
      connectEvents: store.connectEvents,
      copyText: store.copyText,
      saveCfg: store.saveCfg,
      resetAll: store.resetAll
    };
  }
};
