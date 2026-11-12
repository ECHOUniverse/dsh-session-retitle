import assert from 'node:assert/strict'
import { test } from 'node:test'

const SESSION = Object.freeze({ id: 'session-1' })
const AGENT = Object.freeze({ session: SESSION })

/** Build one snapshot in the official session-title shape. */
function snapshot(title, source, eventSeq) {
  return { title, source, eventSeq, messageSeqs: [], updatedAt: 0 }
}

/**
 * Harness around the public Host Retitle seam: the injected official services
 * are structural fakes so the test observes only public behavior, never
 * private helpers.
 */
function createHarness(options = {}) {
  const calls = { get: 0, refresh: 0, rename: [], refreshArgs: [], archiveReads: 0 }
  let current = options.before
  const deps = {
    workspaceRegistry: {
      get archivedSessionIds() {
        calls.archiveReads += 1
        if (options.archiveThrows !== undefined) throw options.archiveThrows
        return options.archivedSessionIds ?? []
      },
    },
    sessionTitle: {
      get() {
        calls.get += 1
        if (options.getThrows !== undefined) throw options.getThrows
        if (options.getThrowsOnCall === calls.get) throw new Error('title service unavailable')
        return current
      },
      async refresh(session, signal) {
        calls.refresh += 1
        calls.refreshArgs.push({ session, signal })
        if (options.refreshThrows !== undefined) {
          current = options.after ?? current
          throw options.refreshThrows
        }
        current = options.after
        return current
      },
      rename(session, title) {
        calls.rename.push({ session, title })
        if (options.renameThrows !== undefined) throw options.renameThrows
        current = snapshot(title, { kind: 'user' }, (options.before?.eventSeq ?? 0) + 1)
        return current
      },
    },
  }
  return { deps, calls, agent: AGENT, session: SESSION }
}

const providerSource = { kind: 'provider', provider: 'session-title-all-prompts-llm' }

test('retitle: archived session returns archived without reading or refreshing the title', async () => {
  const { deps, calls, agent } = createHarness({ archivedSessionIds: ['session-1'] })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'archived' })
  assert.equal(calls.get, 0)
  assert.equal(calls.refresh, 0)
  assert.equal(calls.rename.length, 0)
})
test('retitle: unowned title refreshes through the official service and reports a qualifying provider result', async () => {
  const before = snapshot('Old title', { kind: 'provider', provider: 'session-title-first-prompt-llm' }, 4)
  const after = snapshot('All prompts title', providerSource, 9)
  const { deps, calls, agent, session } = createHarness({ before, after })
  const signal = new AbortController().signal
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, signal)
  assert.deepEqual(result, {
    outcome: 'refreshed',
    title: 'All prompts title',
    eventSeq: 9,
    changed: true,
    source: { kind: 'provider', provider: 'session-title-all-prompts-llm' },
  })
  assert.equal(calls.refresh, 1)
  assert.equal(calls.refreshArgs[0].session, session)
  assert.equal(calls.refreshArgs[0].signal, signal)
  assert.equal(calls.rename.length, 0)
})

test('retitle: identical generated title is still refreshed but reported unchanged', async () => {
  const before = snapshot('Same title', providerSource, 3)
  const after = snapshot('Same title', providerSource, 8)
  const { deps, calls, agent } = createHarness({ before, after })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.equal(result.outcome, 'refreshed')
  assert.equal(result.changed, false)
  assert.equal(calls.refresh, 1)
})
test('retitle: refresh without any derivable title is no-input, never a success', async () => {
  const { deps, calls, agent } = createHarness({ before: undefined, after: undefined })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'no-input' })
  assert.equal(calls.refresh, 1)
  assert.equal(calls.rename.length, 0)
})

test('retitle: an empty accepted title is no-input rather than a success', async () => {
  const { deps, calls, agent } = createHarness({
    before: undefined,
    after: snapshot('   ', providerSource, 8),
  })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'no-input' })
  assert.equal(calls.refresh, 1)
})

test('retitle: a user title blocks refresh behind confirmation-required', async () => {
  const before = snapshot('My own title', { kind: 'user' }, 12)
  const { deps, calls, agent } = createHarness({ before })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'confirmation-required', title: 'My own title', eventSeq: 12 })
  assert.equal(calls.refresh, 0)
  assert.equal(calls.rename.length, 0)
})

