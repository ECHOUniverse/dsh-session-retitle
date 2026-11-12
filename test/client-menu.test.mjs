import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DYNAMIC_DEPS,
  MODAL_SLOT_ID,
  ROOT_DEPS,
  SLOTS_DEP,
  createHarness,
  loadClientArtifact,
  primitivesStub,
  resolveMenu,
} from './client-harness.mjs'

const MENU_ICON_KEY = '@hanxu131/dsh-session-retitle.session.retitle.icon'

const MENU_LABEL = 'Regenerate title'

async function applyPlugin(harness) {
  const loaded = await loadClientArtifact()
  const plugin = loaded.factory(loaded.require)
  await plugin.apply(harness.ctx)
  await Promise.resolve()
  return plugin
}

test('wiring: root services, then mount, then one injected child fiber for menu and modal', async () => {
  const harness = createHarness()
  const plugin = await applyPlugin(harness)

  assert.deepEqual(plugin.inject, ROOT_DEPS)
  assert.equal(harness.state.mounted.length, 1)
  assert.equal(harness.state.mounted[0].contribution.package, '@hanxu131/dsh-session-retitle')
  assert.deepEqual(harness.state.injections, [{ deps: DYNAMIC_DEPS }])
  assert.deepEqual(
    harness.state.lifecycle.map((entry) => entry.event),
    ['mount', 'inject'],
    'the namespace must be mounted before a fiber can inject it',
  )

  // Locale dictionaries and the Remote mount belong to the root fiber.
  assert.equal(harness.state.localeRegistrations.length, 1)
  assert.equal(harness.state.localeRegistrations[0].namespace, 'sessionRetitle')
  assert.equal(harness.state.localeRegistrations[0].ctxKind, 'root')
  const labels = harness.state.effects.map((effect) => `${effect.kind}:${effect.label}`)
  assert.deepEqual(labels, [
    'root:session-retitle: locale',
    'root:session-retitle: remote mount',
    'child:session-retitle: operation',
    'child:session-retitle: session menu',
  ])

  // The menu belongs to the injected child fiber.
  assert.equal(harness.state.menuContributions.length, 1)
  assert.equal(harness.state.menuContributions[0].ctxKind, 'child')
  const contribution = harness.menuContribution
  assert.equal(contribution.id, '@hanxu131/dsh-session-retitle.session.retitle')
  assert.equal(contribution.target, 'session')
  assert.equal(contribution.order, 210)

  // The blocking manual-title Modal is a root overlay entry registered from the
  // same injected fiber, with its own locale namespace and injected face. The
  // row glyph is a second, keyed slot entry on the same fiber.
  assert.deepEqual(harness.state.slotInjections, ['shell.overlay', 'contextMenu.icon'])
  assert.equal(harness.state.slotRegistrations.length, 2)
  const slot = harness.slotRegistration
  assert.equal(slot.options.name, 'shell.overlay')
  assert.equal(slot.options.id, MODAL_SLOT_ID)
  assert.equal(slot.options.locale, 'sessionRetitle')
  assert.ok(slot.injected.includes(SLOTS_DEP))
  assert.ok(slot.injected.includes('remote.sessionRetitle'))
})

test('menu: label is resolved from the locale on every resolve', async () => {
  const harness = createHarness()
  await applyPlugin(harness)

  harness.setLocaleDict({ 'menu.retitle': MENU_LABEL })
  const first = await resolveMenu(harness)
  assert.equal(first.actions.length, 1)
  assert.equal(first.actions[0].label, MENU_LABEL)
  assert.equal(first.actions[0].id, '@hanxu131/dsh-session-retitle.session.retitle.action')

  harness.setLocaleDict({ 'menu.retitle': 'Titel neu erzeugen' })
  const second = await resolveMenu(harness)
  assert.equal(second.actions[0].label, 'Titel neu erzeugen')
})

test('menu: the action carries the official refresh glyph on the keyed icon slot', async () => {
  const harness = createHarness()
  await applyPlugin(harness)

  const { actions } = await resolveMenu(harness)
  assert.deepEqual(actions[0].icon, { key: MENU_ICON_KEY })

  const registration = harness.state.slotRegistrations.find(
    (entry) => entry.options.name === 'contextMenu.icon',
  )
  assert.ok(registration !== undefined, 'the action glyph must be registered')
  assert.deepEqual(registration.options, { name: 'contextMenu.icon', key: MENU_ICON_KEY })
  assert.ok(registration.injected.includes(SLOTS_DEP), 'the glyph belongs to the injected fiber')

  // The glyph renders the page-baseline product icon, not a hand-drawn SVG;
  // the shared Menu cell owns the 14px size, so the component takes no size.
  const element = registration.component({ icon: actions[0].icon })
  assert.equal(element.type, primitivesStub.IconRefreshOutlineRegular)
})

test('menu: archived, not-ready and busy workspace states hide the action', async () => {
  const cases = [
    { name: 'archived session', workspace: { phase: 'ready', state: 'idle', archivedSessionIds: ['session-1'] }, visible: false },
    { name: 'list still pending', workspace: { phase: 'pending', state: 'idle', archivedSessionIds: [] }, visible: false },
    { name: 'list loading', workspace: { phase: 'ready', state: 'loading', archivedSessionIds: [] }, visible: false },
    { name: 'list errored', workspace: { phase: 'ready', state: 'error', archivedSessionIds: [] }, visible: false },
    { name: 'another session archived', workspace: { phase: 'ready', state: 'idle', archivedSessionIds: ['other'] }, visible: true },
    { name: 'ready and idle', workspace: { phase: 'ready', state: 'idle', archivedSessionIds: [] }, visible: true },
  ]

  const loaded = await loadClientArtifact()
  for (const entry of cases) {
    const harness = createHarness()
    const plugin = loaded.factory(loaded.require)
    harness.setWorkspace(entry.workspace)
    await plugin.apply(harness.ctx)
    const { actions } = await resolveMenu(harness)
    assert.equal(
      actions.length,
      entry.visible ? 1 : 0,
      `menu visibility case failed: ${entry.name}`,
    )
  }
})

test('menu: opening the menu performs no network request and no title call', async () => {
  const harness = createHarness()
  await applyPlugin(harness)

  await resolveMenu(harness, 'session-1')
  assert.equal(harness.inventoryReads.length, 0, 'the menu must not query the provider')
  assert.equal(harness.calls.length, 0, 'the menu must not call the Remote')
  assert.equal(harness.state.workspaceReads.length, 1, 'the archive decision comes from the sync snapshot only')
})

test('menu: observe subscribes the archive source so a later archive change re-resolves', async () => {
  const harness = createHarness()
  await applyPlugin(harness)

  const contribution = harness.menuContribution
  assert.equal(typeof contribution.observe, 'function')
  const sources = contribution.observe({ sessionId: 'session-1', displayTitle: 'T' })
  assert.equal(sources.length, 1)
  assert.equal(typeof sources[0].getSnapshot, 'function')
  assert.equal(typeof sources[0].subscribe, 'function')
  let notified = 0
  const unsubscribe = sources[0].subscribe(() => { notified += 1 })
  assert.equal(harness.state.workspaceSubscribes.length, 1)
  harness.state.workspaceSubscribes[0]()
  unsubscribe()
  assert.equal(notified, 1)
})

test('menu: a workspace read failure hides the action instead of throwing', async () => {
  const harness = createHarness()
  await applyPlugin(harness)
  harness.hideService('workspaces')
  const { actions } = await resolveMenu(harness)
  assert.deepEqual(actions, [])
})