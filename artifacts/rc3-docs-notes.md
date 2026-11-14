# DSH 插件引擎范围（`engines.dsh`）与兼容性官方说明调研

- 调研对象：`@hanxu131/dsh-session-retitle` 在 DSH **0.2.2-rc.3** 下被判定 `incompatible` 的根因与官方依据
- 调研时间：2026-11-14
- 本机 DSH：`dsh --version` → `0.2.2-rc.3`（`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`）
- 只读调研：除本文件外未修改任何仓库文件；未重启 DSH、未启动服务

> 证据路径约定：`ASAR` = `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/`（用 `ELECTRON_RUN_AS_NODE=1` 读 asar 内 `src/*.ts` 与 `README*.md`）。凡标「GitHub 同源」的条目，均已用 jsDelivr 拉取 `deepseek-ai/deepseek-harness@master` 原文逐行核对，行号与 asar 一致。

---

## 0. 结论速览（TL;DR）

| # | 问题 | 结论 | 性质 |
|---|---|---|---|
| 1 | `engines.dsh` 该写精确版本还是范围 | **写 SemVer 范围**；官方示例 `>=0.2.0 <0.3.0`，并要求范围覆盖该包支持的所有 DSH 版本 | 官方明确要求 |
| 2 | rc 版本范围怎么写 | DSH 判定固定传 `{ includePrerelease: true }`，普通范围即可匹配 rc 预发布，不需要 npm 的预发布特殊写法；实测 `>=0.2.2-rc.2 <0.3.0-0`、`>=0.2.0 <0.3.0`、`^0.2.2-rc.2` 都能匹配 `0.2.2-rc.3` | 实现事实（includePrerelease 未被官方文档点名，README 写了「预发布参与范围匹配」） |
| 3 | 兼容性判定规则 | `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`；**自身 engines.dsh 单独决定，忽略 peerDependencies**；空/非法范围（含 `workspace:`）视为不兼容 | 官方明确要求 + 源码确认 |
| 4 | `dsh plugin allow-version` 是什么 | **精确「包@版本 × DSH 版本」豁免**，写进 profile 的 `compatibility.json`；只用于显式接受风险，**不是修复手段**，升级插件或升级 DSH 都不继承 | 官方明确要求 |
| 5 | rc.2→rc.3 是否破坏性 | **不是**。Release notes 只有 1 个新特性（DeepSeek 会话导入插件）+ 1 个 Windows 更新修复；tag 间 compare 仅 6 个提交；rc.3 内置 upgrade-guide 没有 `v0.2.2-rc.2` 段 | 官方明确（Release notes + tag 内容） |
| 6 | 官方是否提供自检命令 | **没有专用命令**。可用：`dsh --profile X --dump-config`（stderr 打印 `skipping profile bundle`）、`dsh plugin --profile X version-exemptions`、Web 插件页状态/版本列表、`plugin_manager` 工具 | 实现事实 |
| 7 | 修复建议 | 把 `"engines": { "dsh": "0.2.2-rc.2" }` 改为 `">=0.2.2-rc.2 <0.3.0-0"`（首选）或 `">=0.2.2-rc.2 <0.3.0"`；**不要**把 `allow-version` 当长期方案 | 推断（官方文档 + 本机社区惯例） |

**最小修复（推荐）**

```json
"engines": {
  "node": "^22.19.0 || >=24",
  "dsh": ">=0.2.2-rc.2 <0.3.0-0"
}
```

理由见 §7。

---

## 1. 官方文档在哪里（来源清单与可达性）

| 层级 | 位置 | 是否发布在官网 | 说明 |
|---|---|---|---|
| 文档站 | https://deepseek-harness.github.io/deepseek-harness/ | 是 | 仓库 `README.md` 第 9 行给出；VitePress，`cleanUrls: true`，中文为根 locale，英文在 `/en/` |
| 文档源 | 仓库 `docs/` | — | 插件打包页：`docs/user/develop/basic/publish.md`；插件索引格式：`docs/user/guide/plugin-market.md` |
| 包参考 | 各包 `README.md`（`packages/**/README.md`） | **否** | 只在 GitHub 仓库中，未发布到文档站；兼容性规则主要在 `packages/boot/app-boot/README.md`、`packages/boot/plugin-manager/README.md`、`packages/util/package-manifest/README.md` |
| 实现源码 | `packages/boot/app-boot/src/plugin-compatibility.ts` 等 | 否 | 判定语义的最终依据 |
| 变更说明 | GitHub Releases（tag `dsh-v0.2.2-rc.3`）+ `docs/upgrade-guide/` | 部分 | Release notes 是公开发布说明；upgrade-guide 随 `@deepseek-ai/dsh` 包与 tag 发布 |

