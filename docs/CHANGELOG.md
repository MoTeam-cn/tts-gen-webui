# 更新记录

按对话轮次记录的改动与验收，最新在最下方。

第五轮（2026-11-14 凌晨）：简单模式 + 导入
- 默认进入简单模式：3 张卡片（输入 / 结果 / 日志），设置收进抽屉，首屏按钮从 20+ 降到 6 个。
- `POST /api/import` + ``src/importer.ts``：实测覆盖 7 类输入（围栏+闲聊、纯数组、单对象、SSML、坏 JSON、超范围+未知字段、{mode:ssml}），能正确识别中文键名与 "−8%"/"400ms" 这类带单位值。
- Playwright：简单模式渲染 0 报错；导入弹窗解析预览 → 应用 → 段落更新；多段 JSON 自动切高级模式；SSML 自动切源码模式；简单模式合成（mock）23.4KB 且 rate/pitch 生效。
- 早期 bug 修复：`/api/import` 曾把 `{text:"..."}` 误当成包装层解开，导致单对象导入失败；现只认 `{raw:"..."}`。
- 模板结构 bug 修复：根模板缺 `</script>` 会让浏览器把后续 x-template 吞进同一个 script；已补并加了标签配对检查。

第六轮（设置统一）：
- 简单/高级共用同一份 `state.cfg`，设置入口统一为右上角抽屉（含 15 个字段）；高级模式左栏改为「当前配置」摘要卡（密钥打码）。
- 新增 v1 → v2 的 localStorage 自动继承（Key / 区域 / 域名 / 格式 / 默认音色 / 风格 / 速语 / 音调），日志留痕；实测迁移后 key、region、format、defaultVoice、rate、pitch 全部到位，区域域名同步刷新。
- 修复：区域迁移条件写成 `!state.cfg.region` 导致默认值 japaneast 顶掉旧区域，改为「等于默认值时才迁移」。
- Playwright 验证：抽屉里填 Key → 切高级模式摘要卡显示 `LEGA****-AAA`；抽屉在两种模式下都能看到全部 15 个字段；无 Key 时提示条带「去填 Key」按钮，控制台 0 报错。

第七轮（role 修正，2026-11-14）：
- 联网核对微软文档：合成端点为 {region}.tts.speech.microsoft.com/cognitiveservices/v1，令牌为 {region}.api.cognitive.microsoft.com/sts/v1.0/issueToken（有自定义子域则 cognitiveservices.azure.com）；api.cognitive 的 cognitiveservices/v1 已 404。
- role 官方仅 8 个取值，之前的 Narrator/SportsCommentator/Reporter 是非法的，已删除；style 必填 34 个官方值。
- 新增 src/voiceCache.ts（voices/list 10 分钟缓存 + 并发合并）与 tts.ts 预校验：非法 role → 400 并给出官方取值；音色 RolePlayList 为空或不含该角色 → 400 并列出支持项；风格不支持 → 忽略并提示；role 缺 style → 自动补 general；style 别名自动纠正。
- 前端：role 下拉 8 项 + 按音色过滤 role/style + 提示；合成后把 x-tts-warnings 写进日志；/api/capabilities 增补 styles / 官方端点 / 规则 / 文档链接。
- 验收：8 条后端用例全过（非法 role、role 无 style、style 别名、role 不被音色支持、音色无 RolePlayList、合法组合、风格不支持、SSML 模式非法 role）；浏览器 role 下拉正好 8 项，role 无 style 时生成的 SSML 为 <mstts:express-as style="general" role="YoungAdultFemale">，控制台 0 报错。

第八轮（AI 调参助手，2026-11-14）：
- 后端新增 src/agent.ts：apiUrl 自动补 /v1、listModels（GET {base}/models）、chatOnce、chatStream（把上游 SSE 转成 delta/done/error，处理 [DONE] 与 error 事件）；http.ts 增加 requestStream；路由 POST /api/agent/models 与 /api/agent/chat（messages 上限 40）。
- 前端新增 js/agent.js（system prompt 拼装：输出契约 + 官方硬规则 + 80 个音色能力表 + 当前段落状态 + 口语到参数的映射；extractJsonCandidate 容忍围栏与废话；streamAgent 用 fetch 读 SSE）、components/agent-panel.js 与 agent-config.js；设置抽屉新增「Agent 模型」卡；简单模式顶部与高级模式右栏都放了调参助手。
- 结果应用复用 /api/import 归一化校验，提供「应用并合成 / 只应用参数 / 追加为一段 / 手动看看改改」四个动作；解析失败保留原始输出兜底。
- 验收（mock 网关 + mock Azure）：拉取模型 2 个；描述「低沉男声纪录片」→ 流式 175ms 返回、reply 与 JSON 解析成功；应用后 block 变为 YunxiNeural + narration-professional + rate -12 + pitch -8 + pauseAfter 400；随后合成 14.6KB 成功；控制台 0 报错。

