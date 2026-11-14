# DSH 0.2.2-rc.3 兼容性审计报告

- 审计对象：`@hanxu131/dsh-session-retitle@0.1.0`（仓库 `/Volumes/WD-1T/00_Workspace/00_Active/CodeProject/regeneratetitle-dsh`）
- 对照运行时：
  - **rc.3（被测运行环境）**：已安装 DSH 0.2.2-rc.3，`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/*`（下称 `R3/<pkg>/...`；ESM 动态导入、`fs` 直读 asar 取得，含打包源 `src/`）
  - **rc.2（对照基线）**：npm 已发布包 `@deepseek-ai/<pkg>@0.2.2-rc.2`（`npm pack` 解包至 `/tmp/rc2/<pkg>/`，下称 `R2/<pkg>/...`）
  - **rc.1（插件构建期依赖）**：`@deepseek-ai/dsh-typert-protocol@0.2.2-rc.1`（npm 可取）
  - **rc.3 的 npm 包**：`@deepseek-ai/dsh-typert-protocol@0.2.2-rc.3`、`@deepseek-ai/dsh-app-boot@0.2.2-rc.3` 确认存在并单独解包核对
- 插件源码：`src/host/{index,retitle,service}.ts`、`src/client/*.ts(x)`、`src/shared/{remote,result,ids}.ts`、`package.json`、`cordis.patch.yml`、`test/package-contract.test.mjs`、已生成 `lib/*`
- 方法：逐包二分（`diff -rq` 全树 + `src/` 源码树 + 运行时 JS + `package.json` exports），对关键被消费面在 rc.3 中定位契约定义与行号，并以 rc.2 中同名同文件行号对比；对 semver 门禁用 DSH 安装内实际使用的 `semver@7.8.6` 做行为实测。
- 审计只读：除本文件外未修改仓库任何文件；未重启 DSH、未卸载/重装插件、未启动新服务。

---

## 一、结论

1. **插件代码与 DSH 0.2.2-rc.3 的 API 消费面完全兼容**：本报告逐项核对的 13 个被消费面在 rc.2 → rc.3 之间**没有任何破坏性变化**；涉及主机/客户端契约的官方包源码树（`src/`）与运行时 JS 逐字节相同（详见第三节差异清单）。
2. **当前插件不能直接在 rc.3 组合进 profile，唯一原因是 `package.json` 的 `engines.dsh` 被钉成精确版本 `"0.2.2-rc.2"`**。rc.3 的 bundle 组合门禁用 `semver.satisfies(runtimeVersion, engines.dsh, { includePrerelease: true })` 判定，运行版本 `0.2.2-rc.3` 不满足精确字符串 `0.2.2-rc.2`，于是该 bundle 被记入 `skippedBundles` 并在启动时打印 “skipping profile bundle … is incompatible with dsh …”。
3. **修复只需改元数据，不需要改 `src/`、`lib/`、`cordis.patch.yml`、`locale/`、`icon`**：
   - 必改（P0）：`package.json` 的 `engines.dsh` → 建议 `">=0.2.2-rc.2 <0.3.0-0"`（该范围经实测同时匹配 rc.2 与 rc.3，且排除 0.3.0 及其预发布）。
   - 建议（P1）：`devDependencies.@deepseek-ai/dsh-typert-protocol` 由 `0.2.2-rc.1` 升到 `0.2.2-rc.3`（rc.3 的 `.d.ts` 与 rc.1 逐字节相同，构建产物不变）；同步更新 `pnpm-lock.yaml`。
   - 建议（P1）：`test/package-contract.test.mjs` 增加“`engines.dsh` 必须是范围且同时满足 rc.2/rc.3、拒绝 0.3.0”的契约断言，防止再次被钉死。
   - 文档（P2）：README/DETAIL/HANDOFF/IMPLEMENTATION_PLAN 中“engines 固定 0.2.2-rc.2 / npm 仅发布 rc.1”的描述已过期（npm 现有 rc.2、rc.3）。
4. 无任何“必须改代码”的项；也**没有**发现 rc.3 在 Remote 协议、Gateway agent 解析、sessionTitle 快照/错误码、workspaceRegistry、pluginInventory、contextMenus、locale、slots、primitives 图标或 Client 注入解析上的破坏性变更。

---

## 二、根因证据（engines.dsh 门禁链，rc.3）

被消费面之外的关键机制（本任务“不可直接运行”的直接原因）：

