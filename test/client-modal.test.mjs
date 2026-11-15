import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ALL_PROMPTS_ENTRY_ID,
  ALL_PROMPTS_MODULE,
  createHarness,
  loadClientArtifact,
  runMenuAction,
} from './client-harness.mjs'

const COPY = {
  'menu.retitle': 'Regenerate title',
  'toast.refreshed': 'Session title regenerated: {title}',
  'toast.providerUnavailable': 'The official all-prompts title provider is unavailable. Enable it and try again.',
  'toast.providerCheckFailed': 'Could not confirm the official title provider. Please try again.',
  'toast.failed': 'Could not regenerate the title: {reason}',
  'modal.title': 'Replace the manual title?',
  'modal.description': 'This session has the manual title “{title}”. Regenerating replaces it and unpins the manual title.',
  'modal.consequence':
    'The new title comes from the official all-prompts title provider. If generation fails, the title may fall back to an automatic title and cannot be rolled back.',
  'modal.cancel': 'Keep manual title',
  'modal.confirm': 'Replace title',
}

const ACTIVE_INVENTORY = {
  ok: true,
  value: {
    entries: [{
      entryId: ALL_PROMPTS_ENTRY_ID,
      moduleName: ALL_PROMPTS_MODULE,
      enabled: true,
      fiberPhase: 'active',
    }],
  },
}

const MANUAL_TITLE = 'Quarterly planning notes'
const confirmation = () =>
  Promise.resolve({ ok: true, value: { outcome: 'confirmation-required', title: MANUAL_TITLE, eventSeq: 4 } })

/** Install a jsdom document before React DOM loads. */
async function installDom() {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    KeyboardEvent: window.KeyboardEvent,
    Event: window.Event,
    Node: window.Node,
    MouseEvent: window.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
  return dom
}

function translate(copy) {
  return (key, params) => {
    const template = copy[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
  }
}

async function setup() {
  const dom = await installDom()
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = React

  const harness = createHarness()
  const loaded = await loadClientArtifact()
  const plugin = loaded.factory(loaded.require)
  harness.setLocaleDict(COPY)
  harness.setInventory(ACTIVE_INVENTORY)
  harness.setBehavior(confirmation)
  await plugin.apply(harness.ctx)
  await Promise.resolve()

  const registration = harness.slotRegistration
  const face = registration.options.inject()
  const { hooks, ...rest } = face
  const store = hooks.sessionRetitleModal
  const t = translate(COPY)

  function Overlay() {
    const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const useSessionRetitleModal = (selector) => selector(snapshot)
    return React.createElement(registration.component, {
      ...rest,
      useSessionRetitleModal,
      t,
    })
  }

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(Overlay))
  })

  // The opener outside the overlay keeps focus so restoration is observable.
  const opener = document.createElement('button')
  opener.textContent = 'opener'
  document.body.append(opener)
  opener.focus()

  return {
    dom,
    act,
    harness,
    React,
    container,
    opener,
    root,
    dialog: () => document.querySelector('[role="dialog"]'),
    buttonByText(text) {
      return [...document.querySelectorAll('button')].find((button) => button.textContent === text)
    },
    async openModal() {
      await act(async () => {
        await runMenuAction(harness, 'session-manual', MANUAL_TITLE)
      })
    },
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
      opener.remove()
      dom.window.close()
    },
  }
}

test('modal: renders nothing while no confirmation is pending', async () => {
  const env = await setup()
  try {
    assert.equal(env.harness.modalState().open, false)
    assert.equal(env.dialog(), null)
  } finally {
    await env.unmount()
  }
})

