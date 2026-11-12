# 完整实现集成验证记录

日期：2026-11-12（Asia/Shanghai）
环境：一次性 Web Profile retitle-spike（独立端口）；测试工作区 /tmp/dsh-retitle-spike-ws；可丢弃测试会话；另在用户当前 Desktop Profile 安装 0.1.0 做入口实测。

## 一次性 Profile 实测

- 真实标题刷新：成功 Toast；session/title seq=26 的 source.provider 为 session-title-all-prompts-llm；无 command/run/done。
- 手动标题：重命名为 Manual spike title；首次刷新出现阻塞式 Modal；取消保持原标题；确认后生成 SPIKE_OK reply test（seq=30，all-prompts），列表自动更新。
- 归档：归档会话右键菜单无“重新生成标题”。
- Provider 禁用：提示“官方 all-prompts 标题 Provider 不可用，请启用后重试。”，未调用生成。
- 并发：同会话两个直接 Remote 请求，第一个 failed/superseded，第二个 refreshed（eventSeq=34）。
- 运行中会话：主请求保持 running=true；标题刷新遵循官方 supersede 规则，不中断主任务。
- 冷会话（完整实现）：重启且无 UI 打开时 agentAvailable=false；sessionRetitle/execute 返回 refreshed（eventSeq=38）；调用后 agentAvailable=true。

## 当前 Desktop Profile

- 通过插件页安装并启用 @hanxu131/dsh-session-retitle 0.1.0；官方“随对话更新的标题”保持启用。
- 新建可丢弃会话“Desktop retitle confirmation request”，发送一条 REPL。
- 右键菜单确认包含“重新生成标题”（AXMenuItem）；同一行 AXShowMenu（Shift+F10 / 上下文菜单等价入口）也包含该项。
- 执行菜单项后，该会话标题投影从 seq=23 前进到 seq=26，标题不变（幂等刷新），说明真实链路执行。
- 未单独捕获“行尾 …”悬停按钮的点击路径；它与右键共用同一 session target 贡献（官方 workspace 文档），此项按推断记录，未作为实测证据。

## 测试与构建

- typecheck 通过。
- 73/73 单元/契约/真实 Cordis/jsdom 测试通过（含审查修复新增用例）。
- pnpm pack 成功。

## 审查后修复

1. 手动标题补偿补齐 refresh 抛错路径：refresh 写 fallback 后抛错时立即 rename 恢复；补偿失败单独报告。新增 4 条测试。
2. 跨会话旧结果不再弹 Toast：结果反馈要求全局最新 token；新增 5 条测试。
3. provider-unavailable 回显实际状态：恢复成功/恢复失败说明不同，新增中英文案。
4. Standards 清理：统一 describeError；operation 预检失败提示提取 helper；menu/operation 共用翻译绑定；overlay 去掉多余 translate 包装。menu.ts 外层 try/catch 经实测是服务不可读时的 fail-closed 防线，保留。测试文案去重作为已知遗留项跳过。

## 审查结论

- Standards 轴：0 条硬性违规（仓库无成文编码规范）；cleanup 后剩余 judgement-call 已收敛。
- Spec 轴：3 条真实偏差（手动标题补偿抛错路径、跨会话旧 Toast、竞态实际状态未回显）均已修复并由新增测试锁定；1 条结构偏离（计划中的 contribution.ts/index.tsx/modal.tsx 文件划分）由等价实现承担。

## 未逐一注入的真实故障

超限、无路由、超时、非法输出、Provider 输出空等由 Host 结构化单测覆盖；未在真实 Provider 上逐一注入。
