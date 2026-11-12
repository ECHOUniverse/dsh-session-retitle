import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ALL_PROMPTS_ENTRY_ID,
  ALL_PROMPTS_MODULE,
  createHarness,
  loadClientArtifact,
  resolveMenu,
} from './client-harness.mjs'

const COPY = {
  'menu.retitle': 'Regenerate title',
  'toast.refreshed': 'Session title regenerated: {title}',
  'toast.providerUnavailable': 'The official all-prompts title provider is unavailable. Enable it and try again.',
  'toast.providerCheckFailed': 'Could not confirm the official title provider. Please try again.',
  'toast.failed': 'Could not regenerate the title: {reason}',
  'failure.unknown': 'an unknown error occurred',
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const ok = (value) => Promise.resolve({ ok: true, value })
const confirmation = (title = 'My manual title', eventSeq = 3) =>
  ok({ outcome: 'confirmation-required', title, eventSeq })
const refreshed = (title) =>
  ok({ outcome: 'refreshed', title, eventSeq: 10, changed: true, source: { kind: 'provider', provider: 'session-title-all-prompts-llm' } })

async function setup(behavior) {
  const harness = createHarness()
  const loaded = await loadClientArtifact()
  const plugin = loaded.factory(loaded.require)
  harness.setLocaleDict(COPY)
  harness.setInventory(ACTIVE_INVENTORY)
  harness.setBehavior(behavior)
  await plugin.apply(harness.ctx)
  await Promise.resolve()
  return harness
}

async function start(harness, sessionId = 'session-manual', displayTitle = 'Manual title') {
  const { actions } = await resolveMenu(harness, sessionId, displayTitle)
  assert.equal(actions.length, 1)
  const promise = actions[0].run()
  await settle()
  return promise
}

test('confirmation: a manual title opens the Modal instead of toasting', async () => {
  const harness = await setup(() => confirmation())
  await start(harness)

  assert.equal(harness.calls.length, 1)
  assert.equal(harness.toasts.length, 0, 'no misleading success/failure toast')
  const state = harness.modalState()
  assert.deepEqual(state, {
    open: true,
    sessionId: 'session-manual',
    title: 'My manual title',
    eventSeq: 3,
    busy: false,
  })
})

test('confirmation: cancel closes the Modal without a second execute call', async () => {
  const harness = await setup(() => confirmation())
  await start(harness)
  assert.equal(harness.calls.length, 1)

  harness.modalFace().cancel()
  assert.equal(harness.modalState().open, false)
  assert.equal(harness.calls.length, 1, 'cancel must not call the Remote again')
  assert.equal(harness.inventoryReads.length, 1, 'cancel must not re-check the provider')
  assert.equal(harness.toasts.length, 0)
})

test('confirmation: confirm re-checks the provider and sends the expected event seq', async () => {
  let calls = 0
  const harness = await setup((call) => {
    calls += 1
    if (call.request.confirmation !== undefined) return refreshed('Confirmed new title')
    return confirmation('My manual title', 7)
  })
  await start(harness)
  assert.equal(harness.calls.length, 1)

  harness.modalFace().confirm()
  await settle()

  assert.equal(harness.inventoryReads.length, 2, 'provider preflight runs again after confirmation')
  assert.equal(harness.calls.length, 2)
  assert.deepEqual(harness.calls[1].request, { confirmation: { expectedUserTitleEventSeq: 7 } })
  assert.ok(harness.calls[1].signal instanceof AbortSignal)
  assert.equal(harness.calls[1].signal.aborted, false)
  assert.equal(harness.modalState().open, false, 'the Modal closes on the terminal outcome')
  assert.deepEqual(harness.toasts, [{ text: 'Session title regenerated: Confirmed new title', success: true }])
})

test('confirmation: a changed manual title updates the open Modal instead of closing it', async () => {
  let calls = 0
  const harness = await setup((call) => {
    calls += 1
    if (call.request.confirmation !== undefined) return confirmation('Renamed while pending', 12)
    return confirmation('First manual title', 3)
  })
  await start(harness)
  harness.modalFace().confirm()
  await settle()

  assert.equal(harness.calls.length, 2)
  assert.deepEqual(harness.modalState(), {
    open: true,
    sessionId: 'session-manual',
    title: 'Renamed while pending',
    eventSeq: 12,
    busy: false,
  })
  assert.equal(harness.toasts.length, 0)
  assert.equal(calls, 2)
})

test('confirmation: the provider is re-checked before the confirmed call and fails closed', async () => {
  const harness = await setup(() => confirmation())
  await start(harness)
  assert.equal(harness.calls.length, 1)

  // The provider disappears between the first response and the confirmation.
  harness.setInventory({ ok: true, value: { entries: [] } })
  harness.modalFace().confirm()
  await settle()

  assert.equal(harness.inventoryReads.length, 2)
  assert.equal(harness.calls.length, 1, 'no confirmed Remote call without a live provider')
  assert.equal(harness.modalState().open, false)
  assert.deepEqual(harness.toasts, [{ text: COPY['toast.providerUnavailable'], success: false }])
})

test('confirmation: double submit sends exactly one confirmed call', async () => {
  let release
  const secondCall = new Promise((resolve) => { release = resolve })
  const harness = await setup((call) => {
    if (call.request.confirmation !== undefined) return secondCall
    return confirmation()
  })
  await start(harness)

  harness.modalFace().confirm()
  await settle()
  assert.equal(harness.modalState().busy, true, 'the Modal is marked busy while the call is in flight')

  harness.modalFace().confirm()
  harness.modalFace().confirm()
  await settle()
  assert.equal(harness.calls.length, 2, 'repeated confirmation must not issue more calls')

  release(refreshed('Done').then((value) => value))
  await settle()
  assert.equal(harness.calls.length, 2)
  assert.equal(harness.modalState().open, false)
})

test('confirmation: a newer click on the same session closes the pending Modal', async () => {
  const harness = await setup(() => confirmation('First', 1))
  await start(harness)
  assert.equal(harness.modalState().open, true)
  assert.equal(harness.calls.length, 1)

  const second = start(harness)
  await settle()
  assert.equal(harness.calls[0].signal.aborted, true)
  // The second confirmation re-targets the single Modal.
  assert.equal(harness.modalState().open, true)
  await second

  harness.modalFace().cancel()
  assert.equal(harness.modalState().open, false)
})

test('confirmation: an older confirmation cannot replace a newer Modal', async () => {
  const deferred = []
  const harness = await setup((call) => new Promise((resolve) => {
    deferred.push({ call, resolve })
  }))

  // Session A's first call is left pending.
  const firstA = start(harness, 'session-a')
  await settle()
  // Session B's confirmation resolves first and owns the Modal.
  const firstB = start(harness, 'session-b')
  await settle()
  assert.equal(deferred.length, 2)

  deferred[1].resolve({ ok: true, value: { outcome: 'confirmation-required', title: 'B title', eventSeq: 5 } })
  await firstB
  assert.equal(harness.modalState().title, 'B title')

  // A's older response must not steal the Modal from the newer operation.
  deferred[0].resolve({ ok: true, value: { outcome: 'confirmation-required', title: 'A title', eventSeq: 4 } })
  await firstA
  assert.equal(harness.modalState().title, 'B title')
  assert.equal(harness.modalState().sessionId, 'session-b')
})
test('confirmation: unloading the plugin aborts the in-flight call and withdraws the Modal', async () => {
  const deferred = []
  const harness = await setup((call) => new Promise((resolve) => {
    deferred.push({ call, resolve })
  }))
  // Leave the first execute pending, then load the Modal through a second
  // sequence: a pending Modal plus a pending execute both belong to the plugin.
  const pendingRun = start(harness, 'session-unload')
  await settle()
  assert.equal(deferred.length, 1)

  const operationEffect = harness.state.effects.find(
    (effect) => effect.label === 'session-retitle: operation',
  )
  assert.ok(operationEffect !== undefined, 'the operation owns a fiber effect')
  operationEffect.disposer()

  assert.equal(deferred[0].call.signal.aborted, true)
  assert.equal(harness.modalState().open, false)

  deferred[0].resolve({ ok: true, value: { outcome: 'confirmation-required', title: 'Late', eventSeq: 2 } })
  await pendingRun
  assert.equal(harness.modalState().open, false, 'a late result cannot reopen the Modal')
  assert.equal(harness.toasts.length, 0)
})
test('confirmation: an older request cannot open the Modal after a newer operation started', async () => {
  const deferred = []
  const harness = await setup((call) => new Promise((resolve) => {
    deferred.push({ call, resolve })
  }))

  const firstA = start(harness, 'session-a')
  await settle()
  const firstB = start(harness, 'session-b')
  await settle()
  assert.equal(deferred.length, 2)

  // Session B finishes successfully without a confirmation.
  deferred[1].resolve({ ok: true, value: { outcome: 'no-input' } })
  await firstB
  assert.equal(harness.modalState().open, false)

  // Session A's older confirmation arrives last and must not open the Modal:
  // only the newest operation may present the blocking confirmation.
  deferred[0].resolve({ ok: true, value: { outcome: 'confirmation-required', title: 'A title', eventSeq: 4 } })
  await firstA
  assert.equal(harness.modalState().open, false)
  assert.equal(harness.toasts.length, 1, 'only session B reports')
})
