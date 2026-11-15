# @hanxu131/dsh-session-retitle

在 DeepSeek Harness Desktop 的会话菜单中增加「重新生成标题」，通过官方 sessionTitle.refresh() 与 all-prompts Provider 生成标题，不修改 DSH 核心。

## 功能

- 会话右键、行尾 … 及同一 session target 的菜单入口，归档会话不显示操作。
- 菜单项使用官方 UI primitives 的原生刷新图标 `IconRefreshOutlineRegular`，与「重命名」「分叉会话」「归档会话」等条目同风格。
- 插件自有 sessionRetitle/execute Typert Remote；无斜杠命令、Agent 工具或 command/run/done 事件。
- 冷会话通过官方 agent lookup 恢复，Provider 每次执行前 fail-closed 预检。
- 手动标题经阻塞式 Modal 确认，并用 eventSeq 防止覆盖确认期间的新标题；确认后弹窗立即关闭，生成在后台完成，结果用 Toast 反馈。
- 同会话最新请求获胜，支持取消、卸载清理、中英文反馈。
- 仅接受 session-title-all-prompts-llm 的成功结果；手动标题落 fallback 时用公开 rename() 补偿。

## 结构

- src/shared：标识、严格请求/结果 Schema、双面共享 Typert descriptor。
- src/host：Host Retitle 深模块、TypertRemoteService 与严格 contribution。
- src/client：Operation、capability、archive、菜单、shell.overlay Modal 与 locale。
- scripts/build-client.mjs：esbuild 输出单文件 ModuleLoader Client。
- test：node:test 契约、Host/Client 行为、真实 Cordis 与 jsdom 测试。
- icon.svg：36×36 透明底插件图标（标题页 + 重生成徽标），48px 卡片框内渲染 36px、行内 30px；设计记录见 [artifacts/plugin-icon.md](artifacts/plugin-icon.md)。

## 开发

使用 bundled Node / pnpm：

    NODE=/Users/hanxu/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node
    PNPM=/Users/hanxu/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.mjs

    $NODE $PNPM install
    $NODE $PNPM run typecheck
    $NODE $PNPM run build
    $NODE $PNPM test
    $NODE $PNPM pack

单独运行一个测试文件：

    $NODE --test test/remote-contract.test.mjs

## 安装与使用

1. 先构建并运行完整测试。
2. 在 Plugins > Add plugin 中选择本目录，或选择生成的 hanxu131-dsh-session-retitle-0.1.1.tgz。
3. 启用本插件；官方“随对话更新的标题”Bundle 保持启用（本插件会接管其 Provider 配置）。
4. **完全退出 DSH 并重新打开**（不是插件页刷新）：bundle patch 只在宿主启动时组合一次，标题 Provider 接管不会热加载。
5. 在非归档会话菜单选择“重新生成标题”。手动标题会额外要求确认。

安装期间不要手动重新启用官方 all-prompts 条目：本插件已把官方条目替换为同实现的 `session-retitle-all-prompts` 条目，两条同时启用会注册第二个 Provider 并报错。

卸载或禁用会移除菜单、Modal 和 Remote，但不会撤销已经产生的标题或恢复已卸载会话。

## 标题 Provider 配置接管

官方 all-prompts Provider 会把该会话全部人类消息 JSON 化后发送，默认限制 `maxInputBytes: 4096`（约 1300 个汉字；计入 JSON 转义与结构开销后实际更少）。超过上限时官方直接报错、不截断历史，因此长会话必然无法生成标题。

本插件的 bundle patch 因此同时做两件事：

- 用 `- id: optional-session-title-all-prompts` + `disabled: true` 禁用官方条目；
- 用官方同一实现 `@deepseek-ai/dsh-session-title-all-prompts-llm` 以自有条目 `session-retitle-all-prompts` 重新挂载，把上限提到 `maxInputBytes: 32768`（约 1 万汉字）、`maxOutputTokens: 512`，`timeoutMs: 60000`；`targetWords: 5`、`targetCjkCharacters: 10` 与官方一致。

`disabled` 与 `config` 在组合补丁里是两个独立 key：用户 profile 里旧有的、只覆盖官方条目 `config` 的条目不会重新启用它，接管对既有安装是稳定的。

接管后插件页里官方条目显示为已禁用是预期现象；客户端预检通过“模块名相同”识别本插件插入的 Provider，因此菜单不会误判为不可用。

