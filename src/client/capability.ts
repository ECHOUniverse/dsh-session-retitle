/**
 * Fail-closed preflight for the official all-prompts title provider.
 *
 * The official title service exposes no provider query API, so the Client
 * reads the plugin inventory before every execute call (including the call
 * after a manual-title confirmation). A missing, disabled, not-yet-active or
 * unreadable provider row blocks the Remote call instead of risking a silently
 * degraded fallback title.
 */
import type {
  PluginInventoryEntryLike,
  PluginInventoryRemoteLike,
  PluginInventorySnapshotLike,
} from './types.js'
import { describeError } from './i18n.js'

/** Loader entry id of the optional official all-prompts title provider. */
export const ALL_PROMPTS_ENTRY_ID = 'optional-session-title-all-prompts'
/** Module specifier of the official all-prompts title provider. */
export const ALL_PROMPTS_MODULE = '@deepseek-ai/dsh-session-title-all-prompts-llm'

/** Outcome of one point-in-time provider preflight. */
export type ProviderPreflight =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unavailable' }
  | { readonly ok: false; readonly reason: 'check-failed'; readonly detail?: string }

/**
 * Whether one inventory row is the live all-prompts provider.
 *
 * A row counts only when it matches by entry id or module specifier, is
 * positively enabled (the conditional value is not proof) and its root fiber
 * is active.
 * @param row - inventory row to test.
 * @returns true for a live provider row.
 */
export function isActiveAllPromptsRow(row: PluginInventoryEntryLike): boolean {
  return (row.entryId === ALL_PROMPTS_ENTRY_ID || row.moduleName === ALL_PROMPTS_MODULE)
    && row.enabled === true
    && row.fiberPhase === 'active'
}

/**
 * Whether the snapshot contains a live provider, in the Loader tree or in an
 * agent-preset composition roster.
 * @param snapshot - point-in-time inventory.
 * @returns true when at least one live all-prompts row exists.
 */
export function hasActiveAllPrompts(snapshot: PluginInventorySnapshotLike): boolean {
  if (!Array.isArray(snapshot.entries)) return false
  if (snapshot.entries.some(isActiveAllPromptsRow)) return true
  const groups = snapshot.agentPresets
  if (!Array.isArray(groups)) return false
  return groups.some((group) => Array.isArray(group.rows) && group.rows.some(isActiveAllPromptsRow))
}

/**
 * Read the inventory once and decide whether the provider may be used.
 *
 * Any carrier failure, thrown error or unrecognisable snapshot fails closed
 * as check-failed; a readable inventory without a live row fails closed as
 * unavailable. Neither calls the Retitle Remote.
 * @param remote - mounted pluginInventory namespace.
 * @returns the preflight decision.
 */
export async function checkProviderPreflight(
  remote: PluginInventoryRemoteLike,
): Promise<ProviderPreflight> {
  let result: Awaited<ReturnType<PluginInventoryRemoteLike['list']>>
  try {
    result = await remote.list()
  } catch (error) {
    return { ok: false, reason: 'check-failed', detail: describeError(error) }
  }
  if (result === null || typeof result !== 'object') {
    return { ok: false, reason: 'check-failed', detail: 'invalid inventory result' }
  }
  if (!result.ok) {
    return { ok: false, reason: 'check-failed', detail: describeError(result.error) }
  }
  try {
    return hasActiveAllPrompts(result.value) ? { ok: true } : { ok: false, reason: 'unavailable' }
  } catch (error) {
    return { ok: false, reason: 'check-failed', detail: describeError(error) }
  }
}
