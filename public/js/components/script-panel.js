// 段落工作台
import * as store from '../store.js';
import BlockCard from './block-card.js';

export default {
  name: 'ScriptPanel',
  template: document.getElementById('tpl-script').innerHTML,
  components: { BlockCard: BlockCard },
  setup() {
    return {
      state: store.state,
      totalChars: store.totalChars,
      addBlock: store.addBlock,
      removeBlock: store.removeBlock,
      duplicateBlock: store.duplicateBlock,
      moveBlock: store.moveBlock,
      clearBlocks: store.clearBlocks,
      insertSample: store.insertSample,
      synthesize: store.synthesize,
      downloadAudio: store.downloadAudio,
      refreshPreview: store.refreshPreview
    };
  }
};
