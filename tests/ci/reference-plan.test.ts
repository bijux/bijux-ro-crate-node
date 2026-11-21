import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import test from 'node:test'

test('reference plans are importable without execution and use supplied executables', () => {
  const program = `import {createReferencePlan} from './scripts/reference/plan.mjs';
    const plan = createReferencePlan({python: '/explicit/python', nodeExecutable: '/explicit/node'});
    const commands = plan.referenceGroups['source-contracts'];
    if (commands.length !== 1 || commands[0].command !== '/explicit/node' ||
        !commands[0].args.includes('tests/reference/jsonld-processing/checks.test.ts') ||
        !plan.upstreamReferenceFamilies.some(f => f.steps.some(s => s.command === '/explicit/python'))) process.exit(4);`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {encoding: 'utf8'})
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
})
