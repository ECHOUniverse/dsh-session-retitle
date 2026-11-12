# @hanxu131/dsh-session-retitle 实现计划

状态：**已于 2026-11-11 获用户确认；尚未进入开发、安装或 Profile 修改**。

## 1. 目标与已确认范围

在 DSH Desktop 的会话菜单中增加“重新生成标题”，复用官方 all-prompts Provider 和 sessionTitle.refresh()，不修改 DSH 核心。

已确认：

- 交付标准 Bundle：@hanxu131/dsh-session-retitle，完成本地构建、实测并安装到当前 Profile，不发布。
- 入口只来自 Client 会话菜单；不注册斜杠命令，不提供 Agent 工具。
- 接受 target: 'session' 覆盖的右键、行尾 …、键盘及可能的标题/面包屑入口；归档会话除外。
- 冷会话允许通过官方 agent lookup 恢复后生成；接受恢复、日志修复和驻留副作用。
- 官方 all-prompts Provider 未确认可用时，阻止执行并提示，不主动退化为 fallback。
- 手动标题仅在阻塞式 Modal 二次确认后覆盖；其他标题不增加确认步骤。
- 成功显示轻量 Toast；失败遵循官方语义，原本无标题的会话可能留下 fallback。
- Host 通道采用插件自有 Typert Remote，命名空间 sessionRetitle；不产生 command/run / command/done 事件。

本计划取代 HANDOFF 中“/retitle 斜杠命令”的推荐数据流；HANDOFF 的其他官方标题语义继续作为调查输入，而非直接照抄的实现。

## 2. 已核实的关键技术事实

运行版本：@deepseek-ai/dsh / Desktop runtime 0.2.2-rc.2。

1. refresh(session, signal) 要求 live Session；显式调用会解钉手动标题，后请求取代先请求，陈旧结果不能提交。
2. Provider 缺失时，refresh() 可走 fallback；手动标题存在合格文本时尤其可能被 fallback 覆盖，因此不能只靠调用后的返回值预防。
3. Provider 成功生成前可能先落实 fallback；后续失败或取消不会回滚该 fallback。
4. 官方标题服务没有公开 Provider 查询接口。Client 可通过 pluginInventory.list() 获取点快照，但与后续 refresh() 之间存在竞态。
5. session-controller 配置的全局 agent lookup 会按需 resume 冷会话；Remote 描述符必须使用 lookup 参数，不能退化成普通 sessionId JSON 参数。
6. Host 命令没有公开隐藏机制。插件自有 ctx.typert.register() 与 Client ctx.remote.$mount() 是官方文档化机制，但本包的严格手写描述符仍需最小运行时验证。
7. session 菜单目标只携带 sessionId 与 displayTitle；归档状态从 ctx.workspaces.list.getSnapshot() 读取，手动标题来源由 Host 权威判断。
8. shell.overlay 可承载根级对话框；第三方插件需自写 Modal 的焦点、Escape 和可访问性行为，不能依赖内部 primitives。

## 3. 模块设计与数据流

### 3.1 模块职责

- **Shared Remote 模块**：唯一的端点、参数、结果 Schema 和标识真源；无副作用，供 Host 与 Client 共用。
- **Host Retitle 模块**：深模块。输入 live Agent、确认令牌和取消信号，集中完成归档防御、手动标题预检、官方刷新、结果核验、手动标题补偿及错误归类。
- **Client Operation 模块**：深模块。集中完成 Provider 点预检、Remote 调用、确认令牌流程、同会话最新请求管理和 Toast 反馈。
- **Menu / Overlay 适配器**：只负责菜单呈现、归档过滤、Modal 展示和用户手势，不复制 Host 策略。
- **官方 Session Title 模块**：唯一标题生成与持久化实现；本插件不复制 Prompt、LLM 调用或标题事件折叠逻辑。