| # | 环节 | rc.3 行为 | 证据（R3 = asar 路径） |
|---|---|---|---|
| S1 | 运行时版本取值 | 读 **app-boot 自己的 package.json** 版本；asar 内为 `0.2.2-rc.3` | `R3/dsh-app-boot/src/plugin-compatibility.ts:44-49`；`R3/dsh-app-boot/package.json`（version=0.2.2-rc.3） |
| S2 | 判定语义 | `satisfies(runtime, range, { includePrerelease: true })`；有 `engines.dsh` 时**只看它**、忽略 peerDependencies；精确串 `0.2.2-rc.2` 只匹配 rc.2 | `R3/dsh-app-boot/src/plugin-compatibility.ts:51-53, 55-61, 87-102` |
| S3 | profile bundle 组合 | 遍历 `dsh.profile.bundles`：`evaluatePluginCompatibility(bundleManifest, exemptions)` 不满足且未豁免 → 抛错 → 记入 `skippedBundles`，**该 bundle 的 patch 层完全不加载**（插件因此整体不挂载） | `R3/dsh-app-boot/src/profile.ts:689-707`（尤其 698-700）、`R3/dsh-app-boot/src/profile.ts:101-107` |
| S4 | 启动期打印 | `dsh: skipping profile bundle "<name>": Plugin <name>@<ver> is incompatible with dsh <runtime>: requirements {"engines.dsh":"..."} …` | `R3/dsh-app-boot/src/profile.ts:114-117`；警告正文 `R3/dsh-app-boot/src/plugin-compatibility.ts:110-117` |
| S5 | 安装/启用门禁（同一判定） | 安装前 preflight 与启用/列表都会用同一函数拦截 | `R3/dsh-plugin-manager/src/operations.ts:361-380`（373-377 拦截安装）、`R3/dsh-plugin-manager/src/index.ts:569-570` |
| S6 | 行级 deny（profile 根/预设行） | 普通插件行被 `disabled=true` 并输出 `disabling profile plugin …`（与 S3 是并列入口） | `R3/dsh-app-boot/src/compatibility-preflight.ts:74-84`、`180-187` |

**rc.2 同机制等价**：`R2/dsh-app-boot/src/plugin-compatibility.ts:51-60`（同一实现）、`R2/dsh-app-boot/src/profile.ts:689-707, 114-117`（同样行号、同样语义）。即 rc.3 **没有收紧或改变** engines 判定，只是插件自己写的字面量 rc.2 ≠ 运行版本 rc.3。

**semver 实测**（DSH 安装内 `semver@7.8.6`，`includePrerelease: true`）：

| engines.dsh | 0.2.2-rc.2 | 0.2.2-rc.3 | 0.2.2 | 0.2.3(-rc.x) | 0.3.0-0 / 0.3.0 |
|---|---|---|---|---|---|
| `"0.2.2-rc.2"`（现状） | ✅ | ❌ | ❌ | ❌ | ❌ |
| `">=0.2.2-rc.2 <0.3.0-0"`（建议） | ✅ | ✅ | ✅ | ✅ | ❌ |
| `">=0.2.2-rc.2"` | ✅ | ✅ | ✅ | ✅ | ✅（不安全） |
| `"0.2.2-rc.3"` | ❌ | ✅ | ❌ | ❌ | ❌ |
| `"^0.2.2-rc.2"` | ✅ | ✅ | ✅ | ✅ | ❌（等价但可读性差） |

补充：即便不用 `includePrerelease: true`（`0.2.2-rc.3` 与范围中的 `>=0.2.2-rc.2` 比较器同 `major.minor.patch` 且该比较器带预发布标签），`>=0.2.2-rc.2 <0.3.0-0` 对 rc.2、rc.3 仍为 true（已实测），该范围在两种 semver 语义下都稳。

---

## 三、逐被消费面审计表

路径约定：`R3/<pkg>/...` = rc.3 asar 内的 `@deepseek-ai/<pkg>/...`；`R2/<pkg>/...` = npm rc.2 解包同名路径；`插件/...` = 本仓库相对路径。“相同”指该包 `src/` 源树与运行时 `lib/*.js` 在 rc.2/rc.3 之间 diff 为空（asar 仅剥离 `.d.ts`/`.map`）。

### 3.1 Host 面

