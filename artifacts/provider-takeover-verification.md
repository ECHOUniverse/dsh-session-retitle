# 标题 Provider 配置接管：组合验证记录

日期：2026-11-14（Asia/Shanghai）
范围：本插件 bundle patch 对官方 all-prompts 标题 Provider 的接管与卸载恢复
环境：macOS；DSH Desktop runtime / CLI 0.2.2-rc.3
（/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh）

## 1. 方法

`--dump-config` 只做组合，不启动宿主：

```bash
CLI='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
DSH_HOME=/tmp/dsh-validate-home "$CLI" --profile <name> --dump-config
```

隔离 DSH_HOME 下复制 Desktop profile 的 package.json / cordis.patch.yml / cordis.yml，
node_modules 软链到 ~/.dsh/profiles/desktop/node_modules；**未修改用户的任何 profile 文件**。
三个变体：

| profile | 与 Desktop 的差异 |
|---|---|
| takeover-check | 与 Desktop 组合一致（bundle 顺序：官方标题 bundle 在前，本插件最后） |
| takeover-rollback | 从 bundles 移除 @hanxu131/dsh-session-retitle（模拟卸载） |
| takeover-wrong-order | 把本插件放到官方标题 bundle **之前**（反例） |

## 2. 基线（接管前，官方条目启用）

```yaml
# == @deepseek-ai/dsh-experimental-session-titles-bundle, patched by <profile>/cordis.patch.yml
- id: optional-session-title-all-prompts
  name: '@deepseek-ai/dsh-session-title-all-prompts-llm'
  config:
    targetWords: 5
    targetCjkCharacters: 10
    maxInputBytes: 4096
    maxOutputTokens: 512
    timeoutMs: 60000
# == @hanxu131/dsh-session-retitle
- id: session-retitle
  name: '@hanxu131/dsh-session-retitle'
  config: {}
```

## 3. 接管后（takeover-check）

stderr 无 patch 告警（说明 override 命中官方条目）。

```yaml
# == @deepseek-ai/dsh-experimental-session-titles-bundle, patched by @hanxu131/dsh-session-retitle, <profile>/cordis.patch.yml
- id: optional-session-title-all-prompts
  name: '@deepseek-ai/dsh-session-title-all-prompts-llm'
  config:
    targetWords: 5
    targetCjkCharacters: 10
    maxInputBytes: 4096          # 用户 profile 的 config 覆盖仍然保留
    maxOutputTokens: 512
    timeoutMs: 60000
  disabled: true                 # 本插件接管
# == @hanxu131/dsh-session-retitle
- id: session-retitle
  name: '@hanxu131/dsh-session-retitle'
  config: {}
- id: session-retitle-all-prompts
  name: '@deepseek-ai/dsh-session-title-all-prompts-llm'
  config:
    targetWords: 5
    targetCjkCharacters: 10
    maxInputBytes: 32768
    maxOutputTokens: 512
    timeoutMs: 60000
```

结论：同一官方实现只由一个条目挂载；disabled 与 config 是两个独立 patch key，
用户 profile 对官方条目 config 的覆盖没有重新启用它。

## 4. 卸载恢复（takeover-rollback）

```yaml
# == @deepseek-ai/dsh-experimental-session-titles-bundle, patched by <profile>/cordis.patch.yml
- id: optional-session-title-all-prompts
  name: '@deepseek-ai/dsh-session-title-all-prompts-llm'
  config:
    targetWords: 5
    targetCjkCharacters: 10
    maxInputBytes: 4096
    maxOutputTokens: 512
    timeoutMs: 60000
```

无 disabled、无 session-retitle* 条目：移除 bundle 后组合回到接管前的官方条目
（用户 profile 的 4096/512/60000 覆盖自动重新生效），无残留条目、无清理代码路径。

## 5. 反例：bundle 顺序错误（takeover-wrong-order）

stderr：

```text
dsh: [@hanxu131/dsh-session-retitle] patch: entry "optional-session-title-all-prompts" not found
```

组合中同时出现两条 provider 条目（本插件 32768 + 官方 4096），运行时会重复注册 Provider。
→ README 的顺序要求（本 bundle 必须排在官方标题 bundle 之后）是硬约束，不是建议。

## 6. 单元/契约测试

```text
typecheck  exit 0
build      exit 0
test       tests 84 / pass 84 / fail 0
```

新增 8 项 test/patch-takeover.test.mjs 覆盖：patch 结构、组合语义（接管 / 用户 config 覆盖不能重新启用 /
移除 bundle 即恢复）、客户端预检（模块名匹配使 disabled 官方行 + 接管行仍判定可用）、
接管只存在于 bundle patch（src/scripts/lib 无接管代码路径）、文档语义。

## 7. 未覆盖（需真机验收）

- 真实 Desktop 重启后的运行时行为（本记录只验证组合，不验证 Provider 注册与 LLM 调用）。
- 长会话（如 7a344049…，约 7.7 KB 人类消息）重新生成标题成功、日志不再出现
  input is N bytes, exceeding maxInputBytes。
- 插件管理器里卸载/禁用 bundle 的真实恢复行为。
