// 单个段落卡片
import * as store from '../store.js';
import { voiceOptions, voiceLabel } from '../store.js';
import { rolesForVoice, stylesForVoice, voiceCaps } from '../constants.js';

const Vue = window.Vue;

export default {
  name: 'BlockCard',
  template: document.getElementById('tpl-block').innerHTML,
  props: {
    block: { type: Object, required: true },
    index: { type: Number, required: true },
    total: { type: Number, required: true }
  },
  emits: ['duplicate', 'move-up', 'move-down', 'remove'],
  setup(props) {
    const state = store.state;
    const roles = Vue.computed(function () { return rolesForVoice(props.block.voice, state.voices); });
    const styles = Vue.computed(function () { return stylesForVoice(props.block.voice, state.voices); });
    const caps = Vue.computed(function () { return voiceCaps(props.block.voice, state.voices); });
    const roleHint = Vue.computed(function () {
      if (!caps.value.known) return '内置音色库没有能力表：填 Key 后点「拉取音色」可精确显示该音色支持的角色 / 风格';
      if (!caps.value.roles.length) return '该音色不支持角色扮演（RolePlayList 为空）';
      return '该音色支持角色：' + caps.value.roles.join(' / ');
    });

    function onRoleChange(value) {
      if (value && !props.block.style) props.block.style = 'general';
    }

    return {
      state: state,
      roles: roles,
      styles: styles,
      roleHint: roleHint,
      onRoleChange: onRoleChange,
      voiceOptions: voiceOptions,
      voiceLabel: voiceLabel
    };
  }
};
