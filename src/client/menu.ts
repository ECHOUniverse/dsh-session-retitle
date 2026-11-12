/**
 * Session-menu contribution: pure presentation over the archive snapshot.
 *
 * Opening the menu reads the synchronous Workspace snapshot only, so the
 * context-menu service's preparation budget is never spent on a network query.
 * The capability preflight happens after the user selects the action, inside
 * the operation.
 */
import { LOCALE_NAMESPACE, MENU_ACTION_ID, MENU_CONTRIBUTION_ID, MENU_ORDER } from '../shared/ids.js'
import { archiveSources, readMenuVisibility } from './archive.js'
import { bindTranslator } from './i18n.js'
import type { RetitleOperation } from './operation.js'
import type {
  ClientInjectedContext,
  SessionMenuAction,
  SessionMenuContribution,
  SessionMenuTarget,
} from './types.js'

/**
 * Build the menu contribution bound to the injected child context.
 * @param ctx - injected child Context that can read workspaces.
 * @param operation - operation invoked when the user selects the action.
 * @returns the session-target contribution.
 */
export function createSessionMenuContribution(
  ctx: ClientInjectedContext,
  operation: RetitleOperation,
): SessionMenuContribution {
  return {
    id: MENU_CONTRIBUTION_ID,
    target: 'session',
    order: MENU_ORDER,
    // The archive set is published by the Workspace follow stream; re-resolve
    // when it changes instead of caching visibility at menu-open time.
    observe: () => {
      try {
        return archiveSources(ctx.workspaces)
      } catch {
        return []
      }
    },
    resolve: (target: SessionMenuTarget): readonly SessionMenuAction[] => {
      let visible = false
      try {
        visible = readMenuVisibility(ctx.workspaces, target.sessionId) === 'visible'
      } catch {
        // The service is not readable from this fiber right now: fail closed
        // instead of offering an action whose archive state is unknown.
        visible = false
      }
      if (!visible) return []
      // Bind on every resolve so a live language switch is reflected without
      // re-registering the contribution.
      const t = bindTranslator(ctx.locale.bind(LOCALE_NAMESPACE))
      return [{
        id: MENU_ACTION_ID,
        label: t('menu.retitle'),
        run: () => operation.run(target.sessionId),
      }]
    },
  }
}
