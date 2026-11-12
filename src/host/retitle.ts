/**
 * Host Retitle deep module.
 *
 * One public function owns the whole explicit-retitle policy for a live Agent:
 * archive defense, manual-title confirmation, the official title refresh, the
 * all-prompts result check, manual-title compensation, and failure
 * classification. It depends only on the official services passed in by the
 * Host service, so the policy is testable at this seam without a real Session
 * or title provider. It never registers commands or Agent tools and never
 * duplicates provider, LLM, or prompt logic.
 */
import type { RetitleFailureCode, RetitleRequest, RetitleResult, SessionTitleSourceKind } from '../shared/result.js'

/** Provider identity that alone qualifies as an official generated title. */
export const ALL_PROMPTS_PROVIDER = 'session-title-all-prompts-llm'

/** Minimal live Session identity this policy needs. */
export interface RetitleSession {
  readonly id: string
}

/** Live Agent handed to the Host by the official agent lookup. */
export interface RetitleAgent {
  readonly session: RetitleSession
}

/** Durable ownership of the current title, mirroring the official source union. */
export type RetitleSource =
  | { readonly kind: 'fallback' }
  | {
      readonly kind: 'provider'
      readonly provider: string
      readonly model?: { readonly provider: string; readonly model: string }
    }
  | { readonly kind: 'user' }

/** Immutable latest-title snapshot exposed by the official title service. */
export interface RetitleSnapshot {
  readonly title: string
  readonly source: RetitleSource
  readonly eventSeq: number
}

/** Official title service seam (structural subset of `ctx.sessionTitle`). */
export interface SessionTitlePort {
  get(session: RetitleSession): RetitleSnapshot | undefined
  refresh(session: RetitleSession, signal?: AbortSignal): Promise<RetitleSnapshot | undefined>
  rename(session: RetitleSession, title: string): RetitleSnapshot
}

/** Official workspace registry seam (structural subset of `ctx.workspaceRegistry`). */
export interface WorkspaceRegistryPort {
  readonly archivedSessionIds: readonly string[]
}

/** Official services injected into the public policy function. */
export interface RetitleDeps {
  readonly sessionTitle: SessionTitlePort
  readonly workspaceRegistry: WorkspaceRegistryPort
}

/** Read the confirmation token from the strict request, when one is present. */
function confirmedUserTitleEventSeq(request: RetitleRequest): number | undefined {
  return (request as { readonly confirmation?: { readonly expectedUserTitleEventSeq: number } })
    .confirmation?.expectedUserTitleEventSeq
}

/**
 * Regenerate one Session title through the official title service.
 * @param deps - official title and workspace services.
 * @param agent - live Agent resolved by the official lookup.
 * @param request - strict request; carries an optional manual-title confirmation.
 * @param signal - caller cancellation forwarded to the official refresh.
 * @returns the structured outcome; never throws a raw title-service failure.
 */
export async function retitle(
  deps: RetitleDeps,
  agent: RetitleAgent,
  request: RetitleRequest,
  signal: AbortSignal,
): Promise<RetitleResult> {
  let archived: readonly string[]
  try {
    archived = deps.workspaceRegistry.archivedSessionIds
  } catch {
    // Without the archive set the policy cannot prove this session is not
    // archived, and refreshing an archived session is the one side effect the
    // Host must never risk: fail closed.
    return { outcome: 'failed', code: 'unknown' }
  }
  if (archived.some((id) => String(id) === String(agent.session.id))) {
    return { outcome: 'archived' }
  }

  let before: RetitleSnapshot | undefined
  try {
    before = deps.sessionTitle.get(agent.session)
  } catch {
    return { outcome: 'failed', code: 'unknown' }
  }
  if (before?.source.kind === 'user') {
    const confirmedEventSeq = confirmedUserTitleEventSeq(request)
    if (confirmedEventSeq !== before.eventSeq) {
      return { outcome: 'confirmation-required', title: before.title, eventSeq: before.eventSeq }
    }
  }

  let after: RetitleSnapshot | undefined
  try {
    after = await deps.sessionTitle.refresh(agent.session, signal)
  } catch (error) {
    // The official refresh rejects with provider, route, deadline,
    // cancellation, or supersession failures. Never leak that raw rejection:
    // map it to a stable code and report the title state the log actually holds.
    const actual = readSnapshot(deps, agent.session)
    if (before?.source.kind === 'user' && actual?.source.kind === 'fallback') {
      // The provider may have committed the deterministic fallback before the
      // rejection surfaced. The confirmation the user accepted is still the
      // authority, so restore it immediately through the public rename.
      return restoreUserTitle(deps, agent.session, before.title, actual)
    }
    return { outcome: 'failed', code: failureCode(error, signal), ...actualStateOf(actual) }
  }
  if (after === undefined || after.title.trim().length === 0) return { outcome: 'no-input' }

  if (before?.source.kind === 'user'
    && after.source.kind === 'user'
    && before.eventSeq === after.eventSeq) {
    // The official empty-session path cannot generate a new title and returns
    // the standing user snapshot unchanged. That is no eligible input, not a
    // provider failure: report no-input without touching the standing title.
    return { outcome: 'no-input' }
  }

  if (after.source.kind === 'provider' && after.source.provider === ALL_PROMPTS_PROVIDER) {
    return {
      outcome: 'refreshed',
      title: after.title,
      eventSeq: after.eventSeq,
      changed: before?.title !== after.title,
      source: { kind: 'provider', provider: ALL_PROMPTS_PROVIDER },
    }
  }
  if (before?.source.kind === 'user' && after.source.kind === 'fallback') {
    return restoreUserTitle(deps, agent.session, before.title, after)
  }
  return {
    outcome: 'provider-unavailable',
    actualTitle: after.title,
    actualSourceKind: after.source.kind,
    recovered: false,
  }
}

