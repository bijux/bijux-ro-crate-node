import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdir, mkdtemp, readFile, rm, access} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {runProcessGroups} from '../../scripts/ci/process-groups.mjs'

async function directory(t) {
  const parent = fileURLToPath(new URL('../../artifacts/work/', import.meta.url))
  await mkdir(parent, {recursive: true})
  const path = await mkdtemp(parent + 'process-groups-')
  t.after(() => rm(path, {recursive: true, force: true}))
  return path
}
const command = (source, ...args) => ({command: process.execPath, args: ['--input-type=module', '--eval', source, ...args]})

test('independent groups overlap while each group preserves command order', async t => {
  const cwd = await directory(t)
  const ready = `import fs from 'node:fs'; const [own, other] = process.argv.slice(1);
    fs.writeFileSync(own, 'ready'); const poll = setInterval(() => {
      if (fs.existsSync(other)) {clearInterval(poll); process.exit(0)}
    }, 10)`
  await runProcessGroups([
    [command(ready, 'source', 'installed'), command("import fs from 'node:fs'; fs.copyFileSync('source', 'source-complete')")],
    [command(ready, 'installed', 'source'), command("import fs from 'node:fs'; fs.copyFileSync('installed', 'installed-complete')")],
  ], {cwd, timeout: 5000})
  assert.equal(await readFile(cwd + '/source-complete', 'utf8'), 'ready')
  assert.equal(await readFile(cwd + '/installed-complete', 'utf8'), 'ready')
})

test('a failed group stops its successors and waits for its independent sibling', async t => {
  const cwd = await directory(t)
  await assert.rejects(runProcessGroups([
    [command('process.exit(17)'), command("import fs from 'node:fs'; fs.writeFileSync('must-not-run', '')")],
    [command("import fs from 'node:fs'; setTimeout(() => fs.writeFileSync('finished', 'yes'), 50)")],
  ], {cwd}), error => error instanceof AggregateError && /exited 17/.test(error.errors[0].message))
  assert.equal(await readFile(cwd + '/finished', 'utf8'), 'yes')
  await assert.rejects(access(cwd + '/must-not-run'), {code: 'ENOENT'})
})
