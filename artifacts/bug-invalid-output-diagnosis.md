# 诊断：重新生成标题失败「Provider 返回了无效标题」

日期：2026-11-12（Asia/Shanghai）
用户报告会话：session-07454ac8-1811-4979-8086-10ac31f50a1b（04_Explore）

## 症状

点击「重新生成标题」后 Toast：**重新生成标题失败：Provider 返回了无效标题**（我们映射的 failure code = invalid-output）。

## 复现环

脚本：/tmp/loop-retitle.sh（隔离 Web Profile retitle-spike + opencode-go provider + 本插件 + 官方标题 Bundle）
流程：创建会话 → 选择 opencode-go/deepseek-v4.1-flash（reasoning high）→ 一轮 REPL → sessionRetitle/execute。

失败输出（与截图一致）：

    {"outcome":"failed","code":"invalid-output","actualTitle":"Reply with exactly LOOP_OK and","actualSourceKind":"fallback"}

## 关键证据

1. 用户会话日志（逐帧 zstd 解压）：3 次 `session/title-llm-request`，参数为
   `route=opencode-go/deepseek-v4.1-flash`、`reasoningEffort=low`、**`maxTokens=64`**；
   会话最终只有 seq=27 的 fallback 标题，从未产生 provider 标题。
2. 临时探针（已移除）打印出原始拒绝原因：
   **`session-title-llm: title output reached maxOutputTokens`**。
3. 机制：官方 all-prompts Provider 固定 `maxOutputTokens: 64`（bundle cordis.patch.yml），
   推理型模型在输出正文前先消耗 thinking tokens，64 上限在正文前被截断。

## 假设检验（同一脚本、同一路由）

| 配置 | 运行次数 | 结果 |
|---|---|---|
| maxOutputTokens = 64（官方默认） | 5 | 1 次 refreshed；4 次 failed / truncated-output |
| maxOutputTokens = 512 | 4 | 4 次 refreshed（含真实标题文本） |

结论：64-token 上限是根因；截断是间歇性的（约 80% 失败率），因此用户偶发看到失败。
非推理路由（deepseek-official/deepseek-flash）此前多次实测均成功，与此解释一致。

## 修复

1. 代码：把该错误从笼统 `invalid-output` 拆为独立 `truncated-output`，
   Client 提示改为可操作文案：标题模型输出被上限截断，建议把 maxOutputTokens 提到 512。
2. 配置（用户已批准）：`~/.dsh/profiles/desktop/cordis.patch.yml` 增加
   `optional-session-title-all-prompts` 覆盖，`maxOutputTokens: 512`，其余字段保持不变；
   原文件已备份为 `cordis.patch.yml.bak-retitle-maxoutputtokens-*`。
3. 需要完全重启 DSH 才生效（补丁只在启动时组合一次）。

## 回归测试 seam

Host `failureCode()` 是正确 seam：输入真实 Provider 错误文本，断言结构化 code。
新增用例覆盖 `reached maxOutputTokens` 与 `exceeded maxOutputTokens=64` 两种 message，
并验证 shared 严格 schema 接受 `truncated-output`。

## 遗留

- 官方 Bundle 的 64-token 默认值仍会在其它 Profile / 其它机器上造成同类失败；上游宜提高默认值或对推理模型禁用 thinking。
- 本次修复不改变官方 Provider 逻辑，只改我们的归类与提示，并在用户 Profile 覆盖配置。