本机 rc.3 应用内确实打包了与 `master` 同源的文档（`ASAR@deepseek-ai/dsh/docs/` 与 `ASAR@deepseek-ai/*/README.md`），下面所有行号均可在本机直接复现。

---

## 2. Q1：`engines.dsh` 应该怎么声明

### 2.1 官方明确要求：写「范围」，且范围要覆盖所有受支持版本

1) **官方插件发布文档**（文档站已发布，可直接访问）
   - 线上：https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish （中文根：https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish ）
   - 源：`ASAR@deepseek-ai/dsh/docs/user/develop/basic/publish.md:66`（GitHub 同源 `docs/user/develop/basic/publish.md#L66`）
   > "Declare the DSH releases the bundle supports with an `engines.dsh` **SemVer range**, for example `"engines": { "dsh": ">=0.2.0 <0.3.0" }`. Installation and profile startup refuse a bundle whose range the running DSH does not satisfy; without `engines.dsh`, they check its `@deepseek-ai/dsh*` peer dependency ranges instead."

2) **官方迁移指南**（0.2.1-alpha.3 起 engines.dsh 优先的变更）
   - 源：`ASAR@deepseek-ai/dsh/docs/upgrade-guide/v0.2.1-alpha.3/plugin-engines-dsh/guide.md:18`
   > "If your package declares `engines.dsh`, **make that range cover every DSH release the package supports**, because DSH peer ranges no longer widen or narrow it. Remove `engines.dsh` to keep peer-based checking."

3) **清单字段定义**（`@deepseek-ai/dsh-package-manifest`）
   - 源：`ASAR@deepseek-ai/dsh-package-manifest/README.md:56`（GitHub 同源 `packages/util/package-manifest/README.md#L56`）
   > "`engines.dsh` | Author-declared compatible DSH versions as a **SemVer range, including exact prerelease versions**. This field sits beside `engines.node` and `engines.npm`; an engines object may omit `dsh`."

4) **插件索引格式**（engines.dsh 在索引里的含义）
   - 源：`ASAR@deepseek-ai/dsh/docs/user/guide/plugin-market.md:137,139`（线上 https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market ）
   > 137: `engines.dsh` | no | SemVer **range** of DSH versions this version runs on; absent means any.
   > 139: `engines.dsh` should match the package's own `engines.dsh`, which DSH checks again at installation …

### 2.2 精确版本（含精确预发布）「合法但不推荐」

- 官方字段定义明确允许 "**including exact prerelease versions**"（上引 package-manifest README:56）——所以 `"0.2.2-rc.2"` 这种写法在语法/判定上是允许的，这也是该插件当前写法「不算错但会立刻失效」的原因。
- 但**没有任何官方文档推荐固定精确版本**；相反，publish.md 要求填 "range"，迁移指南要求「覆盖所有支持版本」。
- 结论：**固定 `"0.2.2-rc.2"` 与该包宣称支持的 0.2.2-rc 线自相矛盾**，每出一个 rc 都会重新触发 `incompatible`（这正是当前现象）。

### 2.3 预发布（rc）范围该怎么写 —— DSH 的 includePrerelease 语义

官方**没有**单独一节讲「rc 怎么写」，但给出了两条等价事实：

- 文档描述：`ASAR@deepseek-ai/dsh-app-boot/README.md:54`（GitHub 同源 `packages/boot/app-boot/README.md#L54`）
  > "… **Prereleases participate in range matching.** A manifest with neither declaration imposes no constraint; empty or invalid ranges, including a `workspace:` value in `engines.dsh`, are incompatible."
- 实现：`ASAR@deepseek-ai/dsh-app-boot/src/plugin-compatibility.ts:51-53`（GitHub 同源 `packages/boot/app-boot/src/plugin-compatibility.ts#L51-L53`）

```ts
function satisfies(runtimeVersion: string, range: string): boolean {
  return range.trim() !== '' && semver.satisfies(runtimeVersion, range, { includePrerelease: true })
}
```

也就是说：**在 DSH 里，普通范围本身就匹配 rc 预发布**，不需要 npm 那套「比较符里必须写 prerelease 才匹配 prerelease」的绕法。用 DSH 自带的 semver 7.8.6 实测（runtime = `0.2.2-rc.3`，`{includePrerelease:true}`）：

