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
  'toast.noInput': 'This session has no eligible conversation text; the title was not regenerated.',
  'toast.providerUnavailable': 'The official all-prompts title provider is unavailable. Enable it and try again.',
  'toast.providerUnavailableRecovered': 'The official all-prompts title provider is unavailable. Your manual title “{title}” was restored and kept.',
  'toast.providerUnavailableFallback': 'The official all-prompts title provider is unavailable and the manual title could not be restored: {reason}. The title is still the automatic fallback “{title}”.',
  'toast.providerCheckFailed': 'Could not confirm the official title provider. Please try again.',
  'toast.archived': 'This session is archived, so its title was not regenerated.',
  'toast.failed': 'Could not regenerate the title: {reason}',
  'failure.inputTooLarge': 'the conversation text is too long for the title provider',
  'failure.noRoute': 'no model route is available',
  'failure.invalidOutput': 'the provider returned an invalid title',
  'failure.truncatedOutput': 'the title model output was cut off at the output length limit; raise maxOutputTokens (for example 512) in the official title provider configuration and retry',
  'failure.timeout': 'the request timed out',
  'failure.cancelled': 'the request was cancelled',
  'failure.superseded': 'a newer request replaced this one',
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

async function setup(behavior, { inventory = ACTIVE_INVENTORY, workspace } = {}) {
  const harness = createHarness()
  const loaded = await loadClientArtifact()
  const plugin = loaded.factory(loaded.require)
  harness.setLocaleDict(COPY)
  harness.setInventory(inventory)
  if (workspace !== undefined) harness.setWorkspace(workspace)
  if (behavior !== undefined) harness.setBehavior(behavior)
  await plugin.apply(harness.ctx)
  await Promise.resolve()
  return harness
}

const ok = (value) => Promise.resolve({ ok: true, value })
const business = (value) => () => ok(value)
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('operation: refreshed, no-input, archived and provider-unavailable use localized feedback', async () => {
  const cases = [
    {
      name: 'refreshed',
      result: {
        outcome: 'refreshed',
        title: 'New title',
        eventSeq: 9,
        changed: true,
        source: { kind: 'provider', provider: 'session-title-all-prompts-llm' },
      },
      text: 'Session title regenerated: New title',
      success: true,
    },
    {
      name: 'no-input',
      result: { outcome: 'no-input' },
      text: COPY['toast.noInput'],
      success: false,
    },
    {
      name: 'archived',
      result: { outcome: 'archived' },
      text: COPY['toast.archived'],
      success: false,
    },
    {
      name: 'provider-unavailable after a successful manual-title recovery',
      result: {
        outcome: 'provider-unavailable',
        recovered: true,
        actualTitle: 'Manual title',
        actualSourceKind: 'user',
      },
      text: COPY['toast.providerUnavailableRecovered'].replace('{title}', 'Manual title'),
      success: false,
    },
    {
      name: 'provider-unavailable after a failed manual-title recovery',
      result: {
        outcome: 'provider-unavailable',
        recovered: false,
        actualTitle: 'Fallback title',
        actualSourceKind: 'fallback',
        recoveryError: 'rename unavailable',
      },
      text: COPY['toast.providerUnavailableFallback']
        .replace('{reason}', 'rename unavailable')
        .replace('{title}', 'Fallback title'),
      success: false,
    },
    {
      name: 'provider-unavailable without a recovery attempt',
      result: {
        outcome: 'provider-unavailable',
        recovered: false,
        actualTitle: 'Other provider title',
        actualSourceKind: 'provider',
      },
      text: COPY['toast.providerUnavailable'],
      success: false,
    },
  ]

  for (const entry of cases) {
    const harness = await setup(business(entry.result))
    await runMenuAction(harness, 'session-result')
    assert.equal(harness.toasts.length, 1, `one toast: ${entry.name}`)
    assert.equal(harness.toasts[0].text, entry.text, `localized text: ${entry.name}`)
    assert.equal(harness.toasts[0].success, entry.success, `success flag: ${entry.name}`)
  }
})