test('retitle: a stale confirmation token re-requests confirmation with the current user title', async () => {
  const before = snapshot('Renamed again', { kind: 'user' }, 15)
  const { deps, calls, agent } = createHarness({ before })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, { confirmation: { expectedUserTitleEventSeq: 12 } }, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'confirmation-required', title: 'Renamed again', eventSeq: 15 })
  assert.equal(calls.refresh, 0)
})

test('retitle: a matching confirmation explains and performs the official refresh', async () => {
  const before = snapshot('My own title', { kind: 'user' }, 12)
  const after = snapshot('Generated title', providerSource, 16)
  const { deps, calls, agent } = createHarness({ before, after })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, { confirmation: { expectedUserTitleEventSeq: 12 } }, new AbortController().signal)
  assert.deepEqual(result, {
    outcome: 'refreshed',
    title: 'Generated title',
    eventSeq: 16,
    changed: true,
    source: { kind: 'provider', provider: 'session-title-all-prompts-llm' },
  })
  assert.equal(calls.refresh, 1)
  assert.equal(calls.rename.length, 0)
})
test('retitle: fallback after a confirmed user title is reported unavailable and the user title is restored', async () => {
  const before = snapshot('My own title', { kind: 'user' }, 12)
  const after = snapshot('Fallback title', { kind: 'fallback' }, 18)
  const { deps, calls, agent, session } = createHarness({ before, after })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, { confirmation: { expectedUserTitleEventSeq: 12 } }, new AbortController().signal)
  assert.deepEqual(result, {
    outcome: 'provider-unavailable',
    actualTitle: 'My own title',
    actualSourceKind: 'user',
    recovered: true,
  })
  assert.equal(calls.refresh, 1)
  assert.deepEqual(calls.rename, [{ session, title: 'My own title' }])
})

test('retitle: a failed user-title compensation is reported separately without masking the fallback title', async () => {
  const before = snapshot('My own title', { kind: 'user' }, 12)
  const after = snapshot('Fallback title', { kind: 'fallback' }, 18)
  const renameError = new Error('session is no longer live')
  const { deps, calls, agent } = createHarness({ before, after, renameThrows: renameError })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, { confirmation: { expectedUserTitleEventSeq: 12 } }, new AbortController().signal)
  assert.equal(result.outcome, 'provider-unavailable')
  assert.equal(result.recovered, false)
  assert.equal(result.actualTitle, 'Fallback title')
  assert.equal(result.actualSourceKind, 'fallback')
  assert.match(result.recoveryError, /session is no longer live/)
  assert.equal(calls.rename.length, 1)
})

test('retitle: a rejected refresh that left the fallback restores the confirmed user title', async () => {
  const before = snapshot('My own title', { kind: 'user' }, 12)
  const after = snapshot('Fallback title', { kind: 'fallback' }, 18)
  const timeoutError = new Error('SESSION_TITLE_TIMEOUT after 60000ms')
  timeoutError.name = 'TimeoutReason'
  timeoutError.code = 'SESSION_TITLE_TIMEOUT'
  const { deps, calls, agent, session } = createHarness({ before, after, refreshThrows: timeoutError })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, { confirmation: { expectedUserTitleEventSeq: 12 } }, new AbortController().signal)
  // The official refresh can leave the deterministic fallback behind even when
  // it later rejects; the confirmed user title must be restored through rename.
  assert.deepEqual(result, {
    outcome: 'provider-unavailable',
    actualTitle: 'My own title',
    actualSourceKind: 'user',
    recovered: true,
  })
  assert.equal(calls.refresh, 1)
  assert.deepEqual(calls.rename, [{ session, title: 'My own title' }])
})

test('retitle: a failed compensation after a rejected refresh exposes the fallback and the recovery error', async () => {
  const before = snapshot('My own title', { kind: 'user' }, 12)
  const after = snapshot('Fallback title', { kind: 'fallback' }, 18)
  const renameError = new Error('session is no longer live')
  const { deps, calls, agent } = createHarness({
    before,
    after,
    refreshThrows: new Error('session-title-llm: no logged request route is available'),
    renameThrows: renameError,
  })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, { confirmation: { expectedUserTitleEventSeq: 12 } }, new AbortController().signal)
  assert.equal(result.outcome, 'provider-unavailable')
  assert.equal(result.recovered, false)
  assert.equal(result.actualTitle, 'Fallback title')
  assert.equal(result.actualSourceKind, 'fallback')
  assert.match(result.recoveryError, /session is no longer live/)
  assert.equal(calls.rename.length, 1)
})

