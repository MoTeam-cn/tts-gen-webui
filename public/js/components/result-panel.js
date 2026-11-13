// 播放与结果
import * as store from '../store.js';

export default {
  name: 'ResultPanel',
  template: document.getElementById('tpl-result').innerHTML,
  props: { num: { type: String, default: '5' } },
  setup() {
    return {
      state: store.state,
      downloadAudio: store.downloadAudio,
      copyText: store.copyText
    };
  }
};