| range | 0.2.2-rc.2 | **0.2.2-rc.3** | 0.2.3 | 0.3.0-rc.1 | 0.3.0 |
|---|---|---|---|---|---|
| `"0.2.2-rc.2"`（现状） | true | **false** | false | false | false |
| `">=0.2.2-rc.2 <0.3.0-0"` | true | **true** | true | false | false |
| `">=0.2.2-rc.2 <0.3.0"` | true | **true** | true | **true** | false |
| `"^0.2.2-rc.2"` | true | **true** | true | false | false |
| `">=0.2.0 <0.3.0"`（官方示例） | true | **true** | true | **true** | false |
| `"0.2.2"` / `"~0.2.2"` | false | false | true / false | false | false |
| `">=0.2.0 <0.3.0"`（去掉 includePrerelease） | false | **false** | true | false | false |

注：
- `-0` 上界（`<0.3.0-0`）是 semver 惯用法，用于排除 0.3 的所有预发布；本机已有插件在用（见 §7.2）。
- 官方示例 `>=0.2.0 <0.3.0` 在 `includePrerelease:true` 下能匹配 rc.3，**但也会匹配 `0.3.0-rc.*`**；若要保持「只到 0.2.x 稳定线 + 0.2 的 rc」，用 `-0` 上界更精确。
- 若范围写成「final 版本」形式（如 `0.2.2`、`~0.2.2`）则**匹配不到** rc，这是最容易踩的坑之一。

---

## 3. Q2：兼容性判定规则（源码 + 类型注释确认）

实现：`ASAR@deepseek-ai/dsh-app-boot/src/plugin-compatibility.ts`（GitHub 同源 `packages/boot/app-boot/src/plugin-compatibility.ts`）

| 行号 | 内容 | 结论 |
|---|---|---|
| `:51-53` | `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` | 预发布参与匹配；空串直接 false |
| `:55-61` | 先读 `engines`；存在 `engines.dsh` 时**只用它判定** | 自身 engines.dsh 优先 |
| `:62-73` | 否则遍历 `peerDependencies`，只认 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*`；`workspace:^`/`~`/`*` 等价于当前运行时版本 | peer 回退规则 |
| `:56-60` | `engines` 非对象、`engines.dsh` 非字符串 → 抛错（判 manifest 格式错误） | 非法写法 = 拒绝 |
| `:76-102` | `evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)`：返回 `{name, version, runtimeVersion, requirements, exempted}` 或 `undefined`（完全满足） | 这是 T3 要直接调用的自检 API |
| `:110-117` | `pluginCompatibilityWarning()` 生成用户看到的英文告警，末尾带 `Exact-version exemption: active / not active` | 与报错文案逐字对应 |

类型注释（同文件 `:7-15`）：
> "`requirements`: Only requirements the running dsh version does not satisfy: `engines.dsh`, or dsh peer package names."

运行时版本来源：`:39-49` `getDshRuntimeVersion()` 读 app-boot 自己的 `package.json.version`（即 `0.2.2-rc.3`），**不是** `dsh --version` 的另行解析——两者一致，见 CLI README `apps/cli/README.md:39`。

对应的官方文档句：
- `ASAR@deepseek-ai/dsh-app-boot/README.md:54`：engines.dsh 单独决定、peer 被忽略、预发布参与匹配、空/非法范围不兼容、`workspace:` 非法。
- `ASAR@deepseek-ai/dsh/docs/upgrade-guide/v0.2.1-alpha.3/plugin-engines-dsh/guide.md:12,18`：同上（迁移视角）。
- `ASAR@deepseek-ai/dsh/src/plugin.ts:1` 文件头："Profile package management and explicit, exact-version compatibility approvals."

**判定链小结**：runtime = `0.2.2-rc.3`，range = `"0.2.2-rc.2"` → `satisfies(...)=false` → `requirements = {"engines.dsh": "0.2.2-rc.2"}` → 无豁免 → profile 组合时该 bundle 被 skip，stderr 打印 `pluginCompatibilityWarning`。

---

## 4. Q3：`dsh plugin allow-version` 的定位、适用场景与风险

### 4.1 它是什么（官方明确）

- CLI 实现在 `ASAR@deepseek-ai/dsh/src/plugin.ts:18-63`（GitHub 同源 `apps/cli/src/plugin.ts`）：
  - 三个子命令：`version-exemptions` / `allow-version <pkg@version> --dsh-version <exact> --accept-risk` / `revoke-version ...`
  - 授权前 **stderr 打印风险警告**（`:42`）：
    > "dsh: warning: allowing incompatible plugin versions can break the application or corrupt data. Approval applies only to the exact package and DSH versions."
  - 保存到 **profile 自己的 `compatibility.json`**（`resolveProfileDir(profile)`），不写 `package.json`、不改依赖、不改 patch。
- 官方参考：`ASAR@deepseek-ai/dsh-plugin-manager/README.md:74-83`（锚点 `#version-compatibility-and-exemptions`，GitHub 同源 `packages/boot/plugin-manager/README.md#L74-L83`）
  > 79: "An exemption is an **exact `package-name@version`** mapped to a list of **exact DSH runtime versions** in the profile's own `compatibility.json` … **Neither plugin upgrades nor DSH upgrades inherit permission.** … Granting also requires `acceptRisk: true`, only after warning the user that incompatible plugins may cause crashes or data loss …"
  > 81: "A grant takes effect on the **next composition**. A live profile recomposes, so the granted plugin mounts in the running session and the result reports `applied`; a startup-only profile keeps its current entries until restart and reports `restart-required`."
  > 83: 拒绝记录 `incompatible-version` 带 `name/version/runtimeVersion/requirements`；"Use the tool or CLI to grant an exemption **and retry the original operation**."
