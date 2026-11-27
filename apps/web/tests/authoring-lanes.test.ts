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
  scripts['test:e2e:unexpected'] = original
  assert.ok(authoringLaneProblems(scripts).some(problem => problem.includes('required lanes')))
})
