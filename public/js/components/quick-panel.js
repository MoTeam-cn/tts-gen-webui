// 简单模式：一段文案 + 少量旋钮，直接合成
import * as store from '../store.js';
import { voiceOptions, voiceLabel } from '../store.js';
import { rolesForVoice, stylesForVoice, voiceCaps } from '../constants.js';

const Vue = window.Vue;

export default {
  name: 'QuickPanel',
  template: document.getElementById('tpl-quick').innerHTML,
  setup() {
    const state = store.state;
    const block = Vue.computed(function () { return state.blocks[0] || null; });

    const rate = Vue.computed({
      get: function () { const b = block.value; return b && b.rate !== null && b.rate !== undefined ? b.rate : 0; },
      set: function (v) { if (block.value) block.value.rate = v; }
    });
    const pitch = Vue.computed({
      get: function () { const b = block.value; return b && b.pitch !== null && b.pitch !== undefined ? b.pitch : 0; },
      set: function (v) { if (block.value) block.value.pitch = v; }
    });

    const roles = Vue.computed(function () { return block.value ? rolesForVoice(block.value.voice, state.voices) : []; });
    const styles = Vue.computed(function () { return block.value ? stylesForVoice(block.value.voice, state.voices) : []; });
    const caps = Vue.computed(function () { return block.value ? voiceCaps(block.value.voice, state.voices) : { roles: [], styles: [], known: false }; });
    const roleHint = Vue.computed(function () {
      if (!caps.value.known) return '内置音色库没有能力表：填 Key 后点「拉取音色」可精确显示该音色支持的角色 / 风格';
      if (!caps.value.roles.length) return '该音色不支持角色扮演（RolePlayList 为空），role 会被忽略或报错';
      return '该音色支持角色：' + caps.value.roles.join(' / ');
    });

    function onRoleChange(value) {
      if (value && block.value && !block.value.style) block.value.style = 'general';
    }

    return {
      state: state,
      block: block,
      rate: rate,
      pitch: pitch,
      roles: roles,
      styles: styles,
      roleHint: roleHint,
      onRoleChange: onRoleChange,
      voiceOptions: voiceOptions,
      voiceLabel: voiceLabel,
      synthesize: store.synthesize,
      downloadAudio: store.downloadAudio,
      addBlock: store.addBlock,
      insertSample: store.insertSample,
      setUiMode: store.setUiMode
    };
  }
};