| # | 被消费面（插件用法） | rc.2 行为 | rc.3 行为 | 破坏？ | 证据（rc.3 / rc.2） |
|---|---|---|---|---|---|
| H1 | `Remote` 装饰器、`TypertRemoteService`（含静态 `inject` 约定）、`createTypertRemoteInfo` | `Remote` 标记方法、`TypertRemoteService(ctx,key)` 暴露 `typertRemote` 绑定；`createTypertRemoteInfo(spec, zod)` 懒构建 descriptor/methods（含 `id/namespace/method/parameters/result/invoke`），`invoke` 按 `parameter.wire` 组参并追加 signal | 完全相同；`lib/index.js` 与 `lib/types/*.js`（含 `remote-info.js`）与 rc.2 **逐字节相同** | 否 | rc.3：`R3/dsh-typert-protocol/lib/index.js:326-337, 338-352, 363-371`；`R3/dsh-typert-protocol/lib/types/remote-info.js:10-67`；插件用法 `插件/src/host/service.ts:13-14,34-40,49-54`、`插件/src/shared/remote.ts:14,55-88`；rc.2：`R2/dsh-typert-protocol/lib/index.js`、`lib/types/remote-info.js` 与 rc.3 一致（diff 空） |
| H2 | `ctx.typert.register(contribution)`（`{package,face:'host',schemas:[],model,invocations}`） | 校验 package/face、拒绝重复 package-face、注册 schema 与 invocation（`localStore.validate`），返回 effect disposer | 完全相同 | 否 | rc.3：`R3/dsh-typert-registry/src/service.ts:561-589`（register）、`661-677`（validatePackage 接受 face host/client + model）、`679-700`（schemas）；插件 contribution `插件/src/shared/remote.ts:96-104`、注册 `插件/src/host/index.ts:20-33`；rc.2：`R2/dsh-typert-registry/src/service.ts` 同文件 diff 空 |
| H3 | `ctx.sessionTitle.get(session)` / `refresh(session,signal)` / `rename(session,title)` 与快照 `{title, source:{kind:'fallback'\|'provider'\|'user', provider?, model?}, eventSeq, updatedAt}` | `get` 折叠最新 title 事件；`rename` 追加 `session/title{source:{kind:'user'}}` 并 pin；`refresh` 显式重试 provider/落 fallback；失败错误码与消息见右栏 | 完全相同（函数签名、source 联合、eventSeq、消息字面量均无变化） | 否 | rc.3：`R3/dsh-session-title/src/index.ts:390-398`（get）、`400-431`（rename）、`433-462`（refresh）；快照类型 `R3/dsh-session-title/src/types.ts:27-56`；插件 seam `插件/src/host/retitle.ts:28-60,95-152`；rc.2：`R2/dsh-session-title/src/index.ts:395,411,440`（同文件一致） |
| H3b | 失败码/消息：`SESSION_TITLE_TIMEOUT`、`TimeoutReason`、`no logged request route is available`、`input is N bytes, exceeding maxInputBytes`、`title output must contain text only`、`reached maxOutputTokens`、`title model produced no text`、`returned an invalid result` 等 | 插件用这些片段映射 timeout/input-too-large/no-route/truncated-output/invalid-output | 完全相同（产生这些字符串的包 rc.2/rc.3 源树一致） | 否 | rc.3：`R3/dsh-session-title-llm/src/index.ts:68`（TIMEOUT 码）、`192`（no-route）、`248-250`（input bytes/maxInputBytes）、`R3/dsh-session-title-all-prompts-llm/src/index.ts:130-144`（text only/maxOutputTokens/no text）、`R3/dsh-session-title/src/index.ts:649-668`（标题校验族）、`R3/dsh-timeout/src/index.ts:12-22`（`TimeoutReason` 的 `name`/`code`）；插件映射 `插件/src/host/retitle.ts:215-229,236-256`；rc.2：上述四包 `src/` 与 rc.3 diff 为空 |
| H4 | `ctx.workspaceRegistry.archivedSessionIds`（`readonly SessionId[]`） | Workspace 注册表状态里读出归档会话集合；插件据此做归档防线（fail-closed） | 相同 getter 与状态形状 | 否 | rc.3：`R3/dsh-workspace/src/index.ts:355-362`；状态 schema `R3/dsh-workspace/src/spec.ts:44-62`；插件 `插件/src/host/retitle.ts:51-54,82-93`；rc.2：`R2/dsh-workspace/src/index.ts` 同文件 diff 空 |
| H5 | Remote `execute(agent, request, signal)` 的 agent 解析：descriptor `source:'lookup', lookup:'agent', wire:'agentId'` + `scope:{context:'agent',wire:'agentId'}` | Host `lookups.register('agent',{parameter:'agent',wire:'agentId',resource:'session',hostTypeSymbol:'@deepseek-ai/dsh-agent#Agent',wireTypeSymbol:'@deepseek-ai/dsh-session/types#SessionId',resolve:sessionId=>agents.get(sessionId)})`；loader 要求 scope.wire 必须选中唯一的 lookup 参数；gateway 解析后按位传参 | 完全相同（lookup 提供者、type symbol、wire 字段、loader 校验、gateway 解析逻辑均未变） | 否 | rc.3：`R3/dsh-agent/src/index.ts:259-276`；`R3/dsh-typert-loader/src/index.ts:223-265`；`R3/dsh-typert-protocol/lib/types/remote-info.js:34-64`；`R3/dsh-api-gateway/src/access.ts:107-140`、`R3/dsh-api-gateway/src/index.ts:1071-1116`；插件 descriptor `插件/src/shared/remote.ts:60-84`；rc.2：`R2/dsh-agent/src/index.ts:262`、`R2/dsh-typert-loader/src/index.ts`、`R2/dsh-api-gateway/src` 均 diff 空 |
| H6 | 官方 all-prompts provider 与 entry id：provider `'session-title-all-prompts-llm'`、bundle entry `'optional-session-title-all-prompts'` | bundle patch 先禁用 `session-title-llm` 行，再 insert `optional-session-title-all-prompts`（模块 `@deepseek-ai/dsh-session-title-all-prompts-llm`），默认 `maxInputBytes:4096 / maxOutputTokens:64 / timeoutMs:60000`；provider 导出名即插件常量 | **patch 文件与 rc.2 逐字节相同**；provider 名、entry id、模块名、默认配置、错误消息均未变 | 否 | rc.3：`R3/dsh-experimental-session-titles-bundle/cordis.patch.yml:1-12`；`R3/dsh-session-title-all-prompts-llm/src/index.ts:23`、`35-42`；rc.2：同路径文件与 rc.3 `diff` 为空（`PATCH_IDENTICAL`）；插件常量 `插件/src/host/retitle.ts:15`、`插件/src/client/capability.ts:17-20` |