test('operation: failed results map stable codes to localized reasons', async () => {
  const cases = [
    { code: 'input-too-large', reason: COPY['failure.inputTooLarge'] },
    { code: 'no-route', reason: COPY['failure.noRoute'] },
    { code: 'invalid-output', reason: COPY['failure.invalidOutput'] },
    { code: 'truncated-output', reason: COPY['failure.truncatedOutput'] },
    { code: 'timeout', reason: COPY['failure.timeout'] },
    { code: 'unknown', reason: COPY['failure.unknown'] },
  ]
  for (const entry of cases) {
    const harness = await setup(business({ outcome: 'failed', code: entry.code }))
    await runMenuAction(harness, 'session-failed')
    assert.equal(harness.toasts.length, 1, `one toast: ${entry.code}`)
    assert.equal(
      harness.toasts[0].text,
      `Could not regenerate the title: ${entry.reason}`,
      `localized reason: ${entry.code}`,
    )
    assert.notEqual(harness.toasts[0].success, true)
  }
})

test('operation: superseded and cancelled business results stay silent', async () => {
  for (const code of ['superseded', 'cancelled']) {
    const harness = await setup(business({ outcome: 'failed', code }))
    await runMenuAction(harness, 'session-quiet')
    assert.equal(harness.toasts.length, 0, `no toast for ${code}`)
  }
})

test('operation: outer Remote failure and a thrown call become localized failure feedback', async () => {
  {
    const harness = await setup(() => Promise.resolve({ ok: false, error: new Error('gateway/internal') }))
    await runMenuAction(harness, 'session-outer')
    assert.equal(harness.toasts.length, 1)
    assert.equal(harness.toasts[0].text, 'Could not regenerate the title: gateway/internal')
    assert.notEqual(harness.toasts[0].success, true)
  }
  {
    const harness = await setup(() => Promise.reject(new Error('carrier lost')))
    await runMenuAction(harness, 'session-throw')
    assert.equal(harness.toasts.length, 1)
    assert.equal(harness.toasts[0].text, 'Could not regenerate the title: carrier lost')
    assert.notEqual(harness.toasts[0].success, true)
  }
})

test('operation: a newer click on the same session aborts the old call and silences its result', async () => {
  const harness = await setup()
  const pending = []
  harness.setBehavior((call) => new Promise((resolve) => {
    pending.push({ call, resolve })
  }))

  const first = runMenuAction(harness, 'session-concurrent')
  await settle()

  const second = runMenuAction(harness, 'session-concurrent')
  await settle()

  assert.equal(harness.calls.length, 2)
  assert.equal(harness.calls[0].signal.aborted, true, 'the superseded call is aborted')
  assert.equal(harness.calls[1].signal.aborted, false)

  // The old request settles as a success after being superseded: it must not
  // toast. Only the live request's outcome may be shown.
  pending[0].resolve({ ok: true, value: { outcome: 'refreshed', title: 'Old', eventSeq: 1, changed: true, source: { kind: 'provider', provider: 'session-title-all-prompts-llm' } } })
  await first
  assert.equal(harness.toasts.length, 0, 'the superseded result is silent')

  pending[1].resolve({ ok: true, value: { outcome: 'no-input' } })
  await second
  assert.equal(harness.toasts.length, 1, 'the latest request reports')
  assert.equal(harness.toasts[0].text, COPY['toast.noInput'])
})

test('operation: a superseded call that rejects with AbortError stays silent', async () => {
  const harness = await setup()
  const pending = []
  harness.setBehavior((call) => new Promise((resolve, reject) => {
    pending.push({ call, resolve, reject })
  }))

  const first = runMenuAction(harness, 'session-abort')
  await settle()
  const second = runMenuAction(harness, 'session-abort')
  await settle()

  pending[0].reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
  await first
  assert.equal(harness.toasts.length, 0)

  pending[1].resolve({ ok: true, value: { outcome: 'archived' } })
  await second
  assert.equal(harness.toasts.length, 1)
  assert.equal(harness.toasts[0].text, COPY['toast.archived'])
})
test('operation: a stale cross-session business result never reports feedback', async () => {
  const cases = [
    {
      name: 'refreshed',
      result: {
        outcome: 'refreshed',
        title: 'Stale title',
        eventSeq: 1,
        changed: true,
        source: { kind: 'provider', provider: 'session-title-all-prompts-llm' },
      },
    },
    { name: 'no-input', result: { outcome: 'no-input' } },
    { name: 'archived', result: { outcome: 'archived' } },
    {
      name: 'provider-unavailable',
      result: {
        outcome: 'provider-unavailable',
        recovered: false,
        actualTitle: 'Fallback title',
        actualSourceKind: 'fallback',
        recoveryError: 'rename failed',
      },
    },
    { name: 'failed', result: { outcome: 'failed', code: 'timeout' } },
  ]

  for (const entry of cases) {
    const harness = await setup()
    const pending = []
    harness.setBehavior(() => new Promise((resolve) => pending.push({ resolve })))
    const firstA = runMenuAction(harness, 'session-stale-a')
    await settle()
    assert.equal(pending.length, 1, `deferred first call: ${entry.name}`)

    // A second session starts while A is still in flight: A's token is no
    // longer the globally newest one.
    harness.setBehavior(business({ outcome: 'no-input' }))
    const secondB = runMenuAction(harness, 'session-stale-b')
    await settle()
    await secondB
    assert.equal(harness.toasts.length, 1, `B reports first: ${entry.name}`)

    pending[0].resolve({ ok: true, value: entry.result })
    await firstA
    assert.equal(harness.toasts.length, 1, `stale cross-session result stays silent: ${entry.name}`)
    assert.equal(harness.toasts[0].text, COPY['toast.noInput'], `only the newest feedback: ${entry.name}`)
  }
})