- 存储与校验细节：`ASAR@deepseek-ai/dsh-app-boot/src/profile-compatibility.ts:9-40,55-119`
  - 文件名 `compatibility.json`（`:10`）；键必须是**规范精确**的 `package-name@version`，值必须是**精确 DSH 版本列表**（`:20-40`，范围/前缀/空白一律拒绝）
  - 文件损坏不会挡住启动，但会变成只读，要求用户手修（`:55-93`）
  - 授权必须 `acceptRisk`，且只对**当前运行时版本**授权；撤销可以删历史版本（`:103-119`）

### 4.2 是否「只是临时绕过」？

**是。** 官方文案把豁免定位为「显式接受风险」，并把主路径写得很清楚（`plugin-compatibility.ts:112-116`）：

> "Update the plugin or install a plugin version compatible with this dsh runtime. To accept this risk explicitly, grant the exact-version exemption … then retry the installation or restart dsh."

即：**首选是让 manifest 正确（改 `engines.dsh` 或装兼容版本），豁免只是给「明知有风险仍要在这一对版本上跑」的场景兜底**。而且它不随插件/DSH 升级继承，等于每升一次都要重新授权一次——不适合作为长期修复。

### 4.3 适用 / 不适用

| 适用 | 不适用 |
|---|---|
| 插件已发布、作者尚未发兼容版本，用户临时验证 | 自己维护源码、能改 `engines.dsh`（应直接改范围） |
| 企业内固定版本组合、已充分测试、明确接受风险 | 想「一劳永逸」跳过兼容检查 |
| 排查问题（确认是否仅版本门槛导致） | 依赖脚本/CI 自动安装（豁免是 profile 本地文件，不随包分发） |

---

## 5. Q4：0.2.2-rc.3 是否有插件 API 变更？rc.2→rc.3 是否破坏性？

### 5.1 官方发布说明（权威）：rc.3 不是破坏性版本

- Release：https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3 （2026-11-13T07:56:55Z，prerelease）
  - 中文：「新增功能：新增实验性『DeepSeek 会话导入』插件…」；「问题修复：修复 Windows 桌面版应用内更新可能失败…」
  - 英文："New Features: Add an experimental DeepSeek chat import plugin…"；"Bug Fixes: Fix an issue that could cause Windows desktop in-app updates to fail…"
  - **没有** breaking changes / 迁移项 / 插件 API 变更段落。
- 提交级对比：https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-rc.2...dsh-v0.2.2-rc.3
  - `ahead_by: 6`，6 个提交：`fix(ci): cache the verified bubblewrap archive…`、`Merge … release-0.2.2-ci-bubblewrap-cache`、`Merge … fix/release-0.2.2-restart-status-cwd`、`feat(experimental): 导入 DeepSeek 官网对话导出为会话 (#8342)`、`release(dsh): 0.2.2-rc.3`、`Merge … worktree-release-dsh-0.2.2-rc.3`
  - 文件变更 300 个，绝大多数是各包 `package.json` 版本号从 `0.2.2-rc.2` → `0.2.2-rc.3` 的 release bump；**没有** `packages/boot/**` 判定逻辑变更。
- tag 内容佐证：rc.3 tag 的 `docs/upgrade-guide/` 目录**最新只到 `v0.2.2-rc.1`**，没有 `v0.2.2-rc.2` 段：
  - https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.3/docs/upgrade-guide
  - 本机 rc.3 包内同样只有到 `v0.2.2-rc.1`（`ASAR@deepseek-ai/dsh/docs/upgrade-guide/README.md` 的章节表 + 目录列表实测：`v0.2.2-rc.2`、`v0.2.2-rc.3` 目录**均不存在**）
  - upgrade-guide 的生成规则（`ASAR@deepseek-ai/dsh/docs/upgrade-guide/README.md:3`）："A `v<T>` section lists what to change when upgrading from release vT to the release after it; **vT is the release being left, not the target**." → 没有 `v0.2.2-rc.2` 段 = 官方没有发布「离开 rc.2 需要迁移」的说明。