### 恢复语义

- 卸载本插件，或禁用它对应的 bundle，下次组合即恢复官方条目：override 随 bundle 一起消失，官方条目回到接管前的生效配置（官方 bundle 默认值叠加你的 profile 覆盖；声明式回滚，没有额外清理代码路径）。
- 用户 profile 里对 `optional-session-title-all-prompts` 的旧 `config` 覆盖会保留，并在恢复后自动重新生效。
- **仅禁用 `session-retitle` 这一个插件行不会撤销接管**：禁用行只是不挂载 Host/Client，bundle patch 仍会被组合。这是设计取舍——接管与插件代码同包分发，回滚以 bundle 为单位。
- 安装期间不要手动重新启用官方条目，否则会注册第二个 Provider 并报错。

### 高级覆盖

需要更大上限时，在用户级 `~/.dsh/cordis.patch.yml` 追加：

```yaml
- id: session-retitle-all-prompts
  config:
    targetWords: 5
    targetCjkCharacters: 10
    maxInputBytes: 65536
    maxOutputTokens: 512
    timeoutMs: 60000
```

home patch 晚于本 bundle 层应用，因此会按 key 覆盖这里的默认值。请写全五个字段；尤其必须保留 `maxOutputTokens: 512`，否则会退回推理模型被截断的问题。

### 顺序要求

本 bundle 必须排在 `@deepseek-ai/dsh-experimental-session-titles-bundle` 之后：override 引用的官方条目由后者插入。插件管理器新装默认追加在 bundles 末尾，通常无需手工调整；手工排序时请保持这个先后关系。

### 升级风险

若未来 DSH 改动官方条目的 id 或包名，本 patch 会在组合时告警 `patch: entry ... not found`，官方条目不再被禁用，而 `session-retitle-all-prompts` 仍会挂载——两条同时注册可能报重复 Provider。`engines.dsh` 的范围（`>=0.2.2-rc.2 <0.3.0-0`）只能先兜底已知版本区间；升级 DSH 后请检查启动日志中的 patch 告警。

## 版本与验证

- engines.dsh 为范围 ">=0.2.2-rc.2 <0.3.0-0"：接受 0.2.2-rc.2、0.2.2-rc.3、0.2.2 与 0.2.3，拒绝 0.3.0 及其预发布。
- 构建期 protocol 使用 npm 已发布的 0.2.2-rc.3（npm 现有 rc.1/rc.2/rc.3）；其 .d.ts 与运行时 JS 和 rc.1 逐字节相同，构建产物不变。
- 兼容验证（2026-11-14，DSH 0.2.2-rc.3）：typecheck、build 与 84 项测试全部通过；`dsh --profile retitle-spike --dump-config` 不再将本 bundle 记为 incompatible，DSH 自身 `evaluatePluginCompatibility()` 对本 manifest 返回 undefined。审计与验证记录见 [artifacts/rc3-compatibility-audit.md](artifacts/rc3-compatibility-audit.md)。
- 当前 84 项测试通过，阶段 2 的严格 Remote、冷恢复、零副作用与卸载验证已完成，详见 artifacts/spike-verification.md。
- 标题 Provider 接管的组合验证（隔离 DSH_HOME 的 dump-config：基线 / 接管 / 卸载恢复 / 顺序反例）见 [artifacts/provider-takeover-verification.md](artifacts/provider-takeover-verification.md)；真实 Desktop 重启后与长会话验收待补。
- Desktop/真实 Provider 的最终验收记录见 artifacts/（随集成验证更新）。

## 已知限制

- Provider 清单是点快照，预检与 refresh 之间存在竞态；手动标题补偿不是通用事务回滚。
- 无标题会话在 Provider 失败后可能保留官方 fallback。
- 非 owner Peer 的 Remote 资源授权不在首版范围内。
- 配置接管后 `maxOutputTokens` 固定为 512（官方默认 64）；推理型模型（如 opencode-go/deepseek-v4.1-flash）在 64 下可能在产出正文前被截断，表现为间歇失败，本插件会把它单独报告为“输出被截断”。若用 `~/.dsh/cordis.patch.yml` 覆盖 `session-retitle-all-prompts`，必须同时保留 `maxOutputTokens: 512`，否则会退回截断问题。诊断与实测数据见 [artifacts/bug-invalid-output-diagnosis.md](artifacts/bug-invalid-output-diagnosis.md)。