test('operation: a stale cross-session transport failure stays silent', async () => {
  const cases = [
    {
      name: 'outer failure',
      settle: (pending) => pending.resolve({ ok: false, error: new Error('gateway/internal') }),
    },
    {
      name: 'thrown call',
      settle: (pending) => pending.reject(new Error('carrier lost')),
    },
  ]

  for (const entry of cases) {
    const harness = await setup()
    const pending = []
    harness.setBehavior(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
    const firstA = runMenuAction(harness, 'session-stale-transport-a')
    await settle()
    assert.equal(pending.length, 1)

    harness.setBehavior(business({ outcome: 'archived' }))
    const secondB = runMenuAction(harness, 'session-stale-transport-b')
    await settle()
    await secondB
    assert.equal(harness.toasts.length, 1)

    entry.settle(pending[0])
    await firstA
    assert.equal(harness.toasts.length, 1, `stale cross-session failure stays silent: ${entry.name}`)
    assert.equal(harness.toasts[0].text, COPY['toast.archived'])
  }
})

test('operation: a stale cross-session preflight failure stays silent', async () => {
  const harness = await setup()
  let releaseInventory
  harness.setInventory(() => new Promise((resolve) => { releaseInventory = resolve }))
  const firstA = runMenuAction(harness, 'session-preflight-a')
  await settle()
  assert.notEqual(releaseInventory, undefined, 'the first preflight read is pending')

  harness.setInventory(ACTIVE_INVENTORY)
  harness.setBehavior(business({ outcome: 'no-input' }))
  const secondB = runMenuAction(harness, 'session-preflight-b')
  await settle()
  await secondB
  assert.equal(harness.toasts.length, 1)

  releaseInventory({ ok: true, value: { entries: [] } })
  await firstA
  assert.equal(harness.toasts.length, 1, 'a stale preflight failure must not toast')
})

test('operation: a confirmed result is silent once a newer cross-session request exists', async () => {
  const deferred = []
  const harness = await setup()
  harness.setBehavior((call) => {
    if (call.request.confirmation !== undefined) {
      return new Promise((resolve) => deferred.push({ resolve }))
    }
    return Promise.resolve({
      ok: true,
      value: { outcome: 'confirmation-required', title: 'Manual title', eventSeq: 3 },
    })
  })

  await runMenuAction(harness, 'session-confirm-stale')
  assert.equal(harness.modalState().open, true)
  harness.modalFace().confirm()
  await settle()
  assert.equal(deferred.length, 1)

  // A different session starts while the confirmed call is still in flight.
  harness.setBehavior(business({ outcome: 'no-input' }))
  await runMenuAction(harness, 'session-confirm-newer')
  assert.equal(harness.toasts.length, 1)

  deferred[0].resolve({
    ok: true,
    value: {
      outcome: 'refreshed',
      title: 'Confirmed title',
      eventSeq: 6,
      changed: true,
      source: { kind: 'provider', provider: 'session-title-all-prompts-llm' },
    },
  })
  await settle()
  assert.equal(harness.toasts.length, 1, 'the confirmed result is no longer the newest feedback')
  assert.equal(harness.toasts[0].text, COPY['toast.noInput'])
})
