import assert from 'node:assert/strict'

const sourceGuards = Object.freeze([
  'manifest/numeric-identity', 'metadata/urls', 'metadata/reserved-types', 'metadata/model-type-prefixes', 'upstream-defects', 'native-file-values',
  'text-file-values', 'file-path-ownership', 'selected-colon-paths', 'root-identity',
  'repair', 'races', 'session/termination', 'session/completion', 'draft-editor', 'offline', 'report-display', 'workloads',
])

/** Separate owned source and installed checks without changing the full local run. */
export function browserInteractionGroups<T>(command: (path: string, args?: string[], env?: NodeJS.ProcessEnv) => T, lane?: string) {
  assert.ok(lane === undefined || ['source', 'source-0', 'source-1', 'source-2', 'installed', 'installed-references', 'installed-sessions', 'installed-inputs', 'installed-apps'].includes(lane),
    'BIJUX_TEST_INTERACTION must select a valid source or installed lane')
  const groups = [sourceGuards.map(path => command(`tests/browser/${path}.mjs`)), [
    command('tests/package/consumers.mjs', ['--browser-guards']),
    command('tests/package/consumers.mjs', ['--browser-apps']),
  ]]
  if (lane === undefined) return groups
  if (lane === 'installed') return [groups[1]]
  if (lane === 'installed-apps') return [[command('tests/package/consumers.mjs', ['--browser-apps'])]]
  if (lane.startsWith('installed-')) return [[command('tests/package/consumers.mjs', ['--browser-guards'], {BIJUX_TEST_INSTALLED_GUARD: lane.slice('installed-'.length)})]]
  if (lane === 'source') return [groups[0]]
  const index = Number(lane.slice(-1))
  return [groups[0].filter((_, position) => position % 3 === index)]
}