### 3.2 正常数据流

    会话菜单
      → Client 同步排除归档会话
      → 点击“重新生成标题”
      → pluginInventory.list() 确认 all-prompts enabled + active
      → sessionRetitle/execute(agent lookup, request)
      → 冷会话按需恢复为 live Agent
      → Host 检查归档状态与当前标题快照
      → 非手动标题：sessionTitle.refresh(agent.session, signal)
      → 核验 source.provider === 'session-title-all-prompts-llm'
      → 官方 session/title 事件与现有投影更新列表
      → Client 成功 Toast

手动标题分支：

    首次 execute({})
      → Host 返回 confirmation-required { title, eventSeq }
      → Client 打开阻塞式 Modal
      → 用户确认并再次检查 Provider
      → execute({ confirmation: { expectedUserTitleEventSeq: eventSeq } })
      → Host 复核当前 user 标题 eventSeq
         ├─ 一致：refresh
         ├─ 用户标题已变化：重新返回 confirmation-required
         └─ 已不再是用户标题：按当前状态正常刷新

取消 Modal 时不发起第二次 execute，不产生标题事件；首次 agent lookup 已造成的冷会话恢复属于已接受副作用。

## 4. Remote Interface

只提供一个方法：sessionRetitle/execute。

### 参数

1. agent：source 为 lookup、lookup 为 agent、wire 字段为 agentId；保留官方 agent scope，使 Gateway 在业务调用前完成 live 解析或冷会话恢复。
2. request：严格 JSON 对象。首次为 {}；确认后为 { confirmation: { expectedUserTitleEventSeq: number } }。
3. signal：末尾取消参数，由 descriptor 的 cancellation.parameter 声明。

### 结果

使用严格判别联合，Client 按 outcome 本地化，不依赖 Host 英文错误文案：

- refreshed：title、eventSeq、source.provider、changed。
- confirmation-required：当前手动 title 与 eventSeq。
- no-input：无合格用户文本，未生成。
- provider-unavailable：实际标题、来源及是否已恢复手动标题。
- archived：Host 防御命中，未刷新。
- failed：稳定原因码、实际标题与来源；原因码覆盖 input-too-large、no-route、invalid-output、timeout、cancelled、superseded、unknown。

Host 捕获 refresh() 的拒绝并映射为结构化结果；不把普通异常直接抛成丢失详情的 gateway/internal。Remote 外层 ok:false 与业务 failed 分开处理。

### 成功与补偿不变量

- 只有 source.kind 为 provider 且 provider id 为 session-title-all-prompts-llm 才能返回 refreshed。
- 若刷新前是手动标题，刷新后却落为 fallback，立即用公开 rename() 恢复刷新前手动标题，再返回 provider-unavailable。
- 该补偿防止手动标题被永久覆盖，但不能消除标题瞬时闪动；非手动标题在极端 Provider 切换竞态中不具备事务回滚保证。
- 无标题会话在 Provider 失败后留下 fallback 是已接受的官方行为，结果必须报告实际标题状态。

## 5. Client 设计

### 菜单与归档

- 注册 id 为 @hanxu131/dsh-session-retitle.session.retitle、target 为 session、order 为 210。
- run 执行操作；不使用 commandId 派发行为。
- 每次 resolve 重新取本地化标签。
- 通过 ctx.workspaces.list 的同步快照与订阅驱动 observe / resolve：快照未就绪、处于错误状态或会话已归档时不返回该动作。
- Host 使用 workspaceRegistry.archivedSessionIds 再防御一次；此检查发生在 agent lookup 之后，不能承诺归档会话绝不恢复，只保证不刷新标题。

### Provider 点预检

- 每次实际 execute 前调用 ctx.remote.pluginInventory.list()，包括 Modal 确认后的调用。
- 同时扫描全局 entries 和 agentPresets[].rows。
- 命中 entryId 为 optional-session-title-all-prompts 或 moduleName 为 @deepseek-ai/dsh-session-title-all-prompts-llm，并要求 enabled 为 true、fiberPhase 为 active。
- 查询失败、未命中或状态不明确时 fail closed：不调用 execute，显示可重试提示。
- 菜单保持可见，避免在 1000ms 菜单解析预算内做网络查询；点击后的反馈说明官方能力不可用。