**结论：rc.2 → rc.3 对插件 API 无官方破坏性变更，把 `engines.dsh` 扩到覆盖 rc.3 是低风险动作。** 但这只是文档/发布层面的证据，代码级 API 行为仍应由任务 T1（compat-audit）逐项确认。

### 5.2 一个必须避开的误读：master 上有一套 `v0.2.2-rc.2` 迁移指南，但它**不属于 rc.3**

`master` 当前 `docs/upgrade-guide/v0.2.2-rc.2/` 有 13 个指南（如 `cordis-root-and-intercept-metadata`、`client-module-metadata`、`session-status-package`、`package-export-cleanup`、`experimental-tool-error-codes`、`shell-fs-tool-error-codes` …），但：

- 这些目录 **在 `dsh-v0.2.2-rc.3` tag 中不存在**（GitHub Contents API 查 `?ref=dsh-v0.2.2-rc.3` 返回 404；tag 的 upgrade-guide 列表止于 `v0.2.2-rc.1`）。
- rc.3 build 中也能验证其中一个变化未落地：指南 `session-status-package` 说的 `@deepseek-ai/dsh-client-ui-session-status` 包 **在 rc.3 的 asar 中不存在**（`ASAR@deepseek-ai/` 下无此包）。
- `master` 相对 rc.3 tag 已 `ahead_by: 608`；rc.3 的 release 分支明显先切出，之后 master 继续推进下一版本。

→ 这些指南是**下一版本的迁移预告**，不能当 rc.3 的 API 变更证据（其目录名 `v0.2.2-rc.2` 与 tag 的对应关系存在 off-by-one 歧义，本文不据此下结论）。**建议 T1 在审计时把它们当作「未来升级」的参考清单，而不是 rc.3 的现状。**

---

## 6. Q5：官方自检手段与修复后验证

### 6.1 没有专用 "compatibility check" 命令

- `dsh --help`（实测）只暴露：`--version`、`--profile`、`--from-default-profile`、`--patch`、`--dump-config`、`--dump-config-schema`、`--dump-default-config`。
- `dsh plugin --help`（实测）只描述「把参数转发给 profile 目录里的 pnpm」，**不列出** `allow-version/revoke-version/version-exemptions`（它们是在转发前被特殊解析的隐藏子命令，见 `ASAR@deepseek-ai/dsh/src/plugin.ts:18-79`）。
- 因此日常自检要「组合」下面几种官方界面。

### 6.2 可用的自检 / 诊断面

| 手段 | 命令或位置 | 期望/说明 | 证据 |
|---|---|---|---|
| **pre-boot 组合检查** | `dsh --profile <p> --dump-config` | **stderr** 每个被跳过的 bundle 一行：`dsh: skipping profile bundle "<pkg>": Plugin <name>@<ver> is incompatible with dsh <rt>: requirements {...} …`；修复后该行消失，且 **stdout 出现该 bundle 的 `# == <pkg>` 层注释** | `ASAR@deepseek-ai/dsh/src/profile-boot.ts:194-200`（`prepareProfile` → `reportSkippedBundles`）；`ASAR@deepseek-ai/dsh-app-boot/src/profile.ts:101-118`（`SkippedBundle` / 文案格式）；跳过原因正是 `pluginCompatibilityWarning`（`plugin.ts:110-117`） |
| 直接调用判定 API | `evaluatePluginCompatibility(manifest)` → `undefined` = 兼容 | 适合 T3 做单点断言（用 `ELECTRON_RUN_AS_NODE=1` 加载 app-boot） | `plugin-compatibility.ts:76-102` |
| 列出/管理豁免 | `dsh plugin --profile <p> version-exemptions`（JSON 输出） | 确认没有残留豁免（修好后应为 `{}`） | `dsh/src/plugin.ts:49-52` |
| Web 插件页 | Plugins 页：已安装 bundle 状态显示「未运行/问题 + 原因」；bundle 详情的版本列表逐版本标兼容性 | 英文文案即 `reasonIncompatibleVersion` | `ASAR@deepseek-ai/dsh-client-ui-plugin-manager/src/client/locales.ts:589-593`；`ASAR@deepseek-ai/dsh-plugin-manager/src/types.ts:281-296`（`PluginVersion.incompatible`） |
| `plugin_manager` 工具 | `action: list_version_exemptions / set_version_exemption`；`list_bundles` 结果带 `incompatible` | 授权必须 `acceptRisk: true`，`runtimeVersion` 必须是精确版本 | `ASAR@deepseek-ai/dsh/docs/tool-catalog.md:62,71-96`；`plugin-manager/src/types.ts:28-43,160-161` |

### 6.3 修复后如何验收（建议给 T3 的清单）

