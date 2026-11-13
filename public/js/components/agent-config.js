// Agent 模型配置（地址 / 密钥 / 模型 / 拉取）
import * as store from '../store.js';

export default {
  name: 'AgentConfig',
  template: document.getElementById('tpl-agent-config').innerHTML,
  setup() {
    return {
      state: store.state,
      fetchModels: store.fetchAgentModels,
      testAgent: store.testAgent,
      saveAgentCfg: store.saveAgentCfg
    };
  }
};