### 并发与取消

- Client 按 sessionId 保存当前操作 token 与 AbortController。
- 新点击中止旧调用并取得新 token；只有最新 token 可以打开 Modal 或显示结果 Toast。
- Host 依赖官方 revision 保证最新标题获胜；被取代的旧调用静默结束，不弹误导性失败。
- 插件禁用时中止本插件调用、关闭 Modal、注销菜单和 Remote 挂载。

### Modal 与反馈

- 根级 shell.overlay 常驻一个受控组件，仅在收到 confirmation-required 时显示。
- 展示当前手动标题、覆盖及解钉后果；默认聚焦“取消”，确认按钮使用危险语义。
- 实现 role=dialog、aria-modal、标题/描述关联、焦点约束、Escape 取消、确认期间防重复提交及关闭后的焦点恢复。
- 使用 React、自写控件、内联样式与主题 token；不导入内部 primitives。
- 成功、空内容、Provider 不可用、归档、失败均通过 contextMenus.notify() 给出对应本地化反馈。

## 6. 工程结构与构建

    regeneratetitle-dsh/
    ├── package.json
    ├── cordis.patch.yml
    ├── tsconfig.json
    ├── tsconfig.host.json
    ├── tsconfig.client.json
    ├── scripts/build-client.mjs
    ├── src/
    │   ├── shared/{ids.ts,result.ts,remote.ts}
    │   ├── host/{index.ts,service.ts,contribution.ts,retitle.ts}
    │   └── client/{index.tsx,menu.ts,operation.ts,capability.ts,archive.ts,overlay.tsx,modal.tsx}
    ├── locale/{en.json,zh.json}
    ├── test/
    ├── docs/DETAIL.md
    ├── icon.svg
    └── README.md