1. `dsh --profile retitle-spike --dump-config`：**stderr 不再**出现 `dsh: skipping profile bundle "@hanxu131/dsh-session-retitle"`；stdout 中出现 `# == @hanxu131/dsh-session-retitle` 层。
2. `dsh plugin --profile retitle-spike version-exemptions` → `{}`（确认不是靠豁免蒙混过关；本机 `~/.dsh/profiles/desktop/compatibility.json` 目前不存在，即桌面 profile 没有任何豁免）。
3. 单点断言 `evaluatePluginCompatibility(manifest)` → `undefined`（runtime 由 app-boot 自己读出 `0.2.2-rc.3`，也可显式传参）。
4. **Desktop（link 安装）需完全退出并重开 DSH**：profile 组合只在启动/重组时读取 bundle 的 manifest（`app-boot/README.md:56`："a running plugin's own `package.json` DSH requirement … judged only at the next recomposition or startup"）。插件页「刷新」不会重新判定 link 包的新 `engines.dsh`。
5. 重开后 Plugins 页该插件不再显示「问题/未运行」，会话标题菜单功能可用。

---

## 7. `engines.dsh` 的建议写法与理由

### 7.1 推荐

```json
"engines": {
  "node": "^22.19.0 || >=24",
  "dsh": ">=0.2.2-rc.2 <0.3.0-0"
}
```

**理由**

1. **符合官方「范围」要求**：publish.md:66 要求 SemVer range；迁移指南要求覆盖「所有该包支持的 DSH 版本」（`plugin-engines-dsh/guide.md:18`）。精确 `"0.2.2-rc.2"` 只覆盖一个 rc，违背该要求，且在 rc.3 上立即失效。
2. **覆盖已测试的两个版本**：下界含 `0.2.2-rc.2`（原声明、开发期 devDependencies 基线），不破坏既有用户；`0.2.2-rc.3` 实测匹配。
3. **不误放 0.3 预发布**：`<0.3.0-0` 是 semver 上界惯用法，实测排除 `0.3.0-rc.1`（若写 `<0.3.0` 会把 0.3 的 rc 也放进来）。这在 DSH 的 `includePrerelease: true` 下尤其重要。
4. **不依赖 npm 的预发布语法**：DSH 固定 `includePrerelease: true`（plugin-compatibility.ts:52），因此普通范围即可匹配 rc，无需 `>=0.2.2-rc.2-0` 之类改写。
5. **与同机社区/同作者惯例一致**：见 7.2。

**可接受的等价替代**

| 写法 | 适用 | 说明 |
|---|---|---|
| `"^0.2.2-rc.2"` | 想更简洁 | 实测等价于 `>=0.2.2-rc.2 <0.3.0-0`（caret 对 prerelease 上界按 `-0` 处理），排除 `0.3.0-rc.1` |
| `">=0.2.2-rc.2 <0.3.0"` | 不在意把 0.3.0-rc.* 放进来 | 最简单；但 0.3 的 rc 可能真有 breaking，慎用 |
| `">=0.2.0 <0.3.0"`（官方示例） | 想严格照抄官方示例 | 会匹配 `0.3.0-rc.*`；且覆盖到 rc.2 之前的 0.2.x，若那些版本实际未测过，语义上偏宽——但**官方示例就是这个**，可辩护 |
| 删掉 `engines.dsh`，只留 DSH peer 范围 | 想走 peer 回退 | 该包当前**没有** `peerDependencies`，删掉就等于「无约束」（`app-boot/README.md:54`："neither declaration imposes no constraint"），不建议 |
| 保持精确版 + `allow-version` | 临时验证 | 不推荐作为提交修复（见 §4.2） |

### 7.2 社区/同机惯例（**非官方**，仅作写法佐证）

读取 `~/.dsh/profiles/desktop/node_modules` 下的第三方 bundle 清单：

| 插件 | 版本 | `engines.dsh` |
|---|---|---|
| `@hanxu131/dsh-notice` | 0.3.0 | `">=0.2.1-rc.1 <0.3.0-0"` |
| `@hanxu131/toolscontrol-dsh` | 0.1.0 | `">=0.2.1-rc.1 <0.3.0-0"` |
| `@hanxu131/dsh-zotero` | 0.2.0 | `">=0.2.1-rc.1 <0.3.0-0"` |
| `@local/dsh-balance` | 0.1.1 | `">=0.2.1-rc.1 <0.3.0-0"` |
| `dsh-context` | 0.84.1 | `">=0.2.0-rc.2 \|\| >=0.2.1-rc.2 \|\| >=0.2.2-rc.1"`（并同步声明 3 个 DSH peer） |
| `@xfqz86/dsh-usage-stats` | 0.6.0 | **无** `engines.dsh`；仅 `peerDependencies` `">=0.1.7-alpha.1 <0.3.0"` |
| **`@hanxu131/dsh-session-retitle`** | **0.1.0** | **`"0.2.2-rc.2"` ← 唯一固定精确版本者** |

