# 阶段 2 Remote spike 验证记录

日期：2026-11-12（Asia/Shanghai）

## 环境

- 临时 Profile：retitle-spike（Web，独立端口 49811）。
- 一次性测试 Session：session-2380ea25-5e2a-4ed2-9694-8f1ee8bc335c。
- 当前 Desktop Profile 未修改。
- 构建依赖 protocol rc.1；运行环境 Desktop runtime rc.2（用户已批准此验证策略）。

## 结果

| 验证项 | 结果与证据 |
|---|---|
| 严格 descriptor / Host binding / Client $mount | 菜单触发返回固定 no-input；修复动态 inject 与 TypertRemoteService 后通过 |
| 菜单入口 | 会话右键菜单出现“重新生成标题” |
| 冷会话恢复 | 无界面 HTTP 调用前 agentAvailable=false；调用后=true |
| 标题副作用 | 调用前后 cursor=23；仅原有 seq=15 fallback 与 seq=19 first-prompt provider 标题，无新增标题事件 |
| 命令副作用 | session/events 中 commandEvents=[]；实现未注册 commands 或 Agent 工具 |
| 第三方 fiber 服务可见性 | inventoryOk=true、workspacePhase=ready、workspaceState=idle；allPromptsActive=false（临时 Profile 未启用官方 Bundle，符合预期） |
| 禁用清理 | 菜单项消失；Remote 返回 gateway/definition-unavailable（strict definition withdrawn） |
| 构建与测试 | typecheck 通过；18/18 tests pass；pnpm pack 成功 |

## 备注

- 阶段 2 在隔离 Web Profile 完成，不等同于最终 Desktop 验收；Desktop 集成在完整实现后执行。
- 阶段 2 的 Toast 诊断属于临时代码，阶段 4 由正式 capability 与 archive 模块替代。
- 并发诊断子任务已停止；最终源码与测试由主智能体统一复验。
