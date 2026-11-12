# 交接：为 DSH Desktop 会话右键菜单规划「重新生成标题」

更新时间：2026-11-11 21:05（Asia/Shanghai）

## 1. 下一 session 的任务

围绕以下需求完成**实现规划**，经用户确认后再进入开发：

> 在 DSH Desktop 的会话右键菜单中增加「重新生成标题」，直接使用官方 `@deepseek-ai/dsh-experimental-session-titles-bundle` 的标题生成能力。

本文件是交接材料，不是已批准的实施计划。此前仅做了文档与源码的只读调查，没有开发、安装或启用新插件，也没有修改 DSH 或用户 Profile。

## 2. 已确认的结论

**可行，推荐用一个新的配套 Bundle 连接现有菜单与官方标题服务，不修改 DSH 核心，也不复制标题生成逻辑。**

官方 `session-titles-bundle` 仅提供 Host 配置层：禁用首条消息标题 Provider，挂载全消息 Provider。它没有 Client 入口、菜单贡献或现成的手动刷新命令。因此「直接使用官方插件」的准确落地方式是：

- 保留并依赖官方 Bundle 提供的 `all-prompts` Provider；
- 新插件只负责菜单、用户确认、Host 命令和错误反馈；
- 最终通过 `ctx.sessionTitle.refresh()` 调用官方生成链路。

推荐数据流：

```text
Desktop 会话右键 / 行尾 … → 「重新生成标题」
  → ctx.remote.commands.execute(sessionId, '/retitle', [])
  → Host /retitle 命令
  → ctx.sessionTitle.refresh(agent.session, signal)
  → 官方 all-prompts Provider
  → session/title 事件与现有投影更新会话列表
```

现有客户端没有 `session/refreshTitle` Remote。优先复用官方支持的「Client 调用 Host 斜杠命令」通道，避免新增 Typert RPC 或自建 HTTP 路由。菜单 action 的 `commandId` 只关联快捷键展示，不会执行命令，实际触发必须写在 `run` 中。

## 3. 规划前需用户决定的产品语义

这些问题尚未获得用户决策，不要默认为已批准：

1. **手动标题的保护**：`refresh()` 是官方定义的显式解钉，可能用手动标题之外的 Provider 标题或 fallback 覆盖现有用户标题。规划时建议询问：遇到 `source.kind === 'user'` 时，是二次确认、禁用菜单，还是直接覆盖。
2. **官方 Bundle 未启用时的行为**：推荐要求启用官方 Bundle，并在缺失时禁用操作或明确提示。否则 `refresh()` 可能只生成确定性 fallback，而非 LLM 标题。
3. **入口范围**：最低范围是侧栏会话右键与行尾 `…`；同一 `session` target 也可能使会话面包屑菜单出现该操作。需确认是否接受。
4. **冷会话与归档会话**：`refresh()` 要求 live Session；命令执行通道可能恢复冷会话。应验证恢复后的生命周期与副作用，并决定归档会话是否显示该操作。
5. **是否需要 Agent 工具**：当前需求只需要用户菜单。Agent 工具可作为可选扩展，不应挤占首版范围。

## 4. 建议的最小设计边界

以下是规划输入，不是要求直接照抄的代码。

### Host 半边

- 注入 `commands`、`sessionTitle`。
- 注册唯一的 `/retitle` 命令。
- handler 接收 `{ agent, signal }`，将 `signal` 传给 `refresh()`。
- 读取刷新前后的标题来源，用于实施手动标题保护策略。
- 返回明确的成功/无合格文本/失败结果；由 Client 本地化呈现错误。
- 使用 `ctx.effect()` 管理注册释放。

### Client 半边

- 在 `dsh.client.inject` 中声明官方菜单包，并注入 `contextMenus`、`remote`、`locale`。
- 使用 `ctx.effect(() => ctx.contextMenus.register({ ... }))` 注册 `target: 'session'`。
- 建议贡献 ID 使用插件命名空间；`order: 210` 可位于 Rename(200) 与 Fork(300) 之间。
- `resolve` 使用捕获的 `sessionId`，`run` 调用 `ctx.remote.commands.execute()`。
- 用 `ctx.contextMenus.notify()` 展示结果；处理 Remote 外层失败与命令内层失败。
- 不通过新增 Session 事件保存状态；标题继续以官方 `session/title` 日志为准。

### 暂不作为首选的路线

- 修改 DSH 核心、增加官方 RPC：仅当目标改为上游内置功能时考虑。
- 自建 HTTP：需要额外处理信任、权限和冷会话恢复，首版收益不足。
- 复用第三方 `@hanxu131/dsh-autotitle`：它走自建 LLM 与 `rename()`，会钉住用户标题，不符合复用官方 `refresh()` 的语义。
- Electron 原生菜单：会话列表使用共享 Web Menu；原生菜单注入不属于本需求。

## 5. 验证门槛

实现前的规划至少应覆盖：