### 3.2 Client 面

| # | 被消费面（插件用法） | rc.2 行为 | rc.3 行为 | 破坏？ | 证据（rc.3 / rc.2） |
|---|---|---|---|---|---|
| C7 | `dsh.client.inject` 的 6 个模块是否仍存在/仍可注入；rc.3 是否改了 Client 模块解析/注入校验 | `dsh.client.inject` 是“包名依赖边”：用于 factory 到达顺序与 Cordis 组合；仅校验是字符串数组；被注入包必须自身是 web client 行（`dsh.client.platform==='web'` 且有 `exports["./client"]`） | 规则**未变**（`dsh-client-modules` 源树 diff 空；`lib/index.js` 仅内嵌 commit 常量 `a6b1b85`→`6b729fe`）。6 个模块在 rc.3 全部存在且都在默认 web 组合中：`dsh-api-remotes`、`dsh-api-workspace-controller`、`dsh-client-ui-context-menu`、`dsh-client-ui-layout`、`dsh-client-locale`、`dsh-client-ui-renderer`（每个在 `dsh-web-app/cordis.patch.yml` 中恰好被引用 1 次，rc.2/rc.3 patch 逐字节相同） | 否 | rc.3：`R3/dsh-client-modules/src/client/manifest.ts:44-68`（inject 语义）、`173-193`（parseDshClient）、`R3/dsh-client-modules/src/index.ts:58-64,529-539`（graphRow）、`551-560`（orderByModuleGraph）、`R3/dsh-client-modules/src/index.ts:891-918`（读 dsh.client 并解析 `./client`）；6 包 `R3/<pkg>/package.json`（`dsh.client.platform='web'` + `exports["./client"]`）、`R3/dsh-web-app/cordis.patch.yml`；rc.2：`R2/dsh-client-modules/src` diff 空、`R2/dsh-web-app/cordis.patch.yml` 与 rc.3 相同；插件 `插件/package.json:37-48` |
| C8 | `remote.$mount(sessionRetitleRemoteInfo)` 与 `remote.pluginInventory.list()` 返回形状（`entries[].entryId/moduleName/enabled/fiberPhase`、`agentPresets[].rows`） | `$mount(contribution)` 挂载并返回 disposer（官方 api-remotes 自身就是这么挂 30 个 Remote）；`pluginInventory.list` 是 Host `@Remote('list')`，返回 `{entries, agentPresets, …}`，行字段如左 | 完全相同；官方 api-remotes 仍以同一模式 `await ctx.remote.$mount(contribution)` | 否 | rc.3：`R3/dsh-api-gateway/src/client/index.ts:214-219`（`$mount`）、`R3/dsh-api-remotes/src/client/index.ts:188-220`（官方循环挂载与 disposer）、`R3/dsh-host-plugin-inventory/src/index.ts:70-71`（`@Remote('list')`）、`R3/dsh-host-plugin-inventory/src/types.ts:18-25,36-50,60-76`（行/预设字段）；插件 `插件/src/client/index.ts:55-64`、`插件/src/client/capability.ts:37-55`、`插件/src/client/types.ts:18-70`；rc.2：`R2/dsh-api-remotes/src`、`R2/dsh-host-plugin-inventory/src` diff 空 |
| C9 | `workspaces.list.getSnapshot()/subscribe()`，快照 `{phase,state,archivedSessionIds}` | Client Workspace 服务 `list` 是 Observable：`getSnapshot` 返回 `{workspaces, archivedSessionIds, state:'idle'\|'loading'\|'error', phase:…}`，`subscribe` 返回退订 | 完全相同（字段、状态枚举、服务键 `workspaces` 未变） | 否 | rc.3：`R3/dsh-api-workspace-controller/src/client/model.ts:32-39,64-67,343-355`（快照）、`R3/dsh-api-workspace-controller/src/client/service.ts:46-49,117-128`（`list: WorkspaceSource`）；插件 `插件/src/client/archive.ts:20-25,31-37,46-54`、`插件/src/client/types.ts:42-58`；rc.2：`R2/dsh-api-workspace-controller/src` diff 空（`model.ts:343` 同） |
| C10 | `contextMenus.register(contribution)` 字段（`id/target/order/observe/resolve/run/icon.key`）与 `notify(text, success)` | contribution：`id,target,order,observe?(),resolve(target,signal)`；action：`id,label,icon{key,src?},run?,failureLabel?,…`；service：`register`、`notify(text, success?, action?)`、`open/resolve/close` | 完全相同；`target:'session'` 的 target 值仍是 `{sessionId, displayTitle}` | 否 | rc.3：`R3/dsh-client-ui-context-menu/src/client/types.ts:58-84`（icon/action）、`85-102`（MenuContribution）、`117-155`（ContextMenus，notify 在 144-154）、`27-41`（session target）、`R3/dsh-client-ui-context-menu/src/client/index.ts:100`（服务实现）、`R3/dsh-client-ui-context-menu/src/client/registry.ts:11-12`（observe/resolve 签名）；插件 `插件/src/client/menu.ts:32-67`、`插件/src/client/types.ts:76-112`、`插件/src/client/operation.ts:309-312`；rc.2：`R2/dsh-client-ui-context-menu/src` diff 空（`types.ts:150` notify 同） |
| C11 | `locale.register/bind`、`slots.inject/register` 选项（`name,id,key,order,locale,inject`）、内置 slot `shell.overlay`/`contextMenu.icon` | `locale.register(ns, dicts\|locale, dict?)`、`locale.bind(ns)->(key)=>string`；`slots.register(options, component)` 支持 `name/id/key/order/locale/inject/children/store`，`slots.inject(key, cb)` 在声明存在时同步执行；`shell.overlay` 是 layout 注册的 root list slot；`contextMenu.icon` 是 context-menu 注册的 root keyed slot | 完全相同；官方 context-menu 自身就是用 `ctx.slots.inject('shell.overlay', ()=>ctx.slots.register({name:'shell.overlay', id:'context-menu', locale:'contextMenu', inject:…}))` 的同一模式 | 否 | rc.3：`R3/dsh-client-ui-renderer/src/client/registry.ts:119-160`（slots 服务）、`181,741-746`（register）、`209-271`（inject）、`R3/dsh-client-ui-layout/src/client/index.ts:96-107`（`shell.overlay:{kind:'list',scope:'root'}`）、`192-205`（root 声明）；`R3/dsh-client-ui-context-menu/src/client/index.ts:39-43`（`contextMenu.icon` keyed/inline）、`170-176`（官方 shell.overlay 注入模式）；`R3/dsh-client-locale/src/client/index.ts:403-405,459-461`（register/bind）；插件 `插件/src/client/index.ts:41-43,75-92`、`插件/src/client/types.ts:130-143`；rc.2：`R2/dsh-client-ui-context-menu/src` diff 空；`R2/dsh-client-ui-renderer/src` 仅多一个类型声明 shim `use-sync-external-store.d.ts`；`R2/dsh-client-locale/src` 仅多 `css-modules.d.ts`（两者 `lib/client.js` 仅 CSS 类哈希不同） |
| C12 | `@deepseek-ai/dsh-client-ui-primitives` 的 `IconRefreshOutlineRegular` 在 rc.3 页面模块表中是否仍导出 | 该模块不在 npm `node_modules`（无此包），由 Web 页面 baseline 模块表静态提供；插件以 ambient `.d.ts` 声明 + esbuild `external` 使用 | **仍在静态模块表**（`"@deepseek-ai/dsh-client-ui-primitives": DK`），且其导出映射中仍有 `IconRefreshOutlineRegular`（与 `IconRefreshOutlineMedium` 并列） | 否 | rc.3：`R3/dsh-web-frontend/dist/assets/index-Ciz7DZxv.js` 静态表 `function qJ(){return{…,"@deepseek-ai/dsh-client-ui-primitives":DK,…}}`，导出表含 `IconRefreshOutlineRegular:Jw`；rc.2：`R2/dsh-web-frontend/dist/assets/index-ghOpC9uV.js` 静态表键集合与 rc.3 **完全相同**（react/react-dom/cordis/zod/dsh-client-store/dsh-client-ui-slots/dsh-client-ui-primitives/dsh-client-ui-dockkit 等），同样含该导出；插件 `插件/src/client/primitives.d.ts:13-24`、`插件/scripts/build-client.mjs:33-36` |

