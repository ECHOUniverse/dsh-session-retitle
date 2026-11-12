/**
 * Manual-title confirmation state for the blocking Modal.
 *
 * The operation owns this store; the overlay component only reads the
 * snapshot and reports confirm/cancel. Keeping the state outside React makes
 * the confirmation state machine testable without a DOM and lets the operation
 * decide who may open or update the Modal.
 */
/** One pending manual-title confirmation returned by the Host. */
export interface ManualTitleConfirmation {
  readonly sessionId: string
  readonly title: string
  readonly eventSeq: number
}

/** Immutable Modal state read through the overlay's selector hook. */
export interface SessionRetitleModalState {
  readonly open: boolean
  readonly sessionId: string
  readonly title: string
  readonly eventSeq: number
  readonly busy: boolean
}

/** Closed snapshot shared before any confirmation. */
export const CLOSED_MODAL_STATE: SessionRetitleModalState = Object.freeze({
  open: false,
  sessionId: '',
  title: '',
  eventSeq: 0,
  busy: false,
})

/** Selector hook shape provided by the slot framework for a HostObservable source. */
export interface SnapshotSelectorHook<Snapshot> {
  <Selected>(
    selector: (snapshot: Snapshot) => Selected,
    equal?: (left: Selected, right: Selected) => boolean,
  ): Selected
}

/**
 * uSES-safe observable holding at most one manual-title confirmation.
 *
 * Every mutation replaces the snapshot once, so a stable reference is returned
 * between changes.
 */
export class SessionRetitleModalStore {
  private snapshot: SessionRetitleModalState = CLOSED_MODAL_STATE
  private readonly listeners = new Set<() => void>()

  /** Current immutable snapshot. */
  getSnapshot = (): SessionRetitleModalState => this.snapshot

  /** Subscribe to snapshot changes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Open (or re-target) the Modal for one manual title. */
  open(confirmation: ManualTitleConfirmation): void {
    this.publish({ open: true, ...confirmation, busy: false })
  }

  /** Replace the confirmation while keeping the Modal open. */
  update(confirmation: ManualTitleConfirmation): void {
    if (!this.snapshot.open) {
      this.publish({ open: true, ...confirmation, busy: false })
      return
    }
    this.publish({ ...this.snapshot, ...confirmation })
  }

  /** Mark the confirmation request as in flight (prevents double submit). */
  setBusy(busy: boolean): void {
    if (!this.snapshot.open) return
    this.publish({ ...this.snapshot, busy })
  }

  /** Close the Modal without any further call. */
  close(): void {
    if (!this.snapshot.open) return
    this.publish(CLOSED_MODAL_STATE)
  }

  private publish(snapshot: SessionRetitleModalState): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) listener()
  }
}
