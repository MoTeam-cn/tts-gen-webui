// 合成默认参数（新建段落套用 + 批量应用）
import * as store from '../store.js';
import { FORMATS, ROLES, STYLE_OPTIONS } from '../constants.js';
import { voiceOptions, localeOptions, voiceLabel } from '../store.js';

export default {
  name: 'ParamsPanel',
  template: document.getElementById('tpl-params').innerHTML,
  setup() {
    return {
      state: store.state,
      formats: FORMATS,
      roles: ROLES,
      styles: STYLE_OPTIONS,
      voiceOptions: voiceOptions,
      localeOptions: localeOptions,
      voiceLabel: voiceLabel,
      applyDefaultsToAll: store.applyDefaultsToAll,
      saveCfg: store.saveCfg
    };
  }
};
