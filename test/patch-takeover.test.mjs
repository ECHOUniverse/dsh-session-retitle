import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

const OFFICIAL_ROW_ID = 'optional-session-title-all-prompts'
const PROVIDER_MODULE = '@deepseek-ai/dsh-session-title-all-prompts-llm'
const TAKEOVER_ROW_ID = 'session-retitle-all-prompts'
const PLUGIN_ROW_ID = 'session-retitle'
const PLUGIN_NAME = '@hanxu131/dsh-session-retitle'

const EXPECTED_CONFIG = {
  targetWords: 5,
  targetCjkCharacters: 10,
  maxInputBytes: 32768,
  maxOutputTokens: 512,
  timeoutMs: 60000,
}

// Minimal YAML subset parser for cordis.patch.yml only: top-level list blocks
// made of `- id:` / `- insert:`, indent-2 scalars, indent-4 insert entries,
// indent-6 entry keys and indent-8 config maps. Comments are full lines.
function parseScalar(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === '{}') return {}
  if (raw === '[]') return []
  if (/^-?\d+$/.test(raw)) return Number(raw)
  const quoted = /^(['"])(.*)\1$/.exec(raw)
  return quoted ? quoted[2] : raw
}

function splitKey(line) {
  const at = line.indexOf(':')
  assert.ok(at > 0, `unexpected YAML line: ${line}`)
  return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
}

function parsePatchDocument(text) {
  const blocks = []
  let block
  let entry
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimStart()
    if (!line.trim() || line.startsWith('#')) continue
    const indent = rawLine.length - line.length
    assert.equal(indent % 2, 0, `odd indentation: ${line}`)
    if (indent === 0) {
      assert.ok(line.startsWith('- '), `top-level blocks are list items: ${line}`)
      block = {}
      entry = undefined
      blocks.push(block)
      const [key, value] = splitKey(line.slice(2))
      block[key] = value === '' ? [] : parseScalar(value)
      continue
    }
    assert.ok(block, `line outside a block: ${line}`)
    if (indent === 2) {
      const [key, value] = splitKey(line)
      block[key] = value === '' ? [] : parseScalar(value)
      continue
    }
    if (indent === 4) {
      assert.ok(line.startsWith('- ') && Array.isArray(block.insert), `unexpected insert row: ${line}`)
      entry = {}
      block.insert.push(entry)
      const [key, value] = splitKey(line.slice(2))
      entry[key] = value === '' ? {} : parseScalar(value)
      continue
    }
    assert.ok(entry, `entry key outside an insert row: ${line}`)
    if (indent === 6) {
      const [key, value] = splitKey(line)
      entry[key] = value === '' ? {} : parseScalar(value)
      continue
    }
    assert.equal(indent, 8, `unexpected indentation: ${line}`)
    const [key, value] = splitKey(line)
    entry.config[key] = parseScalar(value)
  }
  return blocks
}

// Equivalent to the official applyPatches semantics used by
// cordis-plugin-include for this fixture: clone the tree, append inserts and
// overlay non-insert rows key by key, later layers winning.
function applyPatches(data, patches) {
  const tree = structuredClone(data)
  const byId = new Map()
  const indexEntries = (entries) => {
    for (const entry of entries) {
      if (entry.id) byId.set(entry.id, entry)
      if (entry.group && Array.isArray(entry.config)) indexEntries(entry.config)
    }
  }
  indexEntries(tree)
  for (const patch of patches) {
    const { id, insert, name: _name, ...overrides } = patch
    if (insert) {
      const clone = structuredClone(insert)
      if (id) {
        const target = byId.get(id)
        assert.ok(target, `patch insert target ${id} is missing`)
        assert.ok(Array.isArray(target.config), `patch insert target ${id} is not a group`)
        target.config.push(...clone)
      } else {
        tree.push(...clone)
      }
      indexEntries(clone)
      continue
    }
    assert.ok(id, 'a non-insert patch needs an id')
    const target = byId.get(id)
    assert.ok(target, `patch target ${id} is missing: check bundle order`)
    Object.assign(target, overrides)
  }
  return tree
}

const baseline = () => [{
  id: OFFICIAL_ROW_ID,
  name: PROVIDER_MODULE,
  config: { targetWords: 5, targetCjkCharacters: 10, maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 60000 },
}]

const row = (tree, id) => tree.find((entry) => entry.id === id)

const patchText = read('cordis.patch.yml')
const patches = parsePatchDocument(patchText)

test('patch: a single override block disables the official provider row', () => {
  assert.equal(patches.length, 2, 'expected exactly one override and one insert block')
  const [override] = patches
  assert.deepEqual(Object.keys(override).sort(), ['disabled', 'id'], 'override row must not carry config/insert')
  assert.equal(override.id, OFFICIAL_ROW_ID)
  assert.equal(override.disabled, true)
  assert.doesNotMatch(patchText, /!!js/, 'the takeover must stay declarative YAML')
  assert.doesNotMatch(patchText, /\t/, 'indentation must be spaces only')
})

