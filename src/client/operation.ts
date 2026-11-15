/**
 * Client operation flow for one session title regeneration.
 *
 * Owns the per-session latest-request token and AbortController, the
 * fail-closed provider preflight, the Remote invocation and the manual-title
 * confirmation handshake. Confirming closes the Modal synchronously; the
 * confirmed call keeps running in the background and reports its terminal
 * outcome through a Toast. The operation is created on the injected child
 * fiber, so every Remote access happens in a context that declared it.
 */
import { checkProviderPreflight, type ProviderPreflight } from './capability.js'
import { bindTranslator, describeError, type NamespaceTranslator } from './i18n.js'
import { LOCALE_NAMESPACE } from '../shared/ids.js'
import { invokeSessionRetitle, type RemoteResultLike } from '../shared/remote.js'
import type { RetitleResult } from '../shared/result.js'
import { FAILURE_REASON_KEYS, type LocaleKey } from './locale.js'
import { SessionRetitleModalStore } from './modal.js'
import type { ClientInjectedContext } from './types.js'

/** One live request per session; a newer click aborts the previous one. */
interface ActiveRequest {
  readonly token: number
  readonly controller: AbortController
}

/** A fail-closed preflight decision: carries the reason work is withheld. */
type PreflightFailure = Extract<ProviderPreflight, { readonly ok: false }>

/** Confirmation currently shown in the Modal. */
interface PendingConfirmation {
  readonly token: number
  readonly sessionId: string
  readonly eventSeq: number
}

/** Operation created once the mounted Remote namespace is visible. */
export class RetitleOperation {
  /** Modal state read by the root overlay entry. */
  readonly modal = new SessionRetitleModalStore()

  private sequence = 0
  private readonly current = new Map<string, ActiveRequest>()
  private pending: PendingConfirmation | null = null
  /**
   * Most recently started operation across sessions. Only it may open the Modal
   * or show result feedback: a newer request in another session supersedes an
   * older request's Toast just like a same-session click does.
   */
  private latestToken = 0
  /** Highest token allowed to own the single Modal; older results stay silent. */
  private lastModalToken = 0

  constructor(protected readonly ctx: ClientInjectedContext) {}

  /** Start one regeneration request for a session. */
  async run(sessionId: string): Promise<void> {
    const token = ++this.sequence
    this.latestToken = token
    this.current.get(sessionId)?.controller.abort()

    // A new request for this session supersedes a pending manual-title
    // confirmation: the Modal belongs to the latest request, never to a stale
    // one, and the stale request cannot issue its confirmed call.
    if (this.pending !== null && this.pending.sessionId === sessionId) {
      this.pending = null
      this.modal.close()
    }

    const controller = new AbortController()
    this.current.set(sessionId, { token, controller })

    const preflight = await this.preflight()
    if (!this.mayReport(token, sessionId)) return
    if (!preflight.ok) {
      this.notifyPreflightFailure(preflight)
      return
    }

    try {
      const result = await invokeSessionRetitle(this.ctx.remote, {
        agentId: sessionId,
        request: {},
        signal: controller.signal,
      })
      this.handleRemoteResult(token, sessionId, result)
    } catch (error) {
      if (!this.mayReport(token, sessionId)) return
      this.notifyFailed(error)
    }
  }

  /**
   * Confirm the pending manual-title replacement.
   *
   * The Modal closes synchronously so the user never waits for generation; the
   * confirmed call continues in the background. Consuming the pending
   * confirmation here is the double-submit guard: a second confirm() has
   * nothing left to confirm and cannot issue another call.
   */
  confirm(): void {
    const pending = this.pending
    if (pending === null || !this.modal.getSnapshot().open) return
    const active = this.current.get(pending.sessionId)
    if (active === undefined || active.token !== pending.token || active.controller.signal.aborted) {
      this.pending = null
      this.modal.close()
      return
    }
    this.pending = null
    this.modal.close()
    void this.runConfirmation(pending, active.controller)
  }

  /**
   * Abort every in-flight request and withdraw the Modal when the plugin fiber
   * unloads or is disabled.
   */
  dispose(): void {
    for (const active of this.current.values()) active.controller.abort()
    this.current.clear()
    this.pending = null
    this.modal.close()
  }

  /** Dismiss the pending confirmation without a second call. */
  cancel(): void {
    this.pending = null
    this.modal.close()
  }

  /**
   * Read the inventory and decide whether the provider may be used.
   *
   * The service lookup itself is wrapped: a withdrawn namespace must fail
   * closed exactly like a failed inventory read instead of escaping as an
   * unhandled rejection.
   */
  private async preflight(): Promise<ProviderPreflight> {
    try {
      return await checkProviderPreflight(this.ctx.remote.pluginInventory)
    } catch (error) {
      return { ok: false, reason: 'check-failed', detail: error instanceof Error ? error.message : String(error) }
    }
  }

  private isCurrent(token: number, sessionId: string): boolean {
    const active = this.current.get(sessionId)
    return active !== undefined && active.token === token && !active.controller.signal.aborted
  }

  /**
   * Whether this token may still speak to the user.
   *
   * Result feedback (success, failure, no input, provider unavailable, archive
   * defense) requires both conditions: the request must still be the live one
   * for its session, and it must be the globally newest operation. A newer
   * request in another session supersedes older feedback exactly like a
   * same-session click, so a cross-session stale Toast can never mislead the
   * user about the title they just acted on.
   * @param token - operation token captured by the request.
   * @param sessionId - session the request belongs to.
   */
  private mayReport(token: number, sessionId: string): boolean {
    return this.isCurrent(token, sessionId) && token === this.latestToken
  }