### 3.3 构建期协议

| # | 被消费面 | rc.2 行为 | rc.3 行为 | 破坏？ | 证据 |
|---|---|---|---|---|---|
| B13 | 用 devDependency `@deepseek-ai/dsh-typert-protocol@0.2.2-rc.1` 生成的 `lib/host` 与 `lib/client.js` 与 rc.3 运行时协议是否兼容（protocol descriptor 结构） | rc.1 的 `createTypertRemoteInfo`/descriptor 结构与 rc.2 运行时相同 | rc.1、rc.2、rc.3 三份 **运行时 JS 逐字节相同**（`lib/index.js` 与 `lib/types/*.js` 共 9 个文件 sha 全部 SAME）；npm rc.3 的 `.d.ts` 与 rc.1 逐字节相同，exports 映射一致（`./remote-info` → `./lib/types/remote-info.js`） | 否 | 实测：rc.1 vs rc.3 全 JS sha 相等；rc.2 vs rc.3 `diff -rq` 无 `.js` 差异；rc.1 vs npm rc.3 `lib/types` `.d.ts` diff 为空；插件 `插件/package.json:60`、`插件/lib/shared/remote.js:13-16`（`zod` + `.../remote-info` 导入）、`插件/lib/host/service.js:35`（`Remote, TypertRemoteService`）；`插件/pnpm-lock.yaml:14-16,98` 锁定 rc.1 |

