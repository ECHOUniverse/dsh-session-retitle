/**
 * Structural contracts for the official Client services this plugin consumes.
 *
 * The plugin must not import Harness Client service packages: they are page
 * singletons owned by other plugins, so each such seam is typed as the minimal
 * slice actually read. The page baseline module table is different — its UI
 * primitives (for example @deepseek-ai/dsh-client-ui-primitives) are shared
 * modules served by the page, add no dependency, and are allowed; they are
 * typed by a local ambient declaration instead. Wire types still come from the
 * shared Remote definition; nothing here restates the wire contract.
 */
import type { ReactNode } from 'react'

import type { RetitleResult } from '../shared/result.js'
import type { RemoteResultLike } from '../shared/remote.js'

/** One inventory row this plugin inspects. */
export interface PluginInventoryEntryLike {
  /** Loader entry id; null on an agent-preset composition row. */
  readonly entryId: string | null
  /** Exact module specifier the Loader entry imports. */
  readonly moduleName: string
  /** A row proves availability only when positively enabled. */
  readonly enabled: boolean | 'conditional'
  /** Root fiber phase; 'active' is the only live value. */
  readonly fiberPhase: string | null
}

/** Point-in-time plugin inventory read through the pluginInventory Remote. */
export interface PluginInventorySnapshotLike {
  readonly entries: readonly PluginInventoryEntryLike[]
  readonly agentPresets?: readonly {
    readonly rows: readonly PluginInventoryEntryLike[]
  }[]
}

/** Slice of the mounted remote.pluginInventory namespace Service. */
export interface PluginInventoryRemoteLike {
  list(): Promise<RemoteResultLike<PluginInventorySnapshotLike>>
}

/** Snapshot fields of the official workspaces.list store. */
export interface WorkspaceSnapshotLike {
  readonly phase: string
  readonly state: string
  readonly archivedSessionIds: readonly string[]
}

/** Bare observable source exposed as workspaces.list. */
export interface WorkspaceSourceLike {
  getSnapshot(): WorkspaceSnapshotLike
  subscribe(listener: () => void): () => void
}

/** Slice of the workspaces Client service (workspace-controller). */
export interface ClientWorkspacesLike {
  readonly list: WorkspaceSourceLike
}

/** Method surface of the mounted remote.sessionRetitle namespace Service. */
export interface SessionRetitleRemoteLike {
  execute(...args: unknown[]): Promise<RemoteResultLike<RetitleResult>>
}

/** Client Remote face after the shared contribution is mounted. */
export interface MountedClientRemoteLike {
  readonly sessionRetitle: SessionRetitleRemoteLike
  readonly pluginInventory: PluginInventoryRemoteLike
}

/** Slice of the Client Remote service available before this plugin mounts. */
export interface ClientRemoteLike {
  $mount(contribution: unknown): Promise<() => Promise<void>>
}

/** Captured session menu target; identical to the official session target family. */
export interface SessionMenuTarget {
  readonly sessionId: string
  readonly displayTitle: string
}

/** Keyed glyph metadata captured with one menu action. */
export interface SessionMenuIcon {
  /** Key of the registration in the keyed `contextMenu.icon` Slot. */
  readonly key: string
  /** Optional image URL instead of a slot glyph; unused by this plugin. */
  readonly src?: string
}

/** Data-only menu action accepted by the shared context-menu service. */
export interface SessionMenuAction {
  readonly id: string
  readonly label: string
  /** Official product glyph rendered in the row's 14px icon cell. */
  readonly icon?: SessionMenuIcon
  readonly run?: () => void | Promise<void>
}

/** One registered session-menu contribution. */
export interface SessionMenuContribution {
  readonly id: string
  readonly target: 'session'
  readonly order: number
  observe?(target: SessionMenuTarget): readonly WorkspaceSourceLike[]
  resolve(target: SessionMenuTarget, signal: AbortSignal): readonly SessionMenuAction[]
}

/** Slice of the shared context-menu service this plugin uses. */
export interface ContextMenusLike {
  register(contribution: SessionMenuContribution): () => void
  notify(text: string, success?: boolean): void
}

/** Slice of the Client locale service this plugin uses. */
export interface ClientLocaleLike {
  register(
    namespace: string,
    dicts: Readonly<Record<'en' | 'zh', Readonly<Record<string, string>>>>,
  ): () => void
  bind(namespace: string): (key: string) => string
}

/**
 * Registration options accepted by the renderer's slot service.
 *
 * An ordinary slot entry is identified by `id`; a keyed slot entry (such as
 * `contextMenu.icon`, rendered by a data action's `icon.key`) is identified by
 * `key` instead. Both registration kinds reach the same register call.
 */
export interface SlotRegistrationOptions {
  readonly name: string
  readonly id?: string
  readonly key?: string
  readonly order?: number
  readonly locale?: string
  readonly inject?: () => Record<string, unknown>
}

/** Slice of the renderer's slot service used for the root overlay Modal. */
export interface SlotServiceLike {
  inject(key: string, callback: () => (() => void) | Iterable<() => void>): () => void
  register<P>(options: SlotRegistrationOptions, component: (props: P) => ReactNode): () => void
}

/** A cleanup returned by an effect body; Cordis owns its lifetime. */
export type ClientEffectDisposer = () => void | Promise<void>

/** Services usable from any Client plugin context. */
export interface ClientContextServices {
  readonly contextMenus: ContextMenusLike
  readonly locale: ClientLocaleLike
  readonly workspaces: ClientWorkspacesLike
  readonly slots: SlotServiceLike
  effect(execute: () => ClientEffectDisposer, label?: string): unknown
}

/** Client plugin Context this module requires. */
export interface ClientPluginContext extends ClientContextServices {
  readonly remote: ClientRemoteLike
  inject(
    dependencies: readonly string[],
    apply: (ctx: ClientInjectedContext) => void,
  ): PromiseLike<unknown>
}

/** Child Context created by the dynamic inject with the mounted namespace visible. */
export interface ClientInjectedContext extends ClientContextServices {
  readonly remote: MountedClientRemoteLike
}
