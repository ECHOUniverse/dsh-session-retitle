/**
 * Blocking manual-title confirmation rendered into the root shell.overlay
 * seat.
 *
 * The Modal is a self-written React control: the plugin must not import
 * internal Harness primitives, so dialog semantics (role, aria wiring, focus
 * containment, Escape and focus restoration) are implemented here with plain
 * DOM APIs. The state lives in SessionRetitleModalStore; confirm/cancel are
 * injected by the operation so the component has no Remote access of its own.
 * Confirming closes the Modal synchronously and the operation finishes the
 * replacement in the background, so the dialog only ever renders open/closed.
 */
import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import type { LocaleKey } from './locale.js'
import type { SessionRetitleModalState, SnapshotSelectorHook } from './modal.js'

/** Props composed by the slot framework and the registration's injected face. */
export interface SessionRetitleModalProps {
  readonly t: (key: LocaleKey, params?: Readonly<Record<string, string | number>>) => string
  readonly useSessionRetitleModal: SnapshotSelectorHook<SessionRetitleModalState>
  readonly confirm: () => void
  readonly cancel: () => void
}

/** Focusable candidates inside the dialog, in tab order. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45))',
  pointerEvents: 'auto',
}

const dialogStyle: CSSProperties = {
  width: 'min(480px, 100%)',
  maxHeight: 'calc(100vh - 48px)',
  overflow: 'auto',
  boxSizing: 'border-box',
  padding: '20px',
  borderRadius: '12px',
  border: '1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.28))',
  background: 'var(--dsw-alias-bg-base, #ffffff)',
  color: 'inherit',
  boxShadow: '0 18px 48px rgba(0, 0, 0, 0.28)',
  outline: 'none',
}

const titleStyle: CSSProperties = { margin: '0 0 10px', fontSize: '16px', fontWeight: 600 }
const descriptionStyle: CSSProperties = {
  margin: '0 0 10px',
  color: 'var(--dsw-alias-label-secondary, inherit)',
}
const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '18px',
}
const buttonStyle: CSSProperties = {
  font: 'inherit',
  cursor: 'pointer',
  padding: '7px 14px',
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.35))',
  background: 'transparent',
  color: 'inherit',
}
const dangerStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: '#d33b3b',
  background: '#d33b3b',
  color: '#ffffff',
}

/**
 * Root overlay entry: renders nothing while no confirmation is pending.
 * @param props - locale translator, injected state hook and confirm/cancel callbacks.
 * @returns the blocking dialog or null.
 */
export function SessionRetitleModal(props: SessionRetitleModalProps): ReactNode {
  // The framework's selector hook requires a selector argument (it wraps
  // useSyncExternalStoreWithSelector); the identity projection is the snapshot.
  const state = props.useSessionRetitleModal((snapshot) => snapshot)
  if (!state.open) return null
  return <ManualTitleDialog state={state} t={props.t} confirm={props.confirm} cancel={props.cancel} />
}

interface ManualTitleDialogProps {
  readonly state: SessionRetitleModalState
  readonly t: SessionRetitleModalProps['t']
  readonly confirm: () => void
  readonly cancel: () => void
}

/**
 * One open confirmation dialog: focus enters on Cancel, Tab stays inside,
 * Escape cancels, and closing restores the previously focused element.
 */
function ManualTitleDialog({ state, t, confirm, cancel }: ManualTitleDialogProps): ReactNode {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const active = typeof document === 'undefined' ? null : document.activeElement
    restoreRef.current = active instanceof HTMLElement ? active : null
    cancelRef.current?.focus()
    return () => {
      const target = restoreRef.current
      if (target !== null && typeof target.focus === 'function' && target.isConnected) target.focus()
    }
  }, [])

  // A document-level capture listener keeps Escape and Tab working even when
  // focus escaped the dialog (for example after a click on the backdrop) and
  // runs before any page shortcut handler.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancel()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (dialog === null) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement
      const inside = active instanceof HTMLElement && dialog.contains(active)
      if (!inside) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true) }
  }, [cancel])

  return (
    <div style={backdropStyle} data-session-retitle-backdrop>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        style={dialogStyle}
      >
        <h2 id={titleId} style={titleStyle}>{t('modal.title')}</h2>
        <p id={descriptionId} style={descriptionStyle}>
          {t('modal.description', { title: state.title })}
        </p>
        <p style={descriptionStyle}>{t('modal.consequence')}</p>
        <div style={footerStyle}>
          <button ref={cancelRef} type="button" style={buttonStyle} onClick={cancel}>
            {t('modal.cancel')}
          </button>
          <button type="button" style={dangerStyle} onClick={confirm}>
            {t('modal.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}