---

## 四、rc.2 → rc.3 实际差异清单（全量核对结果）

核对范围：上述被消费面涉及的 26 个初选官方包 + 追加核对的 3 个（`dsh-agent`、`dsh-timeout`、`dsh-session-title-llm`），另做 rc.1 protocol 对照。`diff -rq`（npm rc.2 树 vs asar rc.3 树）+ `src/` 源树 + 运行时 JS 三段对比结论：

| 类别 | 包 / 文件 | 差异 | 对插件影响 |
|---|---|---|---|
| 契约无变化（src + 运行时 JS 全相同） | `dsh-typert-protocol`、`dsh-typert-registry`、`dsh-typert-loader`、`dsh-app-boot`、`dsh-plugin-manager`、`dsh-session-title`、`dsh-session-title-llm`、`dsh-session-title-all-prompts-llm`、`dsh-experimental-session-titles-bundle`、`dsh-session`、`dsh-agent`、`dsh-timeout`、`dsh-workspace`、`dsh-api-workspace-controller`、`dsh-api-remotes`、`dsh-api-gateway`、`dsh-host-plugin-inventory`、`dsh-client-ui-context-menu`、`dsh-client-ui-renderer`、`dsh-client-connection`、`dsh-package-manifest`、`dsh`（仅 docs 变化） | 无 | 无 |
| 仅构建产物（CSS 类哈希/内嵌 commit/类型声明 shim） | `dsh-client-locale`、`dsh-client-ui-layout`、`dsh-client-ui-plugin-manager`（`lib/client.js` 仅 CSS module 哈希变化；`src` 仅多 `css-modules.d.ts` 声明 shim）、`dsh-client-modules`（`lib/index.js` 仅内嵌 `commit` 由 `a6b1b85`→`6b729fe`）、`dsh-client-ui-renderer`（`src` 仅多 `use-sync-external-store.d.ts`）、`dsh-web-frontend`（`src` 仅多 `vite-env.d.ts`） | 不改变任何被消费 API | 无 |
| 功能差异但与插件无关 | `dsh-official-bundles`：在 `BUNDLES/ON_DEMAND_BUNDLES` 目录中新增 `@deepseek-ai/dsh-deepseek-chat-import`（`src/bundles.ts:72`、`src/plugin-manager.ts:58,79`） | 仅“官方可选 bundle 目录”多一项 | 无 |
| Web 前端重建 | `dsh-web-frontend/dist/assets/index-*.js` 哈希变化（`index-ghOpC9uV.js`→`index-Ciz7DZxv.js`），因 CSS 哈希/新 bundle 名导致；**静态模块表键集合与 primitives 导出一致**（见 C12） | 无 | 无 |
| 打包形态 | rc.3 asar 剥离所有 `.d.ts`/`.map`（含 `lib/types/*.d.ts`），但 `lib/types/*.js` 运行时保留；npm 上的 rc.3 包仍带类型（已用 npm `dsh-typert-protocol@0.2.2-rc.3` 核实） | 仅影响“从 asar 读类型”的方式，不影响运行 | 无 |