  private handleRemoteResult(
    token: number,
    sessionId: string,
    result: RemoteResultLike<RetitleResult>,
  ): void {
    if (!this.mayReport(token, sessionId)) return
    if (!result.ok) {
      // The carrier/gateway failure has no business result; report it as failed
      // without mistaking it for a provider outcome.
      this.notifyFailed(result.error)
      return
    }
    this.handleOutcome(token, sessionId, result.value)
  }

  private handleOutcome(token: number, sessionId: string, result: RetitleResult): void {
    // Feedback belongs to the globally newest operation only; older results
    // (including a confirmed call racing a newer request in another session)
    // stay silent.
    if (!this.mayReport(token, sessionId)) return
    switch (result.outcome) {
      case 'refreshed':
        this.notify('toast.refreshed', true, { title: result.title })
        return
      case 'no-input':
        this.notify('toast.noInput', false)
        return
      case 'archived':
        this.notify('toast.archived', false)
        return
      case 'provider-unavailable': {
        // The Host reports the actual title state after its compensation.
        // A successful compensation means the manual title is back; a failed
        // one means the log still holds the automatic fallback and the user
        // needs the concrete recovery error.
        if (result.recovered) {
          this.notify('toast.providerUnavailableRecovered', false, { title: result.actualTitle ?? '' })
          return
        }
        if (result.recoveryError !== undefined) {
          this.notify('toast.providerUnavailableFallback', false, {
            title: result.actualTitle ?? '',
            reason: result.recoveryError,
          })
          return
        }
        this.notify('toast.providerUnavailable', false)
        return
      }
      case 'failed': {
        if (result.code === 'superseded' || result.code === 'cancelled') return
        const reasonKey = FAILURE_REASON_KEYS[result.code]
        this.notify('toast.failed', false, { reason: this.t()(reasonKey) })
        return
      }
      case 'confirmation-required': {
        // Only the newest request may own the single Modal; an older response
        // racing a newer one must not replace what the user is looking at.
        if (token !== this.latestToken || token < this.lastModalToken) return
        this.lastModalToken = token
        this.pending = { token, sessionId, eventSeq: result.eventSeq }
        this.modal.open({ sessionId, title: result.title, eventSeq: result.eventSeq })
        return
      }
    }
  }

  /**
   * Send the confirmed call with the expected manual-title revision, after a
   * fresh fail-closed provider preflight.
   *
   * The Modal is already closed, so this only cares whether the owning request
   * is still live: after an unload or a newer same-session click its late
   * result stays silent. Feedback still follows the global latest-token rule
   * through mayReport().
   * @param pending - confirmation the user accepted.
   * @param controller - controller of the owning request.
   */
  private async runConfirmation(pending: PendingConfirmation, controller: AbortController): Promise<void> {
    const preflight = await this.preflight()
    if (!this.isCurrent(pending.token, pending.sessionId)) return
    if (!preflight.ok) {
      if (this.mayReport(pending.token, pending.sessionId)) this.notifyPreflightFailure(preflight)
      return
    }

    try {
      const result = await invokeSessionRetitle(this.ctx.remote, {
        agentId: pending.sessionId,
        request: { confirmation: { expectedUserTitleEventSeq: pending.eventSeq } },
        signal: controller.signal,
      })
      if (!this.isCurrent(pending.token, pending.sessionId)) return
      if (!result.ok) {
        if (this.mayReport(pending.token, pending.sessionId)) this.notifyFailed(result.error)
        return
      }
      if (result.value.outcome === 'confirmation-required') {
        // The manual title changed while the confirmed call was in flight.
        // Never reopen the Modal or overwrite the newer title: tell the user
        // that this attempt was not applied and to retry.
        if (this.mayReport(pending.token, pending.sessionId)) {
          this.notify('toast.manualTitleChanged', false)
        }
        return
      }
      this.handleOutcome(pending.token, pending.sessionId, result.value)
    } catch (error) {
      if (!this.isCurrent(pending.token, pending.sessionId)) return
      if (this.mayReport(pending.token, pending.sessionId)) this.notifyFailed(error)
    }
  }

  private notifyFailed(error: unknown): void {
    this.notify('toast.failed', false, { reason: describeError(error) })
  }

  /** Report why the fail-closed provider preflight withheld the title work. */
  private notifyPreflightFailure(preflight: PreflightFailure): void {
    this.notify(
      preflight.reason === 'unavailable' ? 'toast.providerUnavailable' : 'toast.providerCheckFailed',
      false,
    )
  }

  /** Current localized translator for this plugin namespace. */
  protected t(): NamespaceTranslator {
    return bindTranslator(this.ctx.locale.bind(LOCALE_NAMESPACE))
  }

  /** Show localized feedback outside the menu lifetime. */
  protected notify(key: LocaleKey, success: boolean, params?: Readonly<Record<string, string | number>>): void {
    this.ctx.contextMenus.notify(this.t()(key, params), success)
  }
}

/**
 * Create the operation bound to the injected child context.
 * @param ctx - child Context that can read the mounted namespace and inventory.
 * @returns the operation.
 */
export function createRetitleOperation(ctx: ClientInjectedContext): RetitleOperation {
  return new RetitleOperation(ctx)
}