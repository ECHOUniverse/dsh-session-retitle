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
  'menu.retitle': 'Regenerate title',
  'toast.noInput': 'This session has no eligible conversation text; the title was not regenerated.',
  'toast.providerUnavailable': 'The official all-prompts title provider is unavailable. Enable it and try again.',
  'toast.providerCheckFailed': 'Could not confirm the official title provider. Please try again.',
}

async function applyPlugin(harness) {
  const loaded = await loadClientArtifact()
  const plugin = loaded.factory(loaded.require)
  harness.setLocaleDict(COPY)
  harness.setWorkspace({ phase: 'ready', state: 'idle', archivedSessionIds: [] })
  await plugin.apply(harness.ctx)
  await Promise.resolve()
}

const ACTIVE_ROW = {
  entryId: ALL_PROMPTS_ENTRY_ID,
  moduleName: ALL_PROMPTS_MODULE,
  enabled: true,
  fiberPhase: 'active',
}

test('capability: execute runs only after a live provider row was read', async () => {
  const harness = createHarness()
  await applyPlugin(harness)
  let readsAtExecute = -1
  harness.setBehavior((call, state) => {
    readsAtExecute = state.inventoryReads.length
    return Promise.resolve({ ok: true, value: { outcome: 'no-input' } })
  })

  await runMenuAction(harness, 'session-1')

  assert.equal(harness.inventoryReads.length, 1, 'exactly one preflight read per execute')
  assert.equal(readsAtExecute, 1, 'the inventory must be read before the Remote call')
  assert.equal(harness.calls.length, 1)
  const call = harness.calls[0]
  assert.equal(call.sessionId, 'session-1')
  assert.deepEqual(call.request, {})
  assert.ok(call.signal instanceof AbortSignal)
  assert.equal(call.signal.aborted, false)
})

test('capability: every live provider row shape enables the execute call', async () => {
  const cases = [
    {
      name: 'entryId match, other module',
      inventory: { entries: [{ ...ACTIVE_ROW, moduleName: '@example/other' }] },
    },
    {
      name: 'moduleName match, renamed entry',
      inventory: { entries: [{ ...ACTIVE_ROW, entryId: 'renamed-entry' }] },
    },
    {
      name: 'agent preset roster row',
      inventory: { entries: [], agentPresets: [{ id: 'default', rows: [{ ...ACTIVE_ROW, entryId: null }] }] },
    },
  ]
  const loaded = await loadClientArtifact()
  for (const entry of cases) {
    const harness = createHarness()
    const plugin = loaded.factory(loaded.require)
    harness.setLocaleDict(COPY)
    harness.setInventory({ ok: true, value: entry.inventory })
    await plugin.apply(harness.ctx)
    await runMenuAction(harness, 'session-live')
    assert.equal(harness.calls.length, 1, `live provider case failed: ${entry.name}`)
    assert.equal(harness.toasts.length, 1, `the call reached the business result: ${entry.name}`)
    assert.equal(harness.toasts[0].text, COPY['toast.noInput'])
  }
})

test('capability: missing, disabled, pending or conditional rows block the execute call', async () => {
  const cases = [
    { name: 'empty inventory', inventory: { entries: [] } },
    { name: 'disabled entry', inventory: { entries: [{ ...ACTIVE_ROW, enabled: false }] } },
    { name: 'conditional entry', inventory: { entries: [{ ...ACTIVE_ROW, enabled: 'conditional' }] } },
    { name: 'pending fiber', inventory: { entries: [{ ...ACTIVE_ROW, fiberPhase: 'pending' }] } },
    { name: 'no live fiber', inventory: { entries: [{ ...ACTIVE_ROW, fiberPhase: null }] } },
    {
      name: 'conditional preset row',
      inventory: {
        entries: [],
        agentPresets: [{ id: 'default', rows: [{ ...ACTIVE_ROW, entryId: null, enabled: 'conditional' }] }],
      },
    },
  ]
  const loaded = await loadClientArtifact()
  for (const entry of cases) {
    const harness = createHarness()
    const plugin = loaded.factory(loaded.require)
    harness.setLocaleDict(COPY)
    harness.setInventory({ ok: true, value: entry.inventory })
    await plugin.apply(harness.ctx)
    await runMenuAction(harness, 'session-off')
    assert.equal(harness.calls.length, 0, `execute must not run: ${entry.name}`)
    assert.equal(harness.toasts.length, 1, `one localized feedback toast: ${entry.name}`)
    assert.equal(harness.toasts[0].text, COPY['toast.providerUnavailable'])
    assert.notEqual(harness.toasts[0].success, true)
  }
})

test('capability: an unreadable inventory service fails closed without an execute call', async () => {
  const harness = createHarness()
  await applyPlugin(harness)
  harness.hideService('remote.pluginInventory')
  await runMenuAction(harness, 'session-hidden')
  assert.equal(harness.calls.length, 0)
  assert.deepEqual(harness.toasts, [{ text: COPY['toast.providerCheckFailed'], success: false }])
})

test('capability: unreadable or failed inventory fails closed with a retryable message', async () => {
  const cases = [
    { name: 'Remote ok:false', inventory: { ok: false, error: new Error('inventory offline') } },
    { name: 'Remote throws', inventory: () => Promise.reject(new Error('gateway/internal')) },
    { name: 'malformed snapshot', inventory: { ok: true, value: null } },
  ]
  const loaded = await loadClientArtifact()
  for (const entry of cases) {
    const harness = createHarness()
    const plugin = loaded.factory(loaded.require)
    harness.setLocaleDict(COPY)
    harness.setInventory(entry.inventory)
    await plugin.apply(harness.ctx)
    await runMenuAction(harness, 'session-unknown')
    assert.equal(harness.calls.length, 0, `execute must not run: ${entry.name}`)
    assert.equal(harness.toasts.length, 1, `one localized feedback toast: ${entry.name}`)
    assert.equal(harness.toasts[0].text, COPY['toast.providerCheckFailed'])
    assert.notEqual(harness.toasts[0].success, true)
  }
})