test('patch: the insert block keeps the plugin row and mounts the raised-limit provider', () => {
  const insert = patches[1]
  assert.deepEqual(Object.keys(insert), ['insert'])
  assert.ok(Array.isArray(insert.insert))
  assert.equal(insert.insert.length, 2)

  const pluginRow = row(insert.insert, PLUGIN_ROW_ID)
  assert.ok(pluginRow, 'the plugin bundle row must stay inserted')
  assert.equal(pluginRow.name, PLUGIN_NAME)
  assert.deepEqual(pluginRow.config, {})

  const providerRow = row(insert.insert, TAKEOVER_ROW_ID)
  assert.ok(providerRow, 'the takeover provider row must be inserted')
  assert.equal(providerRow.name, PROVIDER_MODULE)
  assert.deepEqual(providerRow.config, EXPECTED_CONFIG)

  for (const [key, value] of Object.entries(providerRow.config)) {
    assert.ok(Number.isInteger(value) && value > 0, `${key} must be a positive integer`)
  }
  assert.ok(providerRow.config.maxInputBytes > 4096, 'the takeover must raise the 4096-byte input limit')
  assert.equal(providerRow.config.maxOutputTokens, 512)
  assert.equal(providerRow.config.timeoutMs, 60000)
})

test('composition: the takeover disables the official row and mounts the provider', () => {
  const composed = applyPatches(baseline(), patches)
  const official = row(composed, OFFICIAL_ROW_ID)
  assert.equal(official.disabled, true)
  assert.equal(official.name, PROVIDER_MODULE)
  assert.deepEqual(official.config, baseline()[0].config, 'config must be overridden by neither layer')

  const provider = row(composed, TAKEOVER_ROW_ID)
  assert.ok(provider)
  assert.equal(provider.name, PROVIDER_MODULE)
  assert.equal(provider.config.maxInputBytes, 32768)
  assert.equal(provider.config.maxOutputTokens, 512)

  assert.equal(baseline()[0].disabled, undefined, 'composition must not mutate the source tree')
})

test('composition: a later profile config override cannot re-enable the official row', () => {
  const profilePatch = [{ id: OFFICIAL_ROW_ID, config: { ...baseline()[0].config } }]
  const composed = applyPatches(baseline(), [...patches, ...profilePatch])
  const official = row(composed, OFFICIAL_ROW_ID)
  assert.equal(official.disabled, true, 'disabled and config are independent patch keys')
  assert.equal(official.config.maxInputBytes, 4096, 'the profile layer still owns config')
})

test('composition: dropping this bundle restores the official row', () => {
  // Uninstalling the bundle means recomposing the same base without its patch
  // layer; this is what the host does on the next start, not a patch that
  // removes the inserted row.
  const withTakeover = applyPatches(baseline(), patches)
  const withoutTakeover = applyPatches(baseline(), [])

  assert.deepEqual(withoutTakeover, baseline(), 'recomposition without the bundle must equal the pre-install tree')
  assert.equal(row(withTakeover, OFFICIAL_ROW_ID).disabled, true, 'the takeover really was applied first')
  assert.equal(row(withTakeover, TAKEOVER_ROW_ID).config.maxInputBytes, 32768)

  const restoredOfficial = row(withoutTakeover, OFFICIAL_ROW_ID)
  assert.equal(restoredOfficial.disabled, undefined)
  assert.equal(restoredOfficial.config.maxInputBytes, 4096)
  assert.equal(restoredOfficial.config.maxOutputTokens, 64)
  assert.equal(row(withoutTakeover, TAKEOVER_ROW_ID), undefined, 'no takeover row without this bundle')
})