结论：**没有任何一个被消费面在 rc.3 发生签名、字段、枚举、错误码或语义变化。**

---

## 五、必须改动项（按优先级）

### P0（必须，否则 rc.3 无法加载本插件）

1. `package.json:31`：`"dsh": "0.2.2-rc.2"` → `"dsh": ">=0.2.2-rc.2 <0.3.0-0"`。
   - 依据与实测见第二节；该范围同时接受 rc.2 与 rc.3，排除 0.3.0/0.3.0-0。
   - 不要改成 `"0.2.2-rc.3"`（会反过来踢掉 rc.2，且下个 rc 再犯）；不要只写 `">=0.2.2-rc.2"`（放进 0.3.x）。

### P1（建议，同一改动窗口内完成）

2. `package.json:60`：`"@deepseek-ai/dsh-typert-protocol": "0.2.2-rc.1"` → `"0.2.2-rc.3"`，然后 `pnpm install` 更新 `pnpm-lock.yaml`。
   - 安全依据：npm rc.3 的 `.d.ts` 与 rc.1 逐字节相同、运行时 JS 与 rc.1 逐字节相同，`tsc` 产物不变；升级可让“构建期协议 = 运行期协议”，并消除 README 里“npm 仅发布 rc.1”的过期说法（npm 现有 rc.1/rc.2/rc.3）。
   - 若坚持最小改动不动 devDependency，rc.1 也能继续构建（同样兼容 rc.3），但需在文档中说明而非保留“仅 rc.1 可用”的错误描述。
3. `test/package-contract.test.mjs`：新增断言（防回归），建议：
   - `engines.dsh` 必须存在、是字符串、且**不是**精确版本字面量（如 `/^\d+\.\d+\.\d+(-[\w.-]+)?$/` 不应匹配）；
   - 用 `semver`（可新增 devDependency，或复用 DSH 安装的 semver 仅作本地验证）验证 `satisfies('0.2.2-rc.2') && satisfies('0.2.2-rc.3')` 且 `!satisfies('0.3.0')`（`{ includePrerelease: true }`，与 DSH 判定一致）。
   - 现有 `test/package-contract.test.mjs:16-24` 的 5 项 inject 断言可补上第 6 项 `@deepseek-ai/dsh-client-ui-renderer`（当前循环只列了 5 个，虽不失败但覆盖不全）。
4. 文档同步（非阻塞但必须避免误导）：
   - `README.md:52-53`（“engines.dsh 固定 0.2.2-rc.2” / “npm 仅发布 protocol 0.2.2-rc.1”）
   - `docs/DETAIL.md:27`（“构建期 rc.1，运行环境 rc.2”）
   - `HANDOFF.md:90`、`IMPLEMENTATION_PLAN.md:24,157` 的版本记录
   - 变更后建议补一条 rc.3 验收记录（见第七节）。

### 不需要改动

- `src/host/*`、`src/client/*`、`src/shared/*`：无任何 rc.3 破坏性 API 变更。
- `cordis.patch.yml`：bundle patch 的 `insert` 语义与官方 bundle patch 格式未变（官方 session-titles bundle 的 patch 与 rc.2 逐字节相同）。
- `lib/*`：重跑 `npm run build` 后应无差异（协议类型相同）；如有差异仅可能是空白/注释，不应有契约差异。
- `locale/*`、`icon.svg`、`docs/DETAIL.md` 内容结构（除版本描述）。

### 非 rc.3 差异、但建议顺手处理的可移植性隐患

