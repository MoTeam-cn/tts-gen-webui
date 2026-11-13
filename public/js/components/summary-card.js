// 配置摘要卡：高级模式左栏不再重复一整套表单，只显示状态 + 打开统一设置
import * as store from '../store.js';

export default {
  name: 'SummaryCard',
  template: document.getElementById('tpl-summary').innerHTML,
  setup() {
    const state = store.state;
    return {
      state: state,
      openSettings: store.openSettings,
      testConn: store.testConn,
      loadVoices: store.loadVoices,
      maskKey: function (key) {
        if (!key) return '';
        if (key.length <= 8) return '****';
        return key.slice(0, 4) + '****' + key.slice(-4);
      }
    };
  }
};
