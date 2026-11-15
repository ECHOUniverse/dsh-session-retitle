# 重新生成会话标题

在 DSH Desktop 的会话菜单中增加「重新生成标题」，复用官方 all-prompts Provider 实现与 sessionTitle.refresh()，不修改 DSH 核心。

## 使用

1. 启用官方“随对话更新的标题”Bundle 和本插件，然后完全退出并重开 DSH（bundle patch 只在宿主启动时组合一次）。
2. 在非归档会话的右键或行尾 … 菜单选择「重新生成标题」。
3. 成功时会话列表自动更新并显示 Toast；无可用文本或失败时显示对应反馈。

手动命名的会话会先显示阻塞式确认框，只有确认后才会调用官方 refresh。点击「替换标题」后弹窗立即关闭，标题在后台生成，结果（成功、失败或 Provider 不可用等）由 Toast 反馈；若生成期间手动标题再次改变，本次替换不会生效，只提示未替换、请重试，不会再次弹窗。

## 配置接管与恢复

官方 all-prompts Provider 默认 `maxInputBytes: 4096`（约 1300 个汉字），超限直接失败而不截断历史，长会话无法生成标题。本插件的 bundle patch 禁用官方条目 `optional-session-title-all-prompts`，并以 `session-retitle-all-prompts` 挂载同一官方实现，限制为 `maxInputBytes: 32768`、`maxOutputTokens: 512`、`timeoutMs: 60000`。

- `disabled` 与 `config` 是独立 patch key，用户 profile 只覆盖官方条目 `config` 不会重新启用它。
- 卸载插件或禁用其 bundle 后，下次组合自动恢复官方条目及其 profile 配置（声明式回滚）；仅禁用 `session-retitle` 插件行不会撤销接管。
- 接管后插件页里官方条目显示为已禁用是预期现象；客户端预检通过“模块名相同”识别本插件插入的 Provider，菜单不会误判为不可用。
- 需要更大上限时，用用户级 `~/.dsh/cordis.patch.yml` 覆盖 `session-retitle-all-prompts` 的完整五个字段（必须含 `maxOutputTokens: 512`）。顺序上本 bundle 必须排在官方标题 bundle 之后。
- 安装期间不要手动重新启用官方条目：会注册第二个 Provider 报错；需要撤销接管请卸载本插件或禁用其 bundle。
- 升级风险：官方若改条目 id 或包名，patch 会在组合时告警 `patch: entry ... not found`，官方条目不再被禁用而本插件条目仍挂载，可能重复注册 Provider；`engines.dsh` 范围先兜底，升级 DSH 后请检查启动日志。

## 行为边界

- 官方 Provider 未确认 enabled + active 时不执行，避免退化为确定性 fallback。
- 冷会话允许恢复后生成；归档会话不提供操作，Host 另做防御。
- 同会话重复点击以最新请求为准，旧结果不会覆盖新标题。
- 手动标题意外落为 fallback 时尝试恢复原手动标题；极端 Provider 切换竞态不具有通用事务保证。
- 无标题会话在生成失败后可能保留官方 fallback。
- 禁用或卸载会清理菜单、Modal 和 Remote，不撤销已产生的标题。
- 卸载本插件（或禁用其 bundle）后，下次启动组合即恢复官方标题 Provider 条目；已产生的标题不撤销。

## 工程信息

- 唯一 Remote：sessionRetitle/execute；无斜杠命令、Agent 工具或 command/run/done 事件。
- 共享严格 descriptor、Host Retitle 深模块、Client Operation 与自写可访问性 Modal。
- 菜单项图标使用页面 baseline 模块表里的官方 primitives 刷新字形（keep external，不打包、不新增依赖）。
- 构建期 protocol 为 npm 可获得的 0.2.2-rc.3（npm 现有 rc.1/rc.2/rc.3），运行环境为 DSH 0.2.2-rc.3；engines.dsh 为范围 >=0.2.2-rc.2 <0.3.0-0，rc.3 下真实 spike 已验证该组合。
- 84 项单元/契约/真实 Cordis/jsdom 测试通过（含 8 项标题 Provider 配置接管测试）。
