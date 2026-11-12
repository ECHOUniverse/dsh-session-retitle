/**
 * Client-side test harness for the built ModuleLoader artifact.
 *
 * Models the parts of the real Client runtime this plugin touches: Cordis
 * fiber injection (root services plus the dynamic mounted namespace),
 * the shared context-menu service, the workspace snapshot source, the
 * plugin-inventory Remote and the slot service. Every interaction is recorded
 * so tests can assert ordering and fail-closed behaviour.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

export const PKG = '@hanxu131/dsh-session-retitle'
export const REMOTE_NAMESPACE_DEP = 'remote.sessionRetitle'
export const PLUGIN_INVENTORY_DEP = 'remote.pluginInventory'
export const WORKSPACES_DEP = 'workspaces'
export const SLOTS_DEP = 'slots'
export const ROOT_DEPS = ['remote', 'contextMenus', 'locale', 'workspaces', 'slots']
export const DYNAMIC_DEPS = [REMOTE_NAMESPACE_DEP, PLUGIN_INVENTORY_DEP, WORKSPACES_DEP, SLOTS_DEP]
export const ALL_PROMPTS_ENTRY_ID = 'optional-session-title-all-prompts'
export const ALL_PROMPTS_MODULE = '@deepseek-ai/dsh-session-title-all-prompts-llm'
export const PRIMITIVES_MODULE = '@deepseek-ai/dsh-client-ui-primitives'

/**
 * The page seeds the official UI primitives module in its baseline module
 * table; Node has no such package, so the artifact's one glyph import is stubbed
 * here and its identity is asserted by the menu tests.
 */
export const primitivesStub = {
  IconRefreshOutlineRegular: function IconRefreshOutlineRegular() { return null },
}
export const MENU_CONTRIBUTION_ID = `${PKG}.session.retitle`
export const MENU_ACTION_ID = `${PKG}.session.retitle.action`
export const MODAL_SLOT_ID = 'session-retitle.manual-title-modal'

let cachedArtifact
/** Load the built single-file Client artifact through a ModuleLoader stand-in (once). */
export async function loadClientArtifact() {
  if (cachedArtifact !== undefined) return cachedArtifact
  const nodeRequire = createRequire(import.meta.url)
  const require = (specifier) => (specifier === PRIMITIVES_MODULE ? primitivesStub : nodeRequire(specifier))
  let loaded
  globalThis.window ??= {}
  globalThis.window.__ModuleLoader__ = {
    load(config) { loaded = config },
  }
  await import('../lib/client.js')
  assert.ok(loaded !== undefined, 'client artifact must call window.__ModuleLoader__.load()')
  cachedArtifact = { ...loaded, require }
  return cachedArtifact
}

const DEFAULT_ENTRY = {
  entryId: ALL_PROMPTS_ENTRY_ID,
  moduleName: ALL_PROMPTS_MODULE,
  enabled: true,
  fiberPhase: 'active',
}

/** One inventory snapshot with an active all-prompts provider row. */
export function activeInventory() {
  return { ok: true, value: { entries: [DEFAULT_ENTRY] } }
}