观察：同作者其他三个插件都用 `">=X-rc.Y <0.3.0-0"`，本插件是唯一「固定精确 rc」的，属于一致性问题，进一步支持 §7.1。

> 注意：以上是**社区惯例/本机现状**，不是官方规定；官方只要求「SemVer range 且覆盖受支持版本」。

---

## 8. 明确区分：官方要求 vs 推断

| 命题 | 性质 | 依据 |
|---|---|---|
| `engines.dsh` 是 SemVer range，可含精确预发布版本 | 官方明确 | package-manifest/README.md:56 |
| 官方示例是 `">=0.2.0 <0.3.0"`，并要求范围覆盖所有支持版本 | 官方明确 | publish.md:66；plugin-engines-dsh guide:18 |
| 判定用 `semver.satisfies(..., {includePrerelease:true})`；自身 engines 优先于 peers | 官方明确（文档 + 源码） | app-boot/README.md:54；plugin-compatibility.ts:51-74 |
| 空/非法范围、`workspace:` 值 → 不兼容 | 官方明确 | 同上；guide.md:12 |
| 豁免 = 精确包版本 × 精确 DSH 版本，存 `compatibility.json`，不随升级继承，只是「显式接受风险」 | 官方明确 | plugin-manager/README.md:74-83；profile-compatibility.ts:9-119 |
| rc.3 无官方 API 破坏性变更 | 官方明确（发布说明/tag 内容） | Release notes、compare、tag 的 upgrade-guide 目录 |
| 固定精确 rc 版本会导致每次 rc 升级都 incompatible，应改成范围 | **推断**（由「范围必须覆盖受支持版本」+ 实测 semver 表推出） | 无官方原句「禁止固定精确版本」 |
| 推荐 `">=0.2.2-rc.2 <0.3.0-0"`（含 `-0` 上界） | **推断 + 社区惯例** | 官方示例未用 `-0`；但 `includePrerelease:true` 下 `-0` 才排除 0.3 的 rc |
| `allow-version` 不应作为长期修复 | **推断**（官方把它写成「accept this risk explicitly」的兜底，主路径是更新插件/装兼容版本） | plugin-compatibility.ts:112-116 |
| rc.3 之后 master 的 `v0.2.2-rc.2` 指南属于下一版本 | **推断**（tag 中不存在、rc.3 build 缺 `dsh-client-ui-session-status`、master ahead 608）；目录名与版本存在 off-by-one 歧义 | §5.2 |

---

## 9. 未找到 / 无法确认的官方说明（如实记录）

1. **没有官方文章专门讨论「预发布范围怎么写」**：官方从未点名 `includePrerelease` 选项；只有 README 的自然语言「Prereleases participate in range matching」与源码。因此「rc 用普通范围即可」是由实现 + 文档推出的，不是原文规定。
2. **没有明文规定「不要固定精确版本」**：官方只说 range 要覆盖支持的所有版本（迁移要求），没有「禁止精确版本」的句子；精确预发布被视为合法。
3. **没有独立的 `CHANGELOG.md`**：rc.3 的变更说明只有 GitHub Release notes + compare + `docs/upgrade-guide/`（后者只在有需要迁移的变更时才生成段落）。
4. **文档站不发布包级 README**：app-boot / plugin-manager / package-manifest 的兼容性参考只在 GitHub 仓库，文档站只有用户向的 publish / plugin-market 页。
5. **没有专用兼容性自检命令**（如 `dsh plugin check`）；`dsh plugin --help` 也不列出 `allow-version`。
6. **master 上 `docs/upgrade-guide/v0.2.2-rc.2/` 的归属版本存在歧义**（不在 rc.3 tag 内，但目录名指向 rc.2→rc.3），本文未据此下结论；如需，可让 T1 在代码层面核对其中列出的 API 是否已存在于 rc.3。
7. 官方文档站（GitHub Pages）无 `sitemap.xml`；路由由 `website/docs.ts` 清单生成（`cleanUrls: true`，中文根 locale、英文 `/en/`）。

---

## 10. 可复现命令