- 源码统一 TypeScript；Host 由 tsc 输出未压缩 ESM，Client TS/TSX 由 esbuild 打成单个 window.__ModuleLoader__.load() 包装产物。
- Shared descriptor 使用 createTypertRemoteInfo()；Host 注册严格 contribution，Client $mount() 同一真源。
- zod 与 protocol 纯叶子打入 Client bundle；React / JSX runtime 保持外部单例。版本以运行安装为准，protocol 固定 0.2.2-rc.2。
- dsh.client.inject 使用完整包名，至少覆盖 dsh-api-remotes、dsh-api-workspace-controller、context-menu、layout、locale；运行时服务再声明 remote、workspaces、contextMenus、slots、locale。
- 清单提供 Host 导出、./client、./locale/*.json、./icon、bundle patch 和所需发布文件；不引入 DSH 源码 checkout 依赖。

## 7. 实施步骤与完成门槛

### 阶段 0：计划批准

已完成：用户于 2026-11-11 确认本计划。后续开发从阶段 1 开始，且不得越过阶段 2 的公开契约门槛。

### 阶段 1：工程脚手架

建立上述结构、构建脚本、locale 基线、包元数据和 Node 契约测试。

完成标准：Host/Client 构建通过，类型检查通过，包导出与 patch 引用存在，测试可运行。

### 阶段 2：零标题副作用 Remote spike

先实现返回固定结构化结果的最小方法，验证严格描述符、Host 注册、Client $mount()、agent lookup、取消与卸载；同时验证第三方 fiber 中 pluginInventory 和 workspaces 可见性。随后在一次性测试会话验证冷恢复。

完成标准：Desktop 中常量结果往返成功，无 /retitle 命令、无标题事件、无命令事件；冷会话可恢复并返回；卸载后命名空间消失。

**门槛**：若严格手写 contribution 或 $mount() 不能按公开契约工作，暂停并向用户报告，不自动退回斜杠命令、HTTP、私有字段或核心修改。

### 阶段 3：Host Retitle 模块

用注入的假 sessionTitle/workspaceRegistry 编写分支测试，再接入官方 refresh()；实现确认令牌、归档防御、结果核验、手动标题补偿和错误归类。

完成标准：所有结果分支均有单元测试；只有 all-prompts 结果被标记成功；手动标题 fallback 补偿测试通过。

### 阶段 4：Client Operation 与菜单

实现能力预检、归档过滤、Remote 适配、最新请求管理、菜单和 Toast。

完成标准：菜单纯逻辑、能力矩阵、归档矩阵、Remote 外层与业务结果、陈旧 token 测试通过；菜单打开不等待网络。

### 阶段 5：Modal

实现根级 overlay、确认状态机和可访问性行为。

完成标准：仅手动标题弹出；取消零标题副作用；Esc、焦点约束、焦点恢复、重复确认和确认期间标题变化测试通过。

### 阶段 6：Desktop 集成验收与安装

在隔离测试环境中使用一次性 workspace 和可丢弃测试会话，先验证目录链接安装，再验证打包产物文件清单；最后按官方插件管理方式在当前 Profile 安装/启用。UI 实测阶段加载 ego-browser 技能。

完成标准：第 8 节全部适用场景通过，且未操作用户既有真实会话。

## 8. 验收矩阵

| 场景 | 通过标准 |
|---|---|
| 普通会话成功 | 标题来自 all-prompts，列表无需手动刷新，显示成功 Toast |
| 手动标题 | 仅该来源弹 Modal；取消不变；确认后覆盖并解钉 |
| 确认期间再次改名 | eventSeq 不匹配，重新确认，不覆盖未经确认的新手动标题 |
| 官方 Provider 禁用/未知 | 不调用 refresh，提示启用或重试；不把 fallback 当成功 |
| Provider 点预检后竞态 | 手动标题被永久恢复；结果显示实际状态；记录非原子限制 |
| 空会话 | 返回 no-input，不调用模型，不写标题事件 |
| 冷会话 | 允许恢复并生成；记录驻留、写锁及可能的日志修复副作用 |
| 归档会话 | Client 不显示；Host 返回 archived，不写标题事件 |
| 正在运行的会话 | 不打断主 turn；标题刷新独立执行 |
| 连续点击/多客户端 | 最新请求获胜，旧结果不覆盖，旧 UI 不误报失败 |
| 超 4096B、无路由、非法输出、超时 | 返回可理解错误；已有标题按官方语义处理，无标题会话允许留下 fallback 并如实反馈 |
| 取消/禁用/卸载 | 调用中止，菜单/Modal/Remote 清理，官方自动标题不受影响 |
| 菜单入口 | 实测右键、行尾 …、键盘及标题/面包屑实际覆盖范围 |
| 入口隔离 | / 目录无 retitle，Agent 工具列表无新增工具，日志无 command/run/done |

## 9. 安装、卸载与数据边界

- 不修改 DSH 核心、官方 Bundle 配置或标题 Provider 配置。
- 新插件只新增自己的 Host Remote、Client 菜单和 Modal；标题仍只由官方 session/title 日志及必要时补偿性 rename() 产生。
- 禁用或卸载不撤销已经生成的标题、fallback、补偿事件，也不强制销毁已恢复的 Agent。
- 本地目录安装与 tarball 安装分别验证；当前 Profile 安装只在集成验收通过后进行。
- 首版只保证 Desktop owner 使用路径；非 owner Peer 的 Remote 资源授权不在范围内。

## 10. 已接受限制与待实测项

- pluginInventory 是点快照，Provider 防护不是原子事务；手动标题补偿是最后防线。
- 严格手写 Typert contribution、$mount() 和第三方 fiber 可见性必须通过阶段 2 才能视为可用。
- 标题/面包屑是否最终归入 session target，以 Desktop 实测为准；不扩展到独立的 sessionHeader target。
- 冷会话恢复后的释放策略由 DSH 自身管理，本插件不增加私有回收逻辑。
- 失败后的标题状态遵循官方实际事件，不承诺事务式“完全不变”。

## 11. 最终确认记录

用户已确认本规划形成共享理解，可作为后续开发依据；阶段 2 的公开契约 spike 失败时必须暂停回报。
