import assert from 'node:assert/strict'
import { test } from 'node:test'

const SERVICE_KEY = 'sessionRetitle'
const NAMESPACE = 'sessionRetitle'

/** Build one official-title snapshot shape. */
function snapshot(title, source, eventSeq) {
  return { title, source, eventSeq, messageSeqs: [], updatedAt: 0 }
}

/**
 * Compose the Host service through the real Cordis runtime with structural fake
 * official services. Only the public Service seam is exercised; the fakes
 * record how the Host service delegates.
 */
async function compose() {
  const { Context, Service, symbols } = await import('@deepseek-ai/cordis')
  const { SessionRetitleService } = await import('../lib/host/service.js')

  class FakeSessionTitleService extends Service {
    static inject = []
    constructor(ctx) {
      super(ctx, 'sessionTitle')
      this.calls = { get: 0, refresh: [], rename: [] }
      this.before = undefined
      this.after = undefined
      this.refreshError = undefined
    }
    get() {
      this.calls.get += 1
      return this.before
    }
    async refresh(session, signal) {
      this.calls.refresh.push({ session, signal })
      if (this.refreshError !== undefined) throw this.refreshError
      this.before = this.after
      return this.after
    }
    rename(session, title) {
      this.calls.rename.push({ session, title })
      return snapshot(title, { kind: 'user' }, 99)
    }
  }

  class FakeWorkspaceRegistryService extends Service {
    static inject = []
    constructor(ctx) {
      super(ctx, 'workspaceRegistry')
      this.archived = []
    }
    get archivedSessionIds() {
      return this.archived
    }
  }

  const ctx = new Context()
  ctx.plugin(FakeSessionTitleService)
  ctx.plugin(FakeWorkspaceRegistryService)
  ctx.plugin(SessionRetitleService)
  await ctx.inject([SERVICE_KEY], () => {})
  const resolve = (key) => Reflect.get(ctx[key], symbols.original) ?? ctx[key]
  return { ctx, service: resolve(SERVICE_KEY), title: resolve('sessionTitle'), registry: resolve('workspaceRegistry') }
}

test('host service: injects only the official title and workspace services', async () => {
  const { SessionRetitleService } = await import('../lib/host/service.js')
  assert.deepEqual(SessionRetitleService.inject, ['sessionTitle', 'workspaceRegistry'])
})

test('host service: execute delegates the archive defense and never refreshes an archived session', async () => {
  const { service, title, registry } = await compose()
  registry.archived = ['session-1']
  const agent = { session: { id: 'session-1' } }
  const result = await service.execute(agent, {}, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'archived' })
  assert.equal(title.calls.get, 0)
  assert.equal(title.calls.refresh.length, 0)
})

test('host service: execute forwards the live session and signal to the official refresh', async () => {
  const { service, title } = await compose()
  title.before = snapshot('Old', { kind: 'fallback' }, 2)
  title.after = snapshot('Generated', { kind: 'provider', provider: 'session-title-all-prompts-llm' }, 7)
  const agent = { session: { id: 'session-2' } }
  const controller = new AbortController()
  const result = await service.execute(agent, {}, controller.signal)
  assert.deepEqual(result, {
    outcome: 'refreshed',
    title: 'Generated',
    eventSeq: 7,
    changed: true,
    source: { kind: 'provider', provider: 'session-title-all-prompts-llm' },
  })
  assert.equal(title.calls.refresh.length, 1)
  assert.equal(title.calls.refresh[0].session, agent.session)
  assert.equal(title.calls.refresh[0].signal, controller.signal)
})

test('host service: execute returns the manual-title confirmation without refreshing', async () => {
  const { service, title } = await compose()
  title.before = snapshot('Own title', { kind: 'user' }, 11)
  const result = await service.execute({ session: { id: 'session-3' } }, {}, new AbortController().signal)
  assert.deepEqual(result, { outcome: 'confirmation-required', title: 'Own title', eventSeq: 11 })
  assert.equal(title.calls.refresh.length, 0)
})

test('host service: execute turns a raw refresh rejection into a structured failed result', async () => {
  const { service, title } = await compose()
  title.before = snapshot('Kept', { kind: 'fallback' }, 4)
  title.refreshError = new Error('session-title-llm: input is 9999 bytes, exceeding maxInputBytes 4096')
  const result = await service.execute({ session: { id: 'session-4' } }, {}, new AbortController().signal)
  assert.deepEqual(result, {
    outcome: 'failed',
    code: 'input-too-large',
    actualTitle: 'Kept',
    actualSourceKind: 'fallback',
  })
})

/**
 * The Gateway's source contract for a Service that receives Remote dispatch:
 * the live Service instance must expose a visible, frozen `typertRemote`
 * binding whose service key and wire namespace match the registered strict
 * descriptor.
 */
function gatewayVisibleBinding(service, serviceKey, namespace) {
  const binding = Reflect.get(service, 'typertRemote')
  if (binding === undefined) {
    throw new Error(
      `typert gateway: ${namespace}/execute: Service ${JSON.stringify(serviceKey)} has no visible typertRemote binding`,
    )
  }
  assert.equal(Reflect.get(binding, 'service'), service)
  assert.equal(Reflect.get(binding, 'serviceKey'), serviceKey)
  assert.equal(typeof Reflect.get(binding, 'namespace'), 'string')
  assert.equal(Reflect.get(binding, 'namespace'), namespace)
  return binding
}

test('host service: visible TypertRemote binding and @Remote marker on the live Service', async () => {
  const protocol = await import('@deepseek-ai/dsh-typert-protocol')
  const { sessionRetitleRemoteInfo } = await import('../lib/shared/remote.js')
  const { service } = await compose()
  assert.ok(service instanceof protocol.TypertRemoteService, 'must extend the public TypertRemoteService base')

  const descriptor = sessionRetitleRemoteInfo.descriptors[0]
  assert.equal(descriptor.service, SERVICE_KEY)
  assert.equal(descriptor.namespace, NAMESPACE)

  const binding = gatewayVisibleBinding(service, descriptor.service, descriptor.namespace)
  assert.ok(Object.isFrozen(binding))

  const markers = protocol.remoteMethods(service)
  assert.deepEqual(markers.map((marker) => marker.method), ['execute'])
  assert.deepEqual(markers[0].invocation, { kind: 'direct' })
})

test('host apply: registers the strict contribution and the service', async () => {
  const { apply, inject } = await import('../lib/host/index.js')
  assert.deepEqual(inject, ['typert'])

  const registered = []
  const plugins = []
  const disposers = []
  const ctx = {
    plugin(plugin) { plugins.push(plugin); return () => {} },
    effect(execute) { const dispose = execute(); disposers.push(dispose); return dispose },
    typert: {
      register(contribution) {
        registered.push(contribution)
        return () => {}
      },
    },
  }
  apply(ctx)

  assert.equal(plugins.length, 1)
  assert.equal(plugins[0].name, 'SessionRetitleService')
  assert.equal(registered.length, 1)
  const contribution = registered[0]
  assert.equal(contribution.package, '@hanxu131/dsh-session-retitle')
  assert.equal(contribution.face, 'host')
  assert.deepEqual(contribution.schemas, [])
  assert.deepEqual(contribution.model, { services: [], events: [], objects: [] })
  assert.equal(contribution.invocations.length, 1)
  assert.equal(contribution.invocations[0].service, 'sessionRetitle')
  assert.equal(contribution.invocations[0].cancellation.parameter, 'signal')
})