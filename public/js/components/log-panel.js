// 运行日志
import * as store from '../store.js';

export default {
  name: 'LogPanel',
  template: document.getElementById('tpl-log').innerHTML,
  props: { num: { type: String, default: '6' } },
  setup() {
    return { state: store.state };
  }
};
