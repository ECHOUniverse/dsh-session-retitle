/**
 * Archive filter and reactive source of the session menu entry.
 *
 * The menu must never wait on the network to decide visibility, so this module
 * reads the synchronous Workspace snapshot only. A snapshot that is not
 * ready and idle, or a session the Host reports as archived, hides the action;
 * the Host still re-checks archive state before any title work.
 */
import type { ClientWorkspacesLike, WorkspaceSnapshotLike, WorkspaceSourceLike } from './types.js'

/** Why the session menu action is withheld. */
export type MenuVisibility = 'visible' | 'archived' | 'not-ready' | 'error'

/**
 * Decide visibility from one Workspace snapshot.
 * @param snapshot - synchronous Workspace list snapshot.
 * @param sessionId - Session whose menu is being resolved.
 * @returns the visibility decision.
 */
export function menuVisibility(snapshot: WorkspaceSnapshotLike, sessionId: string): MenuVisibility {
  if (snapshot.phase !== 'ready') return 'not-ready'
  if (snapshot.state !== 'idle') return 'not-ready'
  if (snapshot.archivedSessionIds.includes(sessionId)) return 'archived'
  return 'visible'
}

/**
 * Read one session's menu visibility.
 * A snapshot read failure fails closed: no action is offered.
 */
export function readMenuVisibility(workspaces: ClientWorkspacesLike, sessionId: string): MenuVisibility {
  try {
    return menuVisibility(workspaces.list.getSnapshot(), sessionId)
  } catch {
    return 'error'
  }
}

/**
 * Observable archive source for the menu's observe hook, or an empty list when
 * the service cannot be read: an unavailable source must not keep an action
 * visible.
 * @param workspaces - Client Workspace service.
 * @returns one observable source when readable.
 */
export function archiveSources(workspaces: ClientWorkspacesLike): readonly WorkspaceSourceLike[] {
  try {
    const source = workspaces.list
    if (typeof source?.getSnapshot !== 'function' || typeof source?.subscribe !== 'function') return []
    return [source]
  } catch {
    return []
  }
}