第九轮（提示词跑偏修复，2026-11-14）：
- 现象：模型把自己当聊天助手，回「我没法直接生成音频…你告诉我要哪一种」，不输出 JSON。
- 修法：system prompt 改成「TTS 参数生成器接口」定位 + 绝对禁止清单（禁止提问/方案选项/能力说明/围栏）+ 3 个 few-shot；user 消息二次约束（含当前段落文本，避免它索要文案）；默认带 response_format=json_object，网关不支持时后端去参重试；前端解析失败自动用「你上一条不是合法 JSON」纠正重试一次，仍失败给「强制重试 / 手动贴 JSON」出口；温度默认降到 0.2并加开关。
- 验收：mock 网关第一次故意返回用户贴的那段散文式回答 → 前端自动重试并成功解析出 blocks；请求体确认 system 含「参数生成器 / 绝对禁止 / 禁止提问」与 3 个示例，response_format 为 json_object；网关回 400 不支持时后端自动去参第二次请求成功。

第十轮（取值纠偏 + 思维链，2026-11-14）：
- 现象：模型输出 [{"voice":"磁性男声","style":"纪录片旁白","role":"旁白"}]，后端 400 role 非法。
- 修法：① prompt 增加「取值必须机器可读的英文枚举」段落 + 反例与正确改写 + 常见需求到音色短名的对照表；② 新增 public/js/agent-repair.js repairBlocks()，把中文音色/风格/角色映射成官方枚举，并处理「文案写老年女性但音色是男声」这类冲突，结果在面板列出纠正明细；③ 后端 config.ts 加 mapVoiceLoose / mapStyleLoose / mapRoleLoose（STYLE_LABELS 约 40 条、ROLE_LABELS 约 21 条、VOICE_LABELS 22 条），tts.ts 预校验与 ssml.normalizeBlock 都走映射，改写项进 x-tts-warnings，非法值不再 400。
- 思维链：agent.ts 解析 delta.reasoning_content/reasoning 并发 reasoning 事件，前端实时显示「模型思考过程」可开关，非流式返回 reasoning，done 事件带 hasReasoning。
- 验收：用户原始坏数据直打 /api/tts 现在返回 200 + 三条 warnings（磁性男声→YunxiNeural、纪录片旁白→narration-professional、旁白已移除）；浏览器端同一份坏 JSON 经纠偏后 voice 变 zh-CN-XiaoxiangNeural、style documentary-narration、role 空，成功应用并合成；reasoning 文本正常显示，控制台 0 报错。

第十一轮（音色不可用排查，2026-11-14）：
- 现象：voice=zh-CN-XiaoxiangNeural 时 japaneast.tts.speech.microsoft.com 返回 400。
- 根因：这个音色名是上一轮提示词里我写错的（微软没有 zh-CN-XiaoxiangNeural），Azure 自然 400；同时错误信息没解释，只在 attempts 里塞了 240 字符原始响应。
- 修法：① tts.ts 合成前用 voices/list（缓存）校验音色是否存在，不存在直接 400 并给「最接近的可用音色」（editDistance + 同语言前缀加权）；② 新增 explainStatus()，把 Unsupported voice / Invalid SSML / outputformat / 401 / 403 / 404 / 429 翻成中文原因，追加到每条 attempts 行；③ 兜底 hint 改为取第一条可解释原因，不再被后续端点的 401 带偏，错误 message 也以前因开头；④ attempts 响应体截断从 240 提到 800；⑤ 前端 store 增加 lastError，结果卡新增「失败诊断」区（错误摘要 + 原因 + 可展开的逐条尝试记录）；⑥ 纠正所有未核实的音色名：老年女声统一 zh-CN-XiaomoNeural + role=SeniorFemale，前端 agent-repair 增加 pickSeniorFemale() 按 RolePlayList 动态挑音色；⑦ 提示词强调「voice 必须是清单里真实存在的音色，禁止自己发明」。
- 验收：mock voices/list 无 Xiaoxiang → 400 且给出 4 个最接近音色；上游 400 Unsupported voice → message 以「音色不可用」开头、attempts 每行带中文解释、前端诊断区与折叠记录正常；控制台仅有预期的 502 资源报错。

第十二轮（400 空响应体，2026-11-14）：
- 现象：Azure 返回 400 但响应体为空，attempts 里只有一句 HTTP 400，无法定位。
- 修法：① http.ts 所有请求显式带 content-length（怀疑 Azure 网关拒 chunked 请求体即回空体 400）；② tts.ts 增加输出格式白名单校验（不在 AUDIO_TYPE 里直接 400 并列出可用格式）；③ 主端点 400 时自动降级阶梯：完整参数 → 去 role → 去 role+style → 只留音色与文本，任一级成功即出声并写警告，全失败则提示问题不在 style/role；④ attempts 增加 format、x-ms-request-id 与实际发出的 SSML 前 300 字符；⑤ 新增 POST /api/diagnose 与前端「一键诊断」弹窗，按音色列表/最小 SSML/带 style/当前格式四步探测。
- 验收：mock 只接受带 content-length 的请求 → 修复后 200；mock 拒绝含 express-as 的 SSML → 自动降级到「去 role+style」成功并给出警告；全 400 时 hint 说明已逐级降级并建议换音色/格式/核对资源；诊断接口正确标出第③步失败；非法格式在工具内即被拦下。