test('retitle: a rejected refresh that did not overwrite the user title keeps the failure code', async () => {
  const before = snapshot('My own title', { kind: 'user' }, 12)
  const timeoutError = new Error('SESSION_TITLE_TIMEOUT after 60000ms')
  const { deps, calls, agent } = createHarness({ before, refreshThrows: timeoutError })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, { confirmation: { expectedUserTitleEventSeq: 12 } }, new AbortController().signal)
  assert.deepEqual(result, {
    outcome: 'failed',
    code: 'timeout',
    actualTitle: 'My own title',
    actualSourceKind: 'user',
  })
  assert.equal(calls.rename.length, 0)
})

test('retitle: fallback over a non-user title is reported unavailable with no compensation', async () => {
  const before = snapshot('Generated title', { kind: 'provider', provider: 'session-title-all-prompts-llm' }, 5)
  const after = snapshot('Fallback title', { kind: 'fallback' }, 9)
  const { deps, calls, agent } = createHarness({ before, after })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, {
    outcome: 'provider-unavailable',
    actualTitle: 'Fallback title',
    actualSourceKind: 'fallback',
    recovered: false,
  })
  assert.equal(calls.rename.length, 0)
})

test('retitle: a provider other than all-prompts is not accepted as success', async () => {
  const before = snapshot('Old', { kind: 'fallback' }, 2)
  const after = snapshot('First prompt title', { kind: 'provider', provider: 'session-title-first-prompt-llm' }, 6)
  const { deps, calls, agent } = createHarness({ before, after })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, {
    outcome: 'provider-unavailable',
    actualTitle: 'First prompt title',
    actualSourceKind: 'provider',
    recovered: false,
  })
  assert.equal(calls.rename.length, 0)
})


test('retitle: refresh failures are classified into stable structured codes', async () => {
  const { retitle } = await import('../lib/host/retitle.js')
  const timeoutError = new Error('SESSION_TITLE_TIMEOUT after 60000ms')
  timeoutError.name = 'TimeoutReason'
  timeoutError.code = 'SESSION_TITLE_TIMEOUT'
  const cases = [
    [new Error('session-title-llm: input is 5000 bytes, exceeding maxInputBytes 4096'), 'input-too-large'],
    [new Error('session-title-llm: no logged request route is available; configure provider and model together'), 'no-route'],
    [new Error('session-title-llm: title output must contain text only'), 'invalid-output'],
    [new Error('session-title-llm: title output reached maxOutputTokens'), 'truncated-output'],
    [timeoutError, 'timeout'],
    [new Error('explicit title refresh superseded older generation'), 'superseded'],
    [new Error('session-title provider was disposed'), 'unknown'],
  ]
  for (const [error, code] of cases) {
    const { deps, agent } = createHarness({
      before: snapshot('Kept title', { kind: 'provider', provider: 'session-title-all-prompts-llm' }, 3),
      refreshThrows: error,
    })
    const result = await retitle(deps, agent, {}, new AbortController().signal)
    assert.deepEqual(result, {
      outcome: 'failed',
      code,
      actualTitle: 'Kept title',
      actualSourceKind: 'provider',
    })
  }
})

test('retitle: a maxOutputTokens truncation is failed/truncated-output, not invalid-output', async () => {
  const { retitle } = await import('../lib/host/retitle.js')
  const messages = [
    'session-title-llm: title output reached maxOutputTokens',
    'session-title-llm: title output exceeded maxOutputTokens=64',
  ]
  for (const message of messages) {
    const { deps, agent } = createHarness({
      before: snapshot('Kept title', { kind: 'provider', provider: 'session-title-all-prompts-llm' }, 3),
      refreshThrows: new Error(message),
    })
    const result = await retitle(deps, agent, {}, new AbortController().signal)
    assert.deepEqual(result, {
      outcome: 'failed',
      code: 'truncated-output',
      actualTitle: 'Kept title',
      actualSourceKind: 'provider',
    })
  }
})

test('retitle: a cancelled caller signal is failed/cancelled with the actual title left behind', async () => {
  const controller = new AbortController()
  controller.abort()
  const { deps, calls, agent } = createHarness({
    before: snapshot('Old title', { kind: 'fallback' }, 2),
    refreshThrows: new DOMException('This operation was aborted', 'AbortError'),
  })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, controller.signal)
  assert.deepEqual(result, {
    outcome: 'failed',
    code: 'cancelled',
    actualTitle: 'Old title',
    actualSourceKind: 'fallback',
  })
  assert.equal(calls.refresh, 1)
})

