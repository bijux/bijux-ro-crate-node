import assert from 'node:assert/strict'
import test from 'node:test'
import type {TestContext} from 'node:test'
import {mkdir, mkdtemp, readFile, rm, access} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {runCommandGroups} from '../../../scripts/ci/command-groups.mts'

async function directory(t: TestContext) {
  const parent = fileURLToPath(new URL('../../../artifacts/work/', import.meta.url))
  await mkdir(parent, {recursive: true})
  const path = await mkdtemp(parent + 'command-groups-')
  t.after(() => rm(path, {recursive: true, force: true}))
  return path
}
const command = (source: string, ...args: string[]) => ({command: process.execPath, args: ['--input-type=module', '--eval', source, ...args]})

test('independent groups overlap while each group preserves command order', async t => {
  const cwd = await directory(t)
  const ready = `import fs from 'node:fs'; const [own, other] = process.argv.slice(1);
    fs.writeFileSync(own, 'ready'); const poll = setInterval(() => {
      if (fs.existsSync(other)) {clearInterval(poll); process.exit(0)}
    }, 10)`
  await runCommandGroups([
    [command(ready, 'source', 'installed'), command("import fs from 'node:fs'; fs.copyFileSync('source', 'source-complete')")],
    [command(ready, 'installed', 'source'), command("import fs from 'node:fs'; fs.copyFileSync('installed', 'installed-complete')")],
  ], {cwd, timeout: 5000})
  assert.equal(await readFile(cwd + '/source-complete', 'utf8'), 'ready')
  assert.equal(await readFile(cwd + '/installed-complete', 'utf8'), 'ready')
})

test('a failed group stops its successors and waits for its independent sibling', async t => {
  const cwd = await directory(t)
  await assert.rejects(runCommandGroups([
    [command('process.exit(17)'), command("import fs from 'node:fs'; fs.writeFileSync('must-not-run', '')")],
    [command("import fs from 'node:fs'; setTimeout(() => fs.writeFileSync('finished', 'yes'), 50)")],
  ], {cwd}), error => error instanceof AggregateError && /exited 17/.test((error.errors[0] as {message: string}).message))
  assert.equal(await readFile(cwd + '/finished', 'utf8'), 'yes')
  await assert.rejects(access(cwd + '/must-not-run'), {code: 'ENOENT'})
})

test('a timed out command can finish cleanup but still fails after exiting zero', {skip: process.platform === 'win32'}, async t => {
  const cwd = await directory(t)
  const child = command(`import fs from 'node:fs';
    process.on('SIGINT', () => setTimeout(() => { fs.writeFileSync('cleaned', 'yes'); process.exit(0) }, 100));
    fs.writeFileSync('ready', 'yes'); setInterval(() => {}, 1000)`)
  await assert.rejects(runCommandGroups([[child, command("throw Error('successor ran')")]], {cwd, timeout: 600}),
    error => error instanceof AggregateError && /timed out/.test(error.errors[0].message))
  assert.equal(await readFile(cwd + '/cleaned', 'utf8'), 'yes')
})

test('a command that ignores termination is killed within a bounded interval', {skip: process.platform === 'win32'}, async t => {
  const cwd = await directory(t)
  const started = Date.now()
  await assert.rejects(runCommandGroups([[command("process.on('SIGINT', () => {}); setInterval(() => {}, 1000)")]], {cwd, timeout: 600}),
    error => error instanceof AggregateError && /timed out.*cleanup unconfirmed/.test(error.errors[0].message))
  assert.ok(Date.now() - started < 5000)
})

test('Chromium launched by Playwright exits before a timed out command settles', {skip: process.platform === 'win32'}, async t => {
  const {chromium} = createRequire(import.meta.url)('playwright') as {chromium: {executablePath(): string}}
  try { await access(chromium.executablePath()) } catch { t.skip('Playwright Chromium is not installed'); return }
  const cwd = await directory(t)
  const browser = command(`import {chromium} from 'playwright'; import fs from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const marker = '--bijux-test-marker=' + process.cwd();
    await chromium.launch({headless: true, args: [marker]});
    const lines = execFileSync('ps', ['-ax', '-o', 'pid=', '-o', 'command='], {encoding: 'utf8'}).split('\\n');
    const entry = lines.find(line => line.includes(marker) && !line.includes('--type='));
    if (!entry) throw Error('browser process not found');
    const pid = Number(entry.trim().split(/\\s+/)[0]); process.kill(pid, 0);
    fs.writeFileSync('browser-pid', String(pid)); setInterval(() => {}, 1000)`)
  await assert.rejects(runCommandGroups([[browser]], {cwd, timeout: 4000}),
    error => error instanceof AggregateError && /timed out/.test(error.errors[0].message) && !/cleanup unconfirmed/.test(error.errors[0].message))
  const pid = Number(await readFile(cwd + '/browser-pid', 'utf8'))
  assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'})
})

test('a zero timeout leaves the command without a deadline', async () => {
  await runCommandGroups([[command('setTimeout(() => {}, 50)')]], {timeout: 0})
})