test('modal: blocking dialog semantics, localized copy and default focus on cancel', async () => {
  const env = await setup()
  try {
    await env.openModal()
    const dialog = env.dialog()
    assert.ok(dialog !== null, 'the confirmation Modal must render')
    assert.equal(dialog.getAttribute('aria-modal'), 'true')
    assert.equal(dialog.getAttribute('tabindex'), '-1')

    const labelledBy = dialog.getAttribute('aria-labelledby')
    const describedBy = dialog.getAttribute('aria-describedby')
    assert.ok(labelledBy !== null && describedBy !== null)
    assert.equal(document.getElementById(labelledBy).textContent, COPY['modal.title'])
    const description = document.getElementById(describedBy).textContent
    assert.match(description, new RegExp(MANUAL_TITLE))
    assert.match(dialog.textContent, /Replace the manual title\?/)

    const cancel = env.buttonByText(COPY['modal.cancel'])
    const confirm = env.buttonByText(COPY['modal.confirm'])
    assert.ok(cancel !== undefined, 'cancel control exists')
    assert.ok(confirm !== undefined, 'confirm control exists')
    assert.equal(document.activeElement, cancel, 'focus starts on the safe action')
  } finally {
    await env.unmount()
  }
})

test('modal: Tab is contained inside the dialog and wraps at both ends', async () => {
  const env = await setup()
  try {
    await env.openModal()
    const dialog = env.dialog()
    const cancel = env.buttonByText(COPY['modal.cancel'])
    const confirm = env.buttonByText(COPY['modal.confirm'])

    confirm.focus()
    dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    assert.equal(document.activeElement, cancel, 'forward Tab from the last control wraps to the first')

    cancel.focus()
    dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    assert.equal(document.activeElement, confirm, 'backward Tab from the first control wraps to the last')
  } finally {
    await env.unmount()
  }
})

test('modal: Escape cancels, closes without a second call and restores focus', async () => {
  const env = await setup()
  try {
    await env.openModal()
    assert.equal(env.harness.calls.length, 1)
    const dialog = env.dialog()
    await env.act(async () => {
      dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })

    assert.equal(env.harness.modalState().open, false)
    assert.equal(env.dialog(), null)
    assert.equal(env.harness.calls.length, 1, 'Escape must not call the Remote again')
    assert.equal(document.activeElement, env.opener, 'focus returns to the element that opened the Modal')
  } finally {
    await env.unmount()
  }
})

test('modal: confirm closes the dialog immediately and reports the background result', async () => {
  let releaseSecond
  const secondCall = new Promise((resolve) => { releaseSecond = resolve })
  const env = await setup()
  try {
    const harness = env.harness
    let calls = 0
    harness.setBehavior((call) => {
      calls += 1
      if (call.request.confirmation !== undefined) return secondCall
      return confirmation()
    })
    await env.openModal()

    const confirm = env.buttonByText(COPY['modal.confirm'])
    await env.act(async () => { confirm.click() })
    assert.equal(harness.calls.length, 2)
    // The dialog is gone before the confirmed call settles: the title is
    // regenerated in the background and only the final Toast reports it.
    assert.equal(env.dialog(), null, 'the dialog disappears immediately')
    assert.equal(harness.modalState().open, false)
    assert.equal(env.buttonByText(COPY['modal.confirm']), undefined, 'no confirmation control is left to click')
    assert.deepEqual(harness.toasts, [], 'no interim toast while generation is in flight')

    // A repeated confirmation request while the background call is in flight
    // is a no-op: the pending confirmation was already consumed.
    await env.act(async () => { harness.modalFace().confirm() })
    assert.equal(harness.calls.length, 2, 'repeated confirmation must not issue another call')

    await env.act(async () => {
      releaseSecond({ ok: true, value: { outcome: 'refreshed', title: 'Regenerated', eventSeq: 9, changed: true, source: { kind: 'provider', provider: 'session-title-all-prompts-llm' } } })
      await secondCall
    })
    assert.equal(harness.modalState().open, false)
    assert.equal(calls, 2)
    assert.deepEqual(harness.toasts, [{ text: 'Session title regenerated: Regenerated', success: true }])
  } finally {
    await env.unmount()
  }
})