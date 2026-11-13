// SSML 预览 / 源码编辑
import * as store from '../store.js';

export default {
  name: 'SsmlPanel',
  template: document.getElementById('tpl-ssml').innerHTML,
  setup() {
    return {
      state: store.state,
      refreshPreview: store.refreshPreview,
      switchToSsmlMode: store.switchToSsmlMode,
      switchToParamsMode: store.switchToParamsMode,
      resetSsmlTemplate: store.resetSsmlTemplate,
      copyText: store.copyText,
      saveCfg: store.saveCfg
    };
  }
};
