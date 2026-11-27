import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {test} from 'node:test'
import {authoringLaneProblems} from '../authoring-lanes.mjs'

const manifest = JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')) as {scripts:Record<string,string>}
test('authoring lanes cover the complete browser suite exactly once', () => {
  assert.deepEqual(authoringLaneProblems(manifest.scripts),[])
  const scripts = {...manifest.scripts}
  const name = 'test:e2e:entity', original = scripts[name]
  scripts[name] = original.replace(' tests/recovery/entity-input.test.ts','')
  assert.notDeepEqual(authoringLaneProblems(scripts),[])
  scripts[name] = `${original} tests/recovery/entity-input.test.ts`
  assert.ok(authoringLaneProblems(scripts).some(problem => problem.includes('more than once')))
  scripts[name] = `${original} && echo skipped`
  assert.ok(authoringLaneProblems(scripts).some(problem => problem.includes('Invalid browser lane')))
  scripts[name] = original
  scripts['test:e2e:recovery'] = scripts['test:e2e:recovery'].replace('--test-concurrency=1 ','')
  assert.ok(authoringLaneProblems(scripts).some(problem => problem.includes('serialize large cases')))
  scripts['test:e2e:recovery'] = manifest.scripts['test:e2e:recovery']
  for (const [boundary,lane] of [
    ['tests/recovery/failure-guidance.test.ts','recovery'], ['tests/recovery/study-input.test.ts','recovery'], ['tests/recovery/replacement-safety.test.ts','recovery'],
    ['tests/recovery/entity-input.test.ts','entity'], ['tests/recovery/specimen-label-limit.test.ts','specimen'],
    ['tests/files/journey.test.ts','listings'], ['tests/vocabulary/recovery-limit.test.ts','listings'],
  ] as const) {
    const moved = {...manifest.scripts}
    moved[`test:e2e:${lane}`] = moved[`test:e2e:${lane}`].replace(` ${boundary}`,'')
    moved['test:e2e:core'] += ` ${boundary}`
    assert.ok(authoringLaneProblems(moved).some(problem => problem.includes(`must run in test:e2e:${lane}`)), boundary)
  }
  const ordinary = 'tests/journey.test.ts'
  scripts['test:e2e:core'] = scripts['test:e2e:core'].replace(` ${ordinary}`,'')
  scripts['test:e2e:specimen'] += ` ${ordinary}`
  assert.ok(authoringLaneProblems(scripts).some(problem => problem.includes('isolate its large case')))
  scripts['test:e2e:core'] = manifest.scripts['test:e2e:core']
  scripts['test:e2e:specimen'] = manifest.scripts['test:e2e:specimen']
  scripts['test:e2e:unexpected'] = original
  assert.ok(authoringLaneProblems(scripts).some(problem => problem.includes('required lanes')))
})