test('preflight: the inserted provider row keeps the client capability check green', () => {
  // Read the preflight module constant instead of hardcoding it in the test,
  // so renaming the inserted row cannot silently break the fail-closed check.
  const source = read('src/client/capability.ts')
  const moduleMatch = /export const ALL_PROMPTS_MODULE = '([^']+)'/.exec(source)
  const entryIdMatch = /export const ALL_PROMPTS_ENTRY_ID = '([^']+)'/.exec(source)
  assert.ok(moduleMatch, 'ALL_PROMPTS_MODULE must stay exported from capability.ts')
  assert.ok(entryIdMatch, 'ALL_PROMPTS_ENTRY_ID must stay exported from capability.ts')
  assert.equal(moduleMatch[1], PROVIDER_MODULE)
  assert.equal(entryIdMatch[1], OFFICIAL_ROW_ID)

  const inserted = row(patches[1].insert, TAKEOVER_ROW_ID)
  assert.ok(inserted)
  assert.equal(inserted.name, moduleMatch[1], 'the inserted row name must match the preflight module constant')

  // Pin the real decision shape: a semantic change in capability.ts (for
  // example dropping the module-name match) must fail this test, not pass it.
  const activeBody = /export function isActiveAllPromptsRow\([\s\S]*?\n}/.exec(source)?.[0]
  const snapshotBody = /export function hasActiveAllPrompts\([\s\S]*?\n}/.exec(source)?.[0]
  assert.ok(activeBody, 'isActiveAllPromptsRow must stay exported')
  assert.ok(snapshotBody, 'hasActiveAllPrompts must stay exported')
  assert.match(activeBody, /row\.entryId === ALL_PROMPTS_ENTRY_ID \|\| row\.moduleName === ALL_PROMPTS_MODULE/, 'the preflight must match by entry id or module name')
  assert.match(activeBody, /row\.enabled === true/, 'the preflight must require positive enablement')
  assert.match(activeBody, /row\.fiberPhase === 'active'/, 'the preflight must require an active fiber')
  assert.match(snapshotBody, /Array\.isArray\(snapshot\.entries\)/, 'a non-array inventory must fail closed')

  // Equivalent of capability.ts isActiveAllPromptsRow / hasActiveAllPrompts:
  // entry id OR module name, positively enabled, root fiber active.
  const isActiveRow = (inventoryRow) => (inventoryRow.entryId === entryIdMatch[1] || inventoryRow.moduleName === moduleMatch[1])
    && inventoryRow.enabled === true
    && inventoryRow.fiberPhase === 'active'
  const hasActiveProvider = (snapshot) => Array.isArray(snapshot.entries)
    && (snapshot.entries.some(isActiveRow)
      || (Array.isArray(snapshot.agentPresets)
        && snapshot.agentPresets.some((group) => Array.isArray(group.rows) && group.rows.some(isActiveRow))))

  const officialDisabled = { entryId: OFFICIAL_ROW_ID, moduleName: PROVIDER_MODULE, enabled: false, fiberPhase: 'active' }
  const takeoverActive = { entryId: TAKEOVER_ROW_ID, moduleName: inserted.name, enabled: true, fiberPhase: 'active' }

  assert.equal(hasActiveProvider({ entries: [officialDisabled] }), false, 'a disabled official row alone must fail closed')
  assert.equal(hasActiveProvider({ entries: [officialDisabled, takeoverActive] }), true, 'the takeover row must satisfy the preflight')
  assert.equal(hasActiveProvider({ entries: [], agentPresets: [{ rows: [takeoverActive] }] }), true, 'preset rosters are scanned too')
  assert.equal(hasActiveProvider({ entries: [officialDisabled, { ...takeoverActive, fiberPhase: 'pending' }] }), false, 'a not-yet-active takeover row must fail closed')
  assert.equal(hasActiveProvider({ entries: null }), false, 'a non-array entries inventory must fail closed')
  assert.equal(hasActiveProvider({ entries: [], agentPresets: [{ rows: null }] }), false, 'a malformed preset roster must not throw')
})

// The official row id is also the preflight constant in src/client/capability.ts
// (it matches by entry id OR module name, so the takeover row stays visible to
// the fail-closed check). That single pre-existing occurrence is not a takeover
// code path: it is allowed only there and in its built mirror lib/client.js.
const PREFLIGHT_SOURCE = 'src/client/capability.ts'
const PREFLIGHT_BUILD = 'lib/client.js'

test('residency: the takeover lives only in the bundle patch', () => {
  const files = []
  for (const dir of ['src', 'scripts', 'lib']) {
    const base = new URL(`${dir}/`, root)
    for (const relative of readdirSync(base, { recursive: true })) {
      const file = new URL(relative, base)
      if (statSync(file).isFile()) files.push({ label: `${dir}/${relative}`, file })
    }
  }
  for (const { label, file } of files) {
    const text = readFileSync(file, 'utf8')
    assert.doesNotMatch(text, new RegExp(TAKEOVER_ROW_ID), `${label} must not carry a takeover code path`)
    assert.doesNotMatch(text, /32768/, `${label} must not hardcode takeover limits`)
    if (text.includes(OFFICIAL_ROW_ID)) {
      assert.ok(
        label === PREFLIGHT_SOURCE || label === PREFLIGHT_BUILD,
        `${label} references the official row outside the provider preflight`,
      )
    }
  }

  const preflight = read(PREFLIGHT_SOURCE)
  assert.equal(preflight.split(OFFICIAL_ROW_ID).length - 1, 1, 'the preflight keeps exactly one official-row reference')
})

test('docs: install, takeover, and uninstall-restore semantics are documented', () => {
  const readme = read('README.md')
  const detail = read('docs/DETAIL.md')
  for (const [name, text] of [['README.md', readme], ['docs/DETAIL.md', detail]]) {
    assert.match(text, /卸载/, `${name} must describe uninstall`)
    assert.match(text, /恢复/, `${name} must describe restore`)
    assert.match(text, /32768/, `${name} must document the raised input limit`)
  }
  assert.match(readme, /标题 Provider 配置接管/, 'README needs the takeover section')
  assert.match(readme, /session-retitle-all-prompts/)
  assert.match(readme, /完全退出/, 'README must require a full DSH restart')
  assert.match(readme, /仅禁用[\s\S]{0,120}?不会撤销接管/s, 'README must state that disabling only the plugin row keeps the takeover')
  assert.match(detail, /配置接管与恢复/, 'DETAIL needs the takeover restore section')
})
