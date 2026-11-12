/**
 * Browser half of @hanxu131/dsh-session-retitle.
 *
 * Registers the session context-menu action, the fail-closed provider
 * preflight, the per-session operation flow and the blocking manual-title
 * Modal, and mounts the shared strict Remote contribution.
 *
 * The mounted contribution's namespace is a traced remote.<namespace> Cordis
 * Service owned by the Remote service side, not by this plugin's fiber. Reading
 * it is therefore governed by the reading fiber's inject list: the static
 * plugin injects only the root services, so the menu, the operation and the
 * overlay entry are created on the child fiber produced by ctx.inject() after
 * $mount() settles. The same holds for remote.pluginInventory (the inventory
 * Remote namespace mounted by the API-remotes assembly) and for workspaces and
 * slots (Client services provided by the official assemblies).
 */
import type { ReactNode } from 'react'

import { LOCALE_NAMESPACE, MENU_ICON_KEY } from '../shared/ids.js'
import { sessionRetitleRemoteInfo } from '../shared/remote.js'
import { RetitleMenuIcon } from './icon.js'
import { dictionaries } from './locale.js'
import { createSessionMenuContribution } from './menu.js'
import { SessionRetitleModal, type SessionRetitleModalProps } from './overlay.js'
import { createRetitleOperation } from './operation.js'
import type { ClientInjectedContext, ClientPluginContext } from './types.js'

/** Cordis Client service dependencies, resolved before apply. */
export const inject = ['remote', 'contextMenus', 'locale', 'workspaces', 'slots']

/** Namespace Service the mounted contribution installs on the Remote service. */
const REMOTE_NAMESPACE_DEP = 'remote.sessionRetitle'
/** Inventory Remote namespace mounted by the API-remotes Client assembly. */
const PLUGIN_INVENTORY_DEP = 'remote.pluginInventory'
/** Workspace-controller Client service exposing the Workspace list snapshot. */
const WORKSPACES_DEP = 'workspaces'
/** Renderer-owned slot registry; the Modal needs the root overlay seat. */
const SLOTS_DEP = 'slots'

/** Root slot hosting the blocking manual-title Modal. */
const OVERLAY_SLOT = 'shell.overlay'
/** Keyed slot the shared menu overlay renders action glyphs from. */
const ICON_SLOT = 'contextMenu.icon'
/** Stable overlay entry id. */
export const MODAL_SLOT_ID = 'session-retitle.manual-title-modal'

/**
 * Mount the shared Remote contribution and create the injected Client fiber
 * that owns the menu, the operation and the overlay Modal.
 * @param ctx - Client plugin Context.
 */
export async function apply(ctx: ClientPluginContext): Promise<void> {
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, dictionaries), 'session-retitle: locale')

  const disposeRemote = await ctx.remote.$mount(sessionRetitleRemoteInfo)
  ctx.effect(() => async () => {
    await disposeRemote()
  }, 'session-retitle: remote mount')

  await ctx.inject(
    [REMOTE_NAMESPACE_DEP, PLUGIN_INVENTORY_DEP, WORKSPACES_DEP, SLOTS_DEP],
    (child: ClientInjectedContext) => installClientSurface(child),
  )
}

/**
 * Install the Modal, the operation and the menu on the injected fiber.
 * @param ctx - child Context that can read the mounted namespace.
 */
function installClientSurface(ctx: ClientInjectedContext): void {
  const operation = createRetitleOperation(ctx)

  // The overlay entry stays mounted for the plugin lifetime and renders
  // nothing until the operation publishes a pending confirmation.
  ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register<SessionRetitleModalProps>({
    name: OVERLAY_SLOT,
    id: MODAL_SLOT_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({
      hooks: { sessionRetitleModal: operation.modal },
      confirm: () => operation.confirm(),
      cancel: () => operation.cancel(),
    }),
  }, SessionRetitleModal as (props: SessionRetitleModalProps) => ReactNode))

  // The row glyph is a keyed `contextMenu.icon` entry: the overlay resolves it
  // by the action's icon key, and the registration follows this fiber, so
  // disabling the plugin withdraws the icon together with the action.
  ctx.slots.inject(ICON_SLOT, () => ctx.slots.register({
    name: ICON_SLOT,
    key: MENU_ICON_KEY,
  }, RetitleMenuIcon))

  // Unloading or disabling the plugin aborts every in-flight request and
  // withdraws the Modal before the menu contribution disappears.
  ctx.effect(() => () => operation.dispose(), 'session-retitle: operation')

  ctx.effect(
    () => ctx.contextMenus.register(createSessionMenuContribution(ctx, operation)),
    'session-retitle: session menu',
  )
}