/** Best-effort current title snapshot after a side effect; never throws. */
function readSnapshot(deps: RetitleDeps, session: RetitleSession): RetitleSnapshot | undefined {
  try {
    return deps.sessionTitle.get(session)
  } catch {
    return undefined
  }
}

/** Project one snapshot into the optional actual-state wire fields. */
function actualStateOf(
  snapshot: RetitleSnapshot | undefined,
): { actualTitle?: string; actualSourceKind?: SessionTitleSourceKind } {
  if (snapshot === undefined) return {}
  return { actualTitle: snapshot.title, actualSourceKind: snapshot.source.kind }
}

/**
 * Restore a confirmed manual title the official refresh overwrote with its
 * deterministic fallback. The public rename is the only sanctioned write.
 * @param deps - official services.
 * @param session - live session being retitled.
 * @param userTitle - exact confirmed manual title to put back.
 * @param fallback - actual fallback snapshot observed before the rename.
 * @returns provider-unavailable with the recovered state, or with the fallback
 * state plus the compensation error when rename itself fails.
 */
function restoreUserTitle(
  deps: RetitleDeps,
  session: RetitleSession,
  userTitle: string,
  fallback: RetitleSnapshot,
): RetitleResult {
  try {
    const restored = deps.sessionTitle.rename(session, userTitle)
    return {
      outcome: 'provider-unavailable',
      actualTitle: restored.title,
      actualSourceKind: restored.source.kind,
      recovered: true,
    }
  } catch (error) {
    // Compensation has its own failure category: report it beside the actual
    // fallback state rather than hiding either fact.
    return {
      outcome: 'provider-unavailable',
      actualTitle: fallback.title,
      actualSourceKind: fallback.source.kind,
      recovered: false,
      recoveryError: errorMessage(error),
    }
  }
}

/**
 * Message fragments of an output-length truncation. The official provider was
 * configured with a small maxOutputTokens and a reasoning model ran out of
 * budget before writing any title text, so this is actionable configuration
 * feedback, not an invalid model answer.
 */
const TRUNCATED_OUTPUT_MESSAGES = [
  'maxOutputTokens',
  'reached maxOutputTokens',
] as const

/** Message fragments the official provider/execution modules use for one failure family. */
const INVALID_OUTPUT_MESSAGES = [
  'title output must contain text only',
  'title model produced no text',
  'returned an invalid result',
  'title must be a string',
  'returned an empty title',
  'must identify at least one source message seq',
  'messageSeqs must be unique',
] as const

/**
 * Map one refresh rejection to the stable public failure code.
 * @param error - raw rejection or thrown abort reason.
 * @param signal - caller signal; an aborted caller always wins as cancellation.
 */
function failureCode(error: unknown, signal: AbortSignal): RetitleFailureCode {
  if (signal.aborted) return 'cancelled'
  const record = error as { readonly name?: unknown; readonly code?: unknown; readonly message?: unknown } | null
  const message = typeof record?.message === 'string' ? record.message : String(error)
  if (record?.code === 'SESSION_TITLE_TIMEOUT'
    || record?.name === 'TimeoutReason'
    || record?.name === 'TimeoutError'
    || message.includes('SESSION_TITLE_TIMEOUT')) {
    return 'timeout'
  }
  if (message.includes('maxInputBytes') || /input is \d+ bytes/.test(message)) return 'input-too-large'
  if (message.includes('no logged request route is available')) return 'no-route'
  // Truncation wins over the invalid-output family: the model never got to
  // answer, so the user needs the maxOutputTokens hint instead of "invalid title".
  if (TRUNCATED_OUTPUT_MESSAGES.some((fragment) => message.includes(fragment))) return 'truncated-output'
  if (INVALID_OUTPUT_MESSAGES.some((fragment) => message.includes(fragment))) return 'invalid-output'
  if (/supersed/i.test(message)) return 'superseded'
  // A non-caller abort is the official service superseding older work.
  if (record?.name === 'AbortError') return 'superseded'
  return 'unknown'
}

/** Stable one-line description of an unknown thrown value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
