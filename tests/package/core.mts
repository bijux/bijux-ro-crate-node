import assert from 'node:assert/strict'
import type {Scenario} from './harness/contracts.mjs'

export function coreScenario(core: {name: string}): Scenario {
  assert.equal(core.name, '@bijux/ro-crate-core', 'Core scenario must exercise its public package')
  const source = 'tests/package/fixtures/core/'
  return {fixture: {
    files: ['node-runtime.ts', 'node-types.ts', 'browser-types.ts'].map(name => ({source: source + name, target: name})),
    nodeRoots: ['node-runtime.ts', 'node-types.ts'], browserRoots: ['browser-types.ts'],
    runtimeEntry: {source: 'node-runtime.ts', output: 'consumer.mjs'},
    required: [{packageName: core.name, export: '.', environment: 'node'}, {packageName: core.name, export: '.', environment: 'browser'}],
  }}
}