export function createHarness() {
  const state = {
    mounted: [],
    lifecycle: [],
    injections: [],
    childContexts: [],
    menuContributions: [],
    slotRegistrations: [],
    localeRegistrations: [],
    effects: [],
    calls: [],
    toasts: [],
    inventoryReads: [],
    workspaceReads: [],
    workspaceSubscribes: [],
    namespaceMounted: false,
    hiddenServices: new Set(),
    inventory: activeInventory(),
    workspace: { phase: 'ready', state: 'idle', archivedSessionIds: [] },
    behavior: () => Promise.resolve({ ok: true, value: { outcome: 'no-input' } }),
    localeDict: {},
    slotInjections: [],
  }

  function trace(injected, dep) {
    if (!injected.has(dep)) throw new Error(`cannot get property "${dep}" without inject`)
    if (state.hiddenServices.has(dep)) {
      throw new Error(`cannot get required service "${dep}" in inactive context`)
    }
  }

  function namespaceService(injected) {
    trace(injected, REMOTE_NAMESPACE_DEP)
    if (!state.namespaceMounted) {
      throw new Error(`cannot get required service "${REMOTE_NAMESPACE_DEP}" in inactive context`)
    }
    return {
      execute(...args) {
        const record = { args, sessionId: args[0], request: args[1], signal: args[2], injected: [...injected] }
        state.calls.push(record)
        return state.behavior(record, state)
      },
    }
  }

  function inventoryService(injected) {
    trace(injected, PLUGIN_INVENTORY_DEP)
    return {
      list() {
        state.inventoryReads.push({ injected: [...injected] })
        const next = state.inventory
        if (typeof next === 'function') return next()
        return Promise.resolve(next)
      },
    }
  }

  function workspacesService(injected) {
    trace(injected, WORKSPACES_DEP)
    return {
      list: {
        getSnapshot() {
          state.workspaceReads.push({ injected: [...injected] })
          return state.workspace
        },
        subscribe(listener) {
          state.workspaceSubscribes.push(listener)
          return () => {
            state.workspaceSubscribes = state.workspaceSubscribes.filter((entry) => entry !== listener)
          }
        },
      },
    }
  }

  function slotsService(injected) {
    trace(injected, SLOTS_DEP)
    return {
      inject(key, callback) {
        state.slotInjections.push(key)
        callback()
        return () => {}
      },
      register(options, component) {
        const record = { options, component, injected: [...injected] }
        state.slotRegistrations.push(record)
        return () => {
          state.slotRegistrations = state.slotRegistrations.filter((entry) => entry !== record)
        }
      },
    }
  }

  function createContext(kind, injected) {
    const contextMenus = {
      register(contribution) {
        state.menuContributions.push({ contribution, ctxKind: kind })
        return () => {}
      },
      notify(text, success) { state.toasts.push({ text, success }) },
    }
    const locale = {
      register(namespace, dicts) {
        state.localeRegistrations.push({ namespace, dicts, ctxKind: kind })
        return () => {}
      },
      bind(namespace) {
        return (key) => state.localeDict[key] ?? key
      },
    }
    const remote = {
      async $mount(contribution) {
        state.lifecycle.push({ event: 'mount' })
        state.mounted.push({ contribution })
        state.namespaceMounted = true
        return async () => { state.namespaceMounted = false }
      },
      get sessionRetitle() { return namespaceService(injected) },
      get pluginInventory() { return inventoryService(injected) },
    }
    return {
      kind,
      injected,
      remote,
      contextMenus,
      locale,
      get workspaces() { return workspacesService(injected) },
      get slots() { return slotsService(injected) },
      effect(execute, label) {
        const disposer = execute()
        state.effects.push({ kind, label, disposer })
        return disposer
      },
      inject(deps, callback) {
        state.lifecycle.push({ event: 'inject', deps: [...deps] })
        const childInjected = new Set(deps)
        for (const dep of deps) {
          if (dep === REMOTE_NAMESPACE_DEP) {
            if (!state.namespaceMounted) {
              throw new Error(`cannot get required service "${dep}" in inactive context`)
            }
            continue
          }
          if (dep === PLUGIN_INVENTORY_DEP || dep === WORKSPACES_DEP || dep === SLOTS_DEP) continue
          throw new Error(`unexpected injected dependency: ${dep}`)
        }
        state.injections.push({ deps: [...deps] })
        const child = createContext('child', childInjected)
        state.childContexts.push(child)
        callback(child)
        return Promise.resolve({ dispose() {} })
      },
    }
  }

  const ctx = createContext('root', new Set(ROOT_DEPS))
  const harness = {
    ctx,
    state,
    get calls() { return state.calls },
    get toasts() { return state.toasts },
    get inventoryReads() { return state.inventoryReads },
    get menuContribution() { return state.menuContributions[0]?.contribution },
    get slotRegistration() { return state.slotRegistrations[0] },
    /** Injected face of the last registered overlay entry. */
    modalFace() {
      const registration = state.slotRegistrations[0]
      assert.ok(registration !== undefined, 'the manual-title Modal must be registered')
      return registration.options.inject()
    },
    /** Current Modal snapshot read through the injected observable. */
    modalState() {
      return this.modalFace().hooks.sessionRetitleModal.getSnapshot()
    },
    setBehavior(next) { state.behavior = next },
    setInventory(next) { state.inventory = next },
    setWorkspace(next) { state.workspace = next },
    setLocaleDict(next) { state.localeDict = next },
    hideService(dep) { state.hiddenServices.add(dep) },
  }
  return harness
}

/** Resolve the session menu action list for one right-click. */
export async function resolveMenu(harness, sessionId = 'session-1', displayTitle = 'Existing title') {
  assert.ok(harness.menuContribution !== undefined, 'the session menu must be registered')
  const signal = new AbortController()
  const actions = await harness.menuContribution.resolve({ sessionId, displayTitle }, signal.signal)
  return { actions, controller: signal }
}

/** Resolve and run the session menu action, like one click. */
export async function runMenuAction(harness, sessionId = 'session-1', displayTitle = 'Existing title') {
  const { actions } = await resolveMenu(harness, sessionId, displayTitle)
  assert.equal(actions.length, 1)
  await actions[0].run()
}
