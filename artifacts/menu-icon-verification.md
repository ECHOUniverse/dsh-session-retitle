# 菜单原生图标验证记录

日期：2026-11-12（Asia/Shanghai）
目标：给会话菜单「重新生成标题」补一个与相邻条目同风格的原生图标。

## 结论

已实现并通过真实页面验证：菜单行现在渲染官方 primitives 的刷新字形
`#dsw-icon-refresh-outline-regular`，与「置顶会话 / 重命名 / 分叉会话 /
复制 Session ID / 在应用中打开 / 归档会话」使用同一套图标精灵、同一 14×14
菜单图标槽与同一 `--dsw-alias-menu-icon` 颜色。

## 官方契约（依据）

- `@deepseek-ai/dsh-client-ui-context-menu` README：action 支持
  `icon?: { key: string; src?: string }`；字形通过 keyed Slot 注册：
  `ctx.slots.inject('contextMenu.icon', () => ctx.slots.register({ name: 'contextMenu.icon', key }, Icon))`。
- 官方 `dsh-client-ui-workspace/src/client/index.ts` 的真实实现即为
  `icon: { key: 'workspace.rename' }` + `IconEditOutlineRegular`。
- `@deepseek-ai/dsh-client-ui-primitives` 是 Web 页面 baseline 模块表里的静态
  seed（shell 的 `staticModules` 直接注入），不是 graph row：第三方 bundle 可以
  `require`，但构建必须 external，且不能写成 npm 依赖或 `dsh.client.inject`。
- primitives 的 Menu 样式固定图标槽 14×14、svg 强制 14px，因此组件不传 size。

## 实现

- `src/shared/ids.ts`：新增 keyed 图标注册键 `MENU_ICON_KEY`。
- `src/client/icon.tsx`（新增）：`RetitleMenuIcon` 返回官方
  `IconRefreshOutlineRegular`。
- `src/client/primitives.d.ts`（新增）：该 baseline 模块的最小 ambient 声明
  （仅 `IconProps` 与所用字形），不新增依赖。
- `src/client/menu.ts`：action 增加 `icon: { key: MENU_ICON_KEY }`。
- `src/client/index.ts`：在注入后的子 fiber 上向 `contextMenu.icon` 注册字形，
  与 action 生命周期一致。
- `src/client/types.ts`：补 `SessionMenuIcon`、keyed slot 的 `key` 选项，并修正
  “不得导入 Harness Client 包”的注释（baseline 模块表模块是明确例外）。
- `scripts/build-client.mjs`：primitives 加入 esbuild external，保持单文件
  `__ModuleLoader__.load` 产物。

## 测试与构建

- `pnpm run typecheck` 通过。
- `pnpm run build` 通过；`lib/client.js` 的 require 仅
  `@deepseek-ai/dsh-client-ui-primitives`、`react`、`react/jsx-runtime`。
- `pnpm test`：75/75 通过（新增菜单图标 wiring 用例；package-contract 改为
  baseline 模块 allowlist）。
- 少量环境差异：本机 desktop runtime 为 DSH 0.2.2-rc.2，构建脚本所用 node/pnpm
  为其自带依赖。

## 真实页面验证

环境：一次性 Web Profile `retitle-spike`（独立端口，使用 DSH 0.2.2-rc.2
runtime CLI，链接当前工作区源码），测试地址 token 已隐去。

操作：在会话列表中右键一个真实会话行，读取共享 Menu 的 DOM：

| 菜单行 | 字形 |
|---|---|
| 置顶会话 | `#dsw-icon-pin-outline-regular` |
| 重命名 | `#dsw-icon-edit-outline-regular` |
| **重新生成标题** | **`#dsw-icon-refresh-outline-regular`** |
| 分叉会话 | `#dsw-icon-branch-outline-regular` |
| 复制 Session ID | `#dsw-icon-copy-outline-regular` |
| 在应用中打开 | `#dsw-icon-right-up-outline-regular` + `#dsw-icon-chevron-right-outline-regular` |
| 归档会话 | `#dsw-icon-archive-outline-regular` |

截图：`artifacts/menu-icon-live-verify.png`（真实页面菜单）。

## 当前 Desktop 进程状态

Desktop 进程在启动时已把插件 bundle 的字节组合进 graph 缓存，本仓库重新构建
`lib/client.js` 不会自动改写运行中页面；需在「插件」页禁用/重启用本插件（触发
graph 重新组合与客户端热替换），或重启 DSH 后生效。会话本身可继续，不会因重启丢失。
