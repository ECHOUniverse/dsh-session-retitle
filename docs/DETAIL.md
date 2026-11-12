# 重新生成会话标题

在 DSH Desktop 的会话菜单中增加「重新生成标题」，复用官方 all-prompts Provider 与 sessionTitle.refresh()，不修改 DSH 核心。

## 使用

1. 启用官方“随对话更新的标题”Bundle 和本插件。
2. 在非归档会话的右键或行尾 … 菜单选择「重新生成标题」。
3. 成功时会话列表自动更新并显示 Toast；无可用文本或失败时显示对应反馈。

手动命名的会话会先显示阻塞式确认框。只有确认后才会调用官方 refresh；如果确认期间标题再次改变，需要重新确认。

## 行为边界

- 官方 Provider 未确认 enabled + active 时不执行，避免退化为确定性 fallback。
- 冷会话允许恢复后生成；归档会话不提供操作，Host 另做防御。
- 同会话重复点击以最新请求为准，旧结果不会覆盖新标题。
- 手动标题意外落为 fallback 时尝试恢复原手动标题；极端 Provider 切换竞态不具有通用事务保证。
- 无标题会话在生成失败后可能保留官方 fallback。
- 禁用或卸载会清理菜单、Modal 和 Remote，不撤销已产生的标题。

## 工程信息

- 唯一 Remote：sessionRetitle/execute；无斜杠命令、Agent 工具或 command/run/done 事件。
- 共享严格 descriptor、Host Retitle 深模块、Client Operation 与自写可访问性 Modal。
- 菜单项图标使用页面 baseline 模块表里的官方 primitives 刷新字形（keep external，不打包、不新增依赖）。
- 构建期 protocol 为 npm 可获得的 0.2.2-rc.1，运行环境为 DSH 0.2.2-rc.2；真实 spike 已验证该组合。
- 75 项单元/契约/真实 Cordis/jsdom 测试通过。
