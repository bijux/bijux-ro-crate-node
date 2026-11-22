import assert from 'node:assert/strict'

// NODE_OPTIONS preloads run before the qualification guard, regardless of execArgv.
export function assertNoPreloads(options: string | undefined) {
  if (!options) return
  const preload = /(?:^|[\s"])(?:--(?:import|require|loader|experimental-loader)(?=[=\s"]|$)|-r)/
  assert.ok(!preload.test(options), 'NODE_OPTIONS preloads cannot be qualified before the installed consumer guard')
}
