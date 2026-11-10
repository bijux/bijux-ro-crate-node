import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdir, mkdtemp, readFile, writeFile, rm, access} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {runReferenceFamilies, runReferenceStep} from '../../scripts/ci/reference-execution.mjs'
import {referenceGroups, upstreamReferenceFamilies, runReferenceGroup} from '../../scripts/ci/reference-checks.mjs'

const command = (source, ...args) => ({command: process.execPath, args: ['--input-type=module', '--eval', source, ...args]})
async function directory(t) {
  const parent = fileURLToPath(new URL('../../artifacts/work/', import.meta.url))
  await mkdir(parent, {recursive: true})
  const path = await mkdtemp(parent + 'reference-execution-')
  t.after(() => rm(path, {recursive: true, force: true}))
  return path
}

test('reference scheduling retains every locked command, input, output and environment', () => {
  const steps = referenceGroups['upstream-defects']
  assert.equal(steps.length, 48)
  assert.deepEqual(upstreamReferenceFamilies.map(family => [family.name, family.steps.length]), [
    ['jsonld-graph-contexts', 5], ['temporal-literals', 5], ['literal-targets', 2], ['converter-failures', 2],
    ['diagnostic-identities', 5], ['disabled-context-terms', 6], ['root-context-propagation', 6],
    ['url-authorities', 2], ['key-equality', 7], ['manifest-inference', 7],
  ])
  assert.deepEqual(upstreamReferenceFamilies.flatMap(family => family.steps), steps.slice(0, -1))
  assert.deepEqual(steps.at(-1).args, ['tests/reference/upstream-defects/run.mjs'])
  const portable = steps.map(step => ({...step, command: step.command.endsWith('/node') ? 'node' :
    step.command.endsWith('/python') ? 'python' : step.command}))
  assert.equal(createHash('sha256').update(JSON.stringify(portable)).digest('hex'),
    'c6f9d34266060ac4a08efcebf660e89aafa5332c06411e902d01b54244e10d8d')
  const outputs = upstreamReferenceFamilies.flatMap(family => family.steps.flatMap(step => [
    ...(step.stdout ? [step.stdout] : []),
    ...step.args.flatMap((arg, index) => ['--output', '--integrity-output', '--details-output'].includes(arg) ? [step.args[index + 1]] : []),
  ]))
  assert.equal(new Set(outputs).size, outputs.length, 'Independent captures must not overwrite shared outputs')
})

test('two reference chains overlap, preserve family order and finish before validation', async () => {
  const events = [], active = new Set()
  let maximum = 0
  const gates = [Promise.withResolvers(), Promise.withResolvers()]
  const families = ['temporal', 'literals', 'keys', 'manifests'].map((name, index) =>
    ({name, steps: [{name, index, part: 0}, {name, index, part: 1}]}))
  const final = {name: 'validate'}
  await runReferenceFamilies(families, final, async step => {
    if (step === final) {
      assert.equal(active.size, 0)
      for (const family of families) assert.ok(events.includes(family.name + ':1'))
    } else {
      if (step.part === 0) {
        active.add(step.name); maximum = Math.max(maximum, active.size)
        if (step.index < 2) {gates[step.index].resolve(); await gates[1 - step.index].promise}
      } else {
        assert.ok(events.includes(step.name + ':0'))
        active.delete(step.name)
      }
    }
    events.push(step.name + ':' + (step.part ?? 'final'))
  })
  assert.equal(maximum, 2)
  assert.equal(events.at(-1), 'validate:final')
})

test('failed captures stop successors and wait for their active sibling without validation', async t => {
  const cwd = await directory(t)
  const write = name => command("import fs from 'node:fs'; fs.writeFileSync(process.argv[1], 'done')", name)
  const families = [
    {name: 'failed', steps: [command('process.exit(17)'), write('failed-successor')]},
    {name: 'sibling', steps: [command("import fs from 'node:fs'; setTimeout(() => fs.writeFileSync('sibling', 'done'), 100)"), write('sibling-verified')]},
    {name: 'unstarted', steps: [write('unstarted')]},
  ]
  await assert.rejects(runReferenceFamilies(families, write('validation'), step => runReferenceStep(step, {cwd})),
    error => error instanceof AggregateError && /17/.test(error.errors[0].message))
  for (const name of ['sibling', 'sibling-verified']) assert.equal(await readFile(cwd + '/' + name, 'utf8'), 'done')
  for (const name of ['failed-successor', 'unstarted', 'validation']) await assert.rejects(access(cwd + '/' + name), {code: 'ENOENT'})
})

test('timed-out captures close their child and cannot cross the validation barrier', async t => {
  const cwd = await directory(t)
  const families = [{name: 'timeout', steps: [command('setInterval(() => {}, 1000)')]},
    {name: 'sibling', steps: [command("import fs from 'node:fs'; fs.writeFileSync('sibling', 'done')")]}]
  let final = false
  await assert.rejects(runReferenceFamilies(families, {final: true}, step => {
    if (step.final) {final = true; return}
    return runReferenceStep(step, {cwd, timeout: step === families[0].steps[0] ? 100 : 5000})
  }), error => error instanceof AggregateError && /SIGKILL/.test(error.errors[0].message))
  assert.equal(final, false)
  assert.equal(await readFile(cwd + '/sibling', 'utf8'), 'done')
})

test('capture execution preserves file streams, environment and spawn failures', async t => {
  const cwd = await directory(t)
  await writeFile(cwd + '/input', 'reference bytes')
  const step = {...command("import fs from 'node:fs'; process.stdout.write(fs.readFileSync(0,'utf8') + ':' + process.env.REFERENCE_CONTROL + ':' + process.env.PYTHONDONTWRITEBYTECODE)"),
    stdin: 'input', stdout: 'output', env: {REFERENCE_CONTROL: 'owned'}}
  const result = await runReferenceStep(step, {cwd})
  assert.equal(result.status, 0)
  assert.equal(await readFile(cwd + '/output', 'utf8'), 'reference bytes:owned:1')
  await assert.rejects(runReferenceStep({command: cwd + '/absent', args: [], stdout: 'absent-output'}, {cwd}), {code: 'ENOENT'})
})

test('validation failure propagates after every family completes', async () => {
  const finished = [], final = {}
  await assert.rejects(runReferenceFamilies([{name: 'complete', steps: ['capture', 'verify']}], final, async step => {
    if (step === final) throw new Error('validation rejected')
    finished.push(step)
  }), /validation rejected/)
  assert.deepEqual(finished, ['capture', 'verify'])
})

test('a failed reference rerun cannot retain an earlier success receipt', async t => {
  const group = 'failed-capture-' + process.pid
  const path = new URL('../../artifacts/reports/reference-checks-' + group + '.json', import.meta.url)
  await mkdir(new URL('../../artifacts/reports/', import.meta.url), {recursive: true})
  await writeFile(path, JSON.stringify({group, passed: 1}))
  referenceGroups[group] = [command('process.exit(19)')]
  t.after(async () => {delete referenceGroups[group]; await rm(path, {force: true})})
  await assert.rejects(runReferenceGroup(group), /Reference command failed \(19\)/)
  await assert.rejects(access(path), {code: 'ENOENT'})
})
