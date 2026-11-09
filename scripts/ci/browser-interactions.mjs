import assert from 'node:assert/strict'

const sourceGuards = Object.freeze([
  'manifest/numeric-identity', 'metadata/urls', 'upstream-defects', 'native-file-values',
  'text-file-values', 'file-path-ownership', 'selected-colon-paths', 'root-identity',
  'repair', 'races', 'session/termination', 'draft-editor', 'offline', 'report-display', 'workloads',
])

/** Separate owned source and installed checks without changing the full local run. */
export function browserInteractionGroups(command, lane) {
  assert.ok(lane === undefined || ['source', 'installed'].includes(lane),
    'BIJUX_TEST_INTERACTION must be source or installed')
  const groups = [sourceGuards.map(path => command(`tests/browser/${path}.mjs`)), [
    command('tests/package/consumers.mjs', ['--browser-guards']),
    command('tests/package/consumers.mjs', ['--browser-apps']),
  ]]
  return lane === undefined ? groups : [groups[lane === 'source' ? 0 : 1]]
}