```bash
# 版本
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' --version   # 0.2.2-rc.3

# 读 asar 内源码/文档（普通 bash 读不了 asar）
cat >/tmp/cat.cjs <<'EOF'
const fs=require('fs');
const p='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/'+process.argv[2];
fs.readFileSync(p,'utf8').split('\n').forEach((l,i)=>{ if(+process.argv[3]<=i+1 && i+1<=+process.argv[4]) console.log((i+1)+'| '+l) });
EOF
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' /tmp/cat.cjs @deepseek-ai/dsh-app-boot/src/plugin-compatibility.ts 51 53

# 官方仓库文档（GitHub raw 环境慢，优先 jsDelivr）
curl -sSL 'https://cdn.jsdelivr.net/gh/deepseek-ai/deepseek-harness@master/packages/boot/app-boot/README.md' | sed -n '54p'
curl -sSL 'https://cdn.jsdelivr.net/gh/deepseek-ai/deepseek-harness@master/docs/user/develop/basic/publish.md' | sed -n '66p'

# 发布说明 / tag 差异
curl -sS 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=5'    # dsh-v0.2.2-rc.3 的 body
curl -sS 'https://api.github.com/repos/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-rc.2...dsh-v0.2.2-rc.3'
curl -sS 'https://api.github.com/repos/deepseek-ai/deepseek-harness/contents/docs/upgrade-guide?ref=dsh-v0.2.2-rc.3'

# 修复后验证（T3）
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' --profile retitle-spike --dump-config 2>&1 | grep -E 'skipping profile bundle|# == @hanxu131/dsh-session-retitle'
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' plugin --profile retitle-spike version-exemptions
```

---

## 11. 证据索引（文件:行 / URL）

**本机 asar（`ASAR` = `…/Contents/Resources/app.asar/dsh/node_modules/`）**

- `@deepseek-ai/dsh-app-boot/src/plugin-compatibility.ts:39-49,51-53,55-74,76-102,110-117`
- `@deepseek-ai/dsh-app-boot/src/profile-compatibility.ts:9-40,55-101,103-119`
- `@deepseek-ai/dsh-app-boot/src/profile.ts:101-118,664-713`
- `@deepseek-ai/dsh-app-boot/README.md:52,54,56,58`
- `@deepseek-ai/dsh-plugin-manager/README.md:74-83`
- `@deepseek-ai/dsh-plugin-manager/src/types.ts:28-43,160-161,281-296`
- `@deepseek-ai/dsh-package-manifest/README.md:56`（另：`:96` 的「不强制」表述是该包自述的局限，与运行时实际行为冲突，**不作为依据**）
- `@deepseek-ai/dsh/src/plugin.ts:1,18-63,96-102`
- `@deepseek-ai/dsh/src/profile-boot.ts:194-200`
- `@deepseek-ai/dsh/docs/user/develop/basic/publish.md:66`
- `@deepseek-ai/dsh/docs/user/guide/plugin-market.md:137,139`
- `@deepseek-ai/dsh/docs/upgrade-guide/README.md:3`
- `@deepseek-ai/dsh/docs/upgrade-guide/v0.2.1-alpha.3/plugin-engines-dsh/guide.md:12,18`
- `@deepseek-ai/dsh/docs/tool-catalog.md:62,71-96`
- `@deepseek-ai/dsh-client-ui-plugin-manager/src/client/locales.ts:589-593`
- `@deepseek-ai/dsh-agent-preset/skills/dsh-doc/templates/{decoration,mcp}/package.json`（官方脚手架同样**不定** `engines.dsh`）

**官方 URL**

- 文档站发布页（EN）：https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish ；中文根：https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish
- 文档站插件索引页：https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market
- `engines.dsh` 字段定义：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/util/package-manifest/README.md#L56
- 判定规则：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.md#L54 ；实现：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/src/plugin-compatibility.ts#L51-L53
- 豁免参考：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md#L74-L83
- engines 优先迁移指南：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/upgrade-guide/v0.2.1-alpha.3/plugin-engines-dsh/guide.md
- 发布说明：https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3
- tag 差异：https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-rc.2...dsh-v0.2.2-rc.3
- rc.3 的 upgrade-guide（止于 v0.2.2-rc.1）：https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.3/docs/upgrade-guide
- master 的下一版迁移指南（**不属于 rc.3**）：https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/upgrade-guide/v0.2.2-rc.2

**本机环境证据（只读读取）**

- `~/.dsh/profiles/desktop/package.json`：bundles 含 `@hanxu131/dsh-session-retitle`（`link:` 本仓库）；`~/.dsh/profiles/desktop/compatibility.json` **不存在**（无豁免）
- `~/.dsh/profiles/retitle-spike/package.json`：`link:/Volumes/WD-1T/00_Workspace/00_Active/CodeProject/regeneratetitle-dsh`，bundles 同含该插件
- 社区清单：`~/.dsh/profiles/desktop/node_modules/@hanxu131/{dsh-notice,toolscontrol-dsh,dsh-zotero}/package.json`、`@local/dsh-balance/package.json`、`dsh-context/package.json`、`@xfqz86/dsh-usage-stats/package.json`
