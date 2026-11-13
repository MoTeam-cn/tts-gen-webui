// 提示词弹窗（可复制给 agent）
import * as store from '../store.js';
import { buildPrompt, buildShortPrompt } from '../prompt.js';

export default {
  name: 'PromptDialog',
  template: document.getElementById('tpl-prompt').innerHTML,
  props: {
    modelValue: { type: Boolean, default: false }
  },
  emits: ['update:modelValue'],
  setup(props, ctx) {
    const Vue = window.Vue;
    const full = Vue.ref(buildPrompt(store.state));
    const short = Vue.ref(buildShortPrompt(store.state));

    function refresh() {
      full.value = buildPrompt(store.state);
      short.value = buildShortPrompt(store.state);
    }

    function close() {
      ctx.emit('update:modelValue', false);
    }

    return {
      state: store.state,
      full: full,
      short: short,
      refresh: refresh,
      close: close,
      copyText: store.copyText,
      visible: Vue.computed({
        get: function () { return props.modelValue; },
        set: function (v) { ctx.emit('update:modelValue', v); }
      })
    };
  }
};