test('retitle: a failure that left the deterministic fallback reports it instead of hiding it', async () => {
  const { deps, agent } = createHarness({
    before: undefined,
    after: snapshot('Fallback from first message', { kind: 'fallback' }, 7),
    refreshThrows: new Error('session-title-llm: title model produced no text'),
  })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, {
    outcome: 'failed',
    code: 'invalid-output',
    actualTitle: 'Fallback from first message',
    actualSourceKind: 'fallback',
  })
})

test('retitle: a failure keeps the structured code when the actual title cannot be read', async () => {
  const { deps, agent } = createHarness({
    before: undefined,
    refreshThrows: new Error('session-title-llm: no logged request route is available'),
    getThrowsOnCall: 2,
  })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'failed', code: 'no-route' })
})
test('retitle: an unreadable archive set fails closed without touching the title', async () => {
  const { deps, calls, agent } = createHarness({ archiveThrows: new Error('workspace registry is not started yet') })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'failed', code: 'unknown' })
  assert.equal(calls.get, 0)
  assert.equal(calls.refresh, 0)
})

test('retitle: an unreadable current title fails closed without refreshing', async () => {
  const { deps, calls, agent } = createHarness({ getThrows: new Error('session-title service disposed') })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, {}, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'failed', code: 'unknown' })
  assert.equal(calls.refresh, 0)
})
test('retitle: every produced outcome parses against the strict shared wire result schema', async () => {
  const { retitle } = await import('../lib/host/retitle.js')
  const { createRetitleResultSchema } = await import('../lib/shared/result.js')
  const schema = createRetitleResultSchema()

  const scenarios = [
    [{ archivedSessionIds: ['session-1'] }, {}],
    [{ before: snapshot('Mine', { kind: 'user' }, 3) }, {}],
    [{ before: undefined, after: undefined }, {}],
    [
      { before: snapshot('Mine', { kind: 'user' }, 3), after: snapshot('Fallback', { kind: 'fallback' }, 8) },
      { confirmation: { expectedUserTitleEventSeq: 3 } },
    ],
    [
      { before: snapshot('Old', { kind: 'fallback' }, 1), after: snapshot('Generated', providerSource, 6) },
      {},
    ],
    [
      { before: snapshot('Old', { kind: 'fallback' }, 1), after: snapshot('Fallback', { kind: 'fallback' }, 6) },
      {},
    ],
    [
      {
        before: snapshot('Old', { kind: 'fallback' }, 1),
        refreshThrows: new Error('session-title-llm: title output reached maxOutputTokens'),
      },
      {},
    ],
    [
      {
        before: snapshot('Mine', { kind: 'user' }, 3),
        after: snapshot('Fallback', { kind: 'fallback' }, 8),
        refreshThrows: new Error('SESSION_TITLE_TIMEOUT'),
      },
      { confirmation: { expectedUserTitleEventSeq: 3 } },
    ],
  ]
  for (const [options, request] of scenarios) {
    const { deps, agent } = createHarness(options)
    const result = await retitle(deps, agent, request, new AbortController().signal)
    assert.deepEqual(schema.parse(result), result)
  }
})
test('retitle: an empty-session refresh that returns the same user snapshot is no-input, not provider-unavailable', async () => {
  const before = snapshot('Own title', { kind: 'user' }, 12)
  const after = snapshot('Own title', { kind: 'user' }, 12)
  const { deps, calls, agent } = createHarness({ before, after })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, { confirmation: { expectedUserTitleEventSeq: 12 } }, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'no-input' })
  assert.equal(calls.refresh, 1)
  assert.equal(calls.rename.length, 0)
})

test('retitle: a user snapshot returned with a newer eventSeq is still a provider-unavailable result', async () => {
  const before = snapshot('Own title', { kind: 'user' }, 12)
  const after = snapshot('Someone else renamed', { kind: 'user' }, 15)
  const { deps, calls, agent } = createHarness({ before, after })
  const { retitle } = await import('../lib/host/retitle.js')
  const result = await retitle(deps, agent, { confirmation: { expectedUserTitleEventSeq: 12 } }, new AbortController().signal)
  assert.deepEqual(result, {
    outcome: 'provider-unavailable',
    actualTitle: 'Someone else renamed',
    actualSourceKind: 'user',
    recovered: false,
  })
  assert.equal(calls.rename.length, 0)
})