- 插件 `package.json` 没有 `dependencies`，但 Host 运行时 `lib/shared/remote.js:13` / `lib/shared/result.js:1` 直接 `import { z } from 'zod'`（`zod` 目前只是 devDependency）。当前 desktop profile 是 `link:` 安装，Node 从仓库 `node_modules/.pnpm/zod@4.6.6` 解析成功（profile 根亦有 `zod@4.6.7`）；若把 tarball 装进没有 `zod` 的 profile，会解析失败。建议把 `zod` 放进 `dependencies`（或声明 peer 并文档说明）。
- `package.json` 为 `"private": true`，仅适用于 link/本地 tarball 安装；若计划发布 npm，需一并处理 `files`/依赖声明。

---

## 六、验证建议（本次未执行，交由 lead 决定）

1. 改完 `package.json`（+ lock）后执行 `npm run build && npm test`，确认 `lib/` 与 `src/` 无意外 diff。
2. **完整重启 DSH**（bundle 组合只在启动时做一次），确认 stderr **不再出现** `skipping profile bundle "@hanxu131/dsh-session-retitle"`（profile 路径 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 已含该 bundle）。
3. 启动后检查：插件页该 bundle 状态为已启用/active；会话菜单出现“重新生成标题”（非归档、非手动标题场景）；手动标题场景弹出确认 Modal；Toast 反馈正常。
4. 建议把“rc.3 下真实 provider 刷新一次成功 / 手动标题确认一次成功 / 归档会话菜单隐藏”写入 artifacts 验收记录（可复用既有 spike 记录格式）。

---

## 七、无法验证的项目（不猜测，单列）

1. **rc.3 实机端到端运行未验证**：按要求未重启 DSH、未重装/启用插件，因此“改 engines 后插件在 rc.3 真正加载并工作”只由“官方实现逐字节相同 + 官方同款调用模式”推断，未实际执行。菜单、Modal、slot 渲染、Remote 往返、Toast 均未在 rc.3 运行时点击验证。
2. **未取得 rc.3 启动日志中的实际 incompatible 文本**：S3/S4 的跳过行为由 rc.3 源码与 semver 实测证明，但没有抓取本次 rc.3 启动 stderr 原文（未重启）。
3. **Web 页面内置模块的内部语义无法按源码 diff**：`@deepseek-ai/dsh-client-ui-slots`（SlotCore）与 `@deepseek-ai/dsh-client-store` 不是 npm 包，只存在于 `dsh-web-frontend` 的压缩 bundle 中。本次只核对了：静态模块表键集合（rc.2/rc.3 相同）、`IconRefreshOutlineRegular` 导出存在、以及官方 layout/context-menu 仍以相同源码和相同调用模式使用 `shell.overlay`/`contextMenu.icon`/`slots.register`。**SlotCore/primitives 的内部实现语义未做逐行对比**（bundle 已重建、压缩变量名不同）。
4. **未在浏览器实际加载第三方 client bundle**：C12 只确认模块表键与导出行存在，未加载 `lib/client.js` 实测 `require('@deepseek-ai/dsh-client-ui-primitives')` 解析与 `IconRefreshOutlineRegular` 渲染。
5. **其他平台未验证**：仅在 macOS arm64 的 rc.3 安装上核对；`win32/linux` 的 profile 组合路径未验证（但门禁与 API 代码跨平台同源）。
6. **npm 上除 `dsh-typert-protocol`/`dsh-app-boot` 外的 rc.3 包未逐一 npm pack 核对**：运行时以 asar 内实际安装副本为准；asar 与 npm 发布包的差异仅限剥离 `.d.ts`/`.map`（已由 typert-protocol 实测印证）。
7. **失败路径（timeout/abort/superseded）未在 rc.3 实测**：`SESSION_TITLE_TIMEOUT`/`TimeoutReason`/abort reason 的运行时传播链条代码未变（rc.2/rc.3 源相同），但未执行真实超时用例。
8. **tarball 裸装的可移植性未验证**（见第五节的 zod 依赖隐患）；当前 desktop profile 为 `link:` 安装，解析路径与裸装不同。

---

## 附：证据路径速查

| 缩写 | 实际路径 |
|---|---|
| `R3/<pkg>/...` | `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/<pkg>/...`（asar 内，`fs` 直读 / Electron-as-node 读取；含 `src/`） |
| `R2/<pkg>/...` | `@deepseek-ai/<pkg>@0.2.2-rc.2` 经 `npm pack` 解包后的同名路径 |
| rc.1 | `@deepseek-ai/dsh-typert-protocol@0.2.2-rc.1`（npm pack 解包） |
| semver 实测 | `ELECTRON_RUN_AS_NODE=1 ... 'Application Support/…' ` 调用 asar 内 `semver@7.8.6`（DSH 自身依赖） |
| 插件 | `/Volumes/WD-1T/00_Workspace/00_Active/CodeProject/regeneratetitle-dsh` |