1. 一个可正常生成标题的会话：菜单触发后标题更新，列表无需手动刷新。
2. 用户手动命名的会话：严格遵循第 3 节确定的保护/确认策略。
3. 官方 Bundle 未启用：给出明确且可恢复的表现。
4. 冷会话、空会话、归档会话、正在运行的会话：明确菜单可见性、恢复行为与失败反馈。
5. 连续或重复点击：旧请求被取代，过期结果不会覆盖新标题。
6. 输入超过 `maxInputBytes`、无模型路由、超时或取消：保留旧标题并展示可理解的错误。
7. 禁用或卸载配套插件：菜单贡献和 Host 命令都被清理，不影响官方自动标题。
8. Desktop 实测右键、`…`、键盘菜单入口，以及会话列表标题更新。

## 6. 已核实的环境与证据

调查时安装版本：`@deepseek-ai/dsh` / Desktop runtime `0.2.2-rc.2`。下一 session 应先重新核实运行版本，再沿用接口。

安装根目录：

`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh`

在该目录的 `node_modules/@deepseek-ai/` 下可定位下列文件。ASAR 内文件优先用 Host `read` 工具；不要用普通 shell 工具遍历归档。部分 `lib/client.js` 已压缩成少量超长物理行，调查时生成的逻辑行号不应直接用于 `read` 的 offset。

| 证据 | 位置与要点 |
|---|---|
| Desktop 版本 | `package.json:3-13` |
| 官方 Bundle 无 Client 入口 | `dsh-experimental-session-titles-bundle/package.json:17-43`；只有 `dsh.bundle.patch` |
| 官方 Provider 配置 | 同包 `cordis.patch.yml:1-12`；`maxInputBytes: 4096`、`maxOutputTokens: 64`、`timeoutMs: 60000` |
| 显式刷新是支持的场景 | 同包 `README.zh.md:28-30` |
| 全消息生成与失败语义 | `dsh-session-title-all-prompts-llm/README.zh.md:28-42`；超限报错而不截断；路由可继承主请求 |
| 官方刷新入口 | `dsh-session-title/lib/index.js:318-356`；要求 live Session；显式 refresh 可解钉 |
| 用户重命名会钉住标题 | 同文件 `:290-317`；具体覆盖策略仍须由用户选择 |
| 菜单公开注册接口 | `dsh-client-ui-context-menu/README.md:28-50`；Desktop 使用共享 Web Menu，见 `:86-92` |
| 会话菜单 target 与排序 | `dsh-client-ui-workspace/README.md:80-82,122-126`；新贡献使用菜单服务 |
| Host 命令契约 | `dsh-commands/README.md:30-68`；命令不进入模型消息，执行会写入 `command/run` / `command/done` |
| 官方 UI→Host 推荐模式 | `dsh-agent-preset/skills/dsh-doc/references/user-actions.md:5-15` |
| Bundle 生命周期与通用约束 | 同技能 `references/practices.md`、`references/ui-plugin.md` |

官方在线资料（规划时仍以运行安装为准）：

- [session-titles-bundle](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/session-titles-bundle/README.zh.md)
- [session-title](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-title/README.zh.md)
- [all-prompts Provider](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/session-title-all-prompts-llm/README.zh.md)
- [context-menu](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-context-menu/README.md)
- [workspace 会话菜单](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-workspace/README.md#session-row-actions)

## 7. 尚未验证的事项

- 第三方 Client 插件在当前 Desktop 中对 `remote.commands` 的实际注入与调用，需要最小插件实测。
- 冷会话命令执行后的 agent 驻留、释放和列表状态副作用尚未测试。
- 当前安装中部分编译后客户端包没有便于读取的 `.d.ts`；具体类型以可解析的源码包、运行时 inspection 或可用声明为准。
- 尚未验证菜单的实际展示、权限过滤、冷/归档会话行为及标题刷新 UI。
- 此前官方功能目录显示标题 Bundle 已启用，子任务也读到 Desktop Profile 清单包含它；新 session 应重新核实当前状态，不把历史快照当作实时事实。

## 8. Suggested skills

下一 session 开始时调用 Skill 工具：

1. **`dsh-doc`**：必须优先加载；依据当前安装核实 API、选择扩展点、规划插件结构与验证方式。按需读取其 `plugin-development.md`、`host-plugin.md`、`ui-plugin.md`、`user-actions.md`、`practices.md`、`verification.md`。
2. **`codebase-design`**：用于收敛配套 Bundle 的模块边界，保持 UI、命令与官方标题服务职责分离。
3. **`ego-browser`**：实现获批后用于 Desktop/Web 实际菜单交互与 UI 验证；本规划阶段不必启动。
4. **`writing-for-agents`**：若要新增 `AGENTS.md`、长期维护的规划文档或技能，再加载；不必为普通实现代码调用。
5. **`tdd`**：仅当用户要求测试先行时加载。

建议下一步先完成上述产品决策，再输出包含文件结构、接口契约、异常矩阵、验证计划和安装/卸载边界的实施计划。
