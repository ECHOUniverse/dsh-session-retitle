# @hanxu131/dsh-session-retitle

在 DeepSeek Harness Desktop 的会话菜单中增加「重新生成标题」，通过官方 sessionTitle.refresh() 与 all-prompts Provider 生成标题，不修改 DSH 核心。

## 功能

- 会话右键、行尾 … 及同一 session target 的菜单入口，归档会话不显示操作。
- 插件自有 sessionRetitle/execute Typert Remote；无斜杠命令、Agent 工具或 command/run/done 事件。
- 冷会话通过官方 agent lookup 恢复，Provider 每次执行前 fail-closed 预检。
- 手动标题经阻塞式 Modal 确认，并用 eventSeq 防止覆盖确认期间的新标题。
- 同会话最新请求获胜，支持取消、卸载清理、中英文反馈。
- 仅接受 session-title-all-prompts-llm 的成功结果；手动标题落 fallback 时用公开 rename() 补偿。

## 结构

- src/shared：标识、严格请求/结果 Schema、双面共享 Typert descriptor。
- src/host：Host Retitle 深模块、TypertRemoteService 与严格 contribution。
- src/client：Operation、capability、archive、菜单、shell.overlay Modal 与 locale。
- scripts/build-client.mjs：esbuild 输出单文件 ModuleLoader Client。
- test：node:test 契约、Host/Client 行为、真实 Cordis 与 jsdom 测试。

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
2. 在 Plugins > Add plugin 中选择本目录，或选择生成的 hanxu131-dsh-session-retitle-0.1.0.tgz。
3. 启用官方“随对话更新的标题”Bundle 与本插件；必要时重启 DSH。
4. 在非归档会话菜单选择“重新生成标题”。手动标题会额外要求确认。

卸载或禁用会移除菜单、Modal 和 Remote，但不会撤销已经产生的标题或恢复已卸载会话。

## 版本与验证

- engines.dsh 固定 0.2.2-rc.2。
- npm 仅发布 protocol 0.2.2-rc.1，因此构建期使用该纯 descriptor 工厂，运行期 Host 由 DSH 0.2.2-rc.2 解析；用户已批准 rc.1 构建 + rc.2 实测策略。
- 当前 66 项测试通过，阶段 2 的严格 Remote、冷恢复、零副作用与卸载验证已完成，详见 artifacts/spike-verification.md。
- Desktop/真实 Provider 的最终验收记录见 artifacts/（随集成验证更新）。

## 已知限制

- Provider 清单是点快照，预检与 refresh 之间存在竞态；手动标题补偿不是通用事务回滚。
- 无标题会话在 Provider 失败后可能保留官方 fallback。
- 非 owner Peer 的 Remote 资源授权不在首版范围内。
