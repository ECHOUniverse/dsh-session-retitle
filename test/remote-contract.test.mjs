import assert from 'node:assert/strict'
import { test } from 'node:test'

const PKG = '@hanxu131/dsh-session-retitle'
const ENDPOINT = 'sessionRetitle/execute'

test('shared descriptor: strict sessionRetitle/execute contract', async () => {
  const mod = await import('../lib/shared/remote.js')
  const { sessionRetitleRemoteInfo, invokeSessionRetitle } = mod

  assert.equal(sessionRetitleRemoteInfo.package, PKG)
  const descriptors = sessionRetitleRemoteInfo.descriptors
  assert.equal(descriptors.length, 1)

  const descriptor = descriptors[0]
  assert.equal(descriptor.id, `${PKG}#${ENDPOINT}`)
  assert.equal(descriptor.namespace, 'sessionRetitle')
  assert.equal(descriptor.method, 'execute')
  assert.equal(descriptor.service, 'sessionRetitle')
  assert.deepEqual(descriptor.invocation, { kind: 'direct' })
  assert.deepEqual(descriptor.scope, { context: 'agent', wire: 'agentId' })
  assert.deepEqual(descriptor.cancellation, { parameter: 'signal' })

  const [agent, request] = descriptor.parameters
  assert.equal(agent.name, 'agent')
  assert.equal(agent.wire, 'agentId')
  assert.equal(agent.source, 'lookup')
  assert.equal(agent.lookup, 'agent')
  assert.equal(agent.codec.mode, 'strict')
  assert.equal(request.name, 'request')
  assert.equal(request.wire, 'request')
  assert.equal(request.source, 'json')
  assert.equal(request.strictCodec.mode, 'strict')

  // Strict input: an initial {} or a confirmation token, with unknown fields rejected.
  const named = sessionRetitleRemoteInfo.methods[ENDPOINT].input({ strict: true }).create()
  assert.deepEqual(named.parse({ agentId: 'session-1', request: {} }), { agentId: 'session-1', request: {} })
  const confirmation = { confirmation: { expectedUserTitleEventSeq: 42 } }
  assert.deepEqual(named.parse({ agentId: 'session-1', request: confirmation }), { agentId: 'session-1', request: confirmation })
  assert.throws(() => named.parse({ agentId: 'session-1', request: {}, extra: 1 }))
  assert.throws(() => named.parse({ agentId: 'session-1', request: { unexpected: true } }))
  assert.throws(() => named.parse({ agentId: 'session-1', request: { confirmation: { expectedUserTitleEventSeq: -1 } } }))

  // Strict result: the full public outcome union, with no unknown fields.
  const result = descriptor.result.create()
  assert.deepEqual(result.parse({ outcome: 'no-input' }), { outcome: 'no-input' })
  assert.deepEqual(
    result.parse({ outcome: 'confirmation-required', title: 'Manual', eventSeq: 42 }),
    { outcome: 'confirmation-required', title: 'Manual', eventSeq: 42 },
  )
  assert.deepEqual(
    result.parse({ outcome: 'refreshed', title: 'Generated', eventSeq: 43, changed: true, source: { kind: 'provider', provider: 'session-title-all-prompts-llm' } }),
    { outcome: 'refreshed', title: 'Generated', eventSeq: 43, changed: true, source: { kind: 'provider', provider: 'session-title-all-prompts-llm' } },
  )
  assert.deepEqual(
    result.parse({ outcome: 'provider-unavailable', actualTitle: 'Fallback', actualSourceKind: 'fallback', recovered: true }),
    { outcome: 'provider-unavailable', actualTitle: 'Fallback', actualSourceKind: 'fallback', recovered: true },
  )
  assert.deepEqual(result.parse({ outcome: 'archived' }), { outcome: 'archived' })
  assert.deepEqual(
    result.parse({ outcome: 'failed', code: 'no-route', actualTitle: 'Old', actualSourceKind: 'provider' }),
    { outcome: 'failed', code: 'no-route', actualTitle: 'Old', actualSourceKind: 'provider' },
  )
  // The truncation code is a first-class failed outcome: it must pass the strict schema.
  assert.deepEqual(
    result.parse({ outcome: 'failed', code: 'truncated-output', actualTitle: 'Fallback', actualSourceKind: 'fallback' }),
    { outcome: 'failed', code: 'truncated-output', actualTitle: 'Fallback', actualSourceKind: 'fallback' },
  )
  assert.throws(() => result.parse({ outcome: 'failed', code: 'not-a-code' }))
  assert.throws(() => result.parse({ outcome: 'unknown-outcome' }))
  assert.throws(() => result.parse({ outcome: 'no-input', extra: 1 }))

  // Client invocation seam: positional agent lookup first, request second, signal last.
  const calls = []
  const remote = {
    sessionRetitle: {
      execute(...args) {
        calls.push(args)
        return Promise.resolve({ ok: true, value: { outcome: 'no-input' } })
      },
    },
  }
  const controller = new AbortController()
  const returned = invokeSessionRetitle(remote, { agentId: 'session-1', request: {}, signal: controller.signal })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'session-1')
  assert.deepEqual(calls[0][1], {})
  assert.equal(calls[0][2], controller.signal)
  assert.deepEqual(await returned, { ok: true, value: { outcome: 'no-input' } })

  // Host contribution: the same single source registers the descriptors.
  const { sessionRetitleContribution } = mod
  assert.equal(sessionRetitleContribution.package, PKG)
  assert.equal(sessionRetitleContribution.face, 'host')
  assert.equal(sessionRetitleContribution.invocations.length, 1)
  assert.equal(sessionRetitleContribution.invocations[0].id, `${PKG}#${ENDPOINT}`)
  assert.deepEqual(sessionRetitleContribution.schemas, [])
  assert.deepEqual(sessionRetitleContribution.model, { services: [], events: [], objects: [] })
})
