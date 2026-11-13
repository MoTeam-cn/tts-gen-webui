// 导入弹窗：粘贴 AI 输出的 JSON / SSML，解析预览后一键应用
import * as store from '../store.js';

const Vue = window.Vue;

const EXAMPLE = [
  '{',
  '  "blocks": [',
  '    {',
  '      "text": "文案放这里",',
  '      "voice": "zh-CN-XiaomoNeural",',
  '      "style": "calm",',
  '      "role": "YoungAdultFemale",',
  '      "styleDegree": 1.2,',
  '      "rate": "-8%",',
  '      "pitch": "-12%",',
  '      "volume": "-20%",',
  '      "pauseAfter": 400',
  '    }',
  '  ]',
  '}'
].join('\n');

export default {
  name: 'ImportDialog',
  template: document.getElementById('tpl-import').innerHTML,
  props: {
    modelValue: { type: Boolean, default: false }
  },
  emits: ['update:modelValue'],
  setup(props, ctx) {
    const raw = Vue.ref('');
    const parsed = Vue.ref(null);
    const target = Vue.ref('replace');
    const parsing = Vue.ref(false);

    const visible = Vue.computed({
      get: function () { return props.modelValue; },
      set: function (v) { ctx.emit('update:modelValue', v); }
    });

    function close() {
      ctx.emit('update:modelValue', false);
    }

    async function parse() {
      if (!raw.value.trim()) {
        window.ElementPlus.ElMessage.warning('请先粘贴内容');
        return;
      }
      parsing.value = true;
      parsed.value = await store.parseImportText(raw.value);
      parsing.value = false;
      if (parsed.value && parsed.value.ok) {
        window.ElementPlus.ElMessage.success('解析成功：' + parsed.value.summary);
      }
    }

    function apply() {
      if (!parsed.value || !parsed.value.ok) return;
      const ok = store.applyImport(parsed.value, target.value);
      if (ok) {
        window.ElementPlus.ElMessage.success('已应用到工作台');
        raw.value = '';
        parsed.value = null;
        close();
      }
    }

    async function paste() {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) {
          window.ElementPlus.ElMessage.warning('剪贴板是空的');
          return;
        }
        raw.value = text;
        await parse();
      } catch (e) {
        window.ElementPlus.ElMessage.warning('读取剪贴板失败，请手动粘贴（Ctrl+V）');
      }
    }

    function pickFile() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.txt,.xml,.ssml,application/json,text/plain';
      input.onchange = function () {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function () {
          raw.value = String(reader.result || '');
          await parse();
        };
        reader.readAsText(file, 'utf-8');
      };
      input.click();
    }

    function loadExample() {
      raw.value = EXAMPLE;
      parsed.value = null;
    }

    return {
      visible: visible,
      raw: raw,
      parsed: parsed,
      target: target,
      parsing: parsing,
      parse: parse,
      apply: apply,
      paste: paste,
      pickFile: pickFile,
      loadExample: loadExample,
      close: close
    };
  }
};
