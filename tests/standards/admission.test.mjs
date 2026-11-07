import assert from 'node:assert/strict'
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const script = resolve(root, 'scripts/standards/check.sh')
const owner = resolve(root, 'artifacts/tests/standards-admission')
mkdirSync(owner, {recursive: true})
const sha = 'a'.repeat(40)
function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], {encoding: 'utf8', timeout: 10000})
  assert.equal(result.status, 0, result.stderr)
}
function fixture(t, pin = sha) {
  const directory = mkdtempSync(resolve(owner, 'checkout-'))
  t.after(() => rmSync(directory, {recursive: true, force: true}))
  git(directory, 'init', '--quiet')
  mkdirSync(resolve(directory, '.github/standards'), {recursive: true})
  writeFileSync(resolve(directory, '.github/standards/bijux-std.sha'), pin + '\n')
  git(directory, 'add', '.github/standards/bijux-std.sha')
  return directory
}
function denied(directory, message) {
  const result = spawnSync('bash', [script], {cwd: directory, encoding: 'utf8', timeout: 10000})
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, message)
}

test('malformed standards pin is refused before preparing source', t => {
  const directory = fixture(t, 'main')
  denied(directory, /full lowercase standards commit/)
  assert.equal(existsSync(resolve(directory, 'artifacts')), false)
})

test('foreign and dirty standards caches are refused before fetching or executing them', t => {
  for (const dirty of [false, true]) {
    const directory = fixture(t)
    const source = resolve(directory, 'artifacts/standards/accepted-source', sha)
    mkdirSync(source, {recursive: true})
    git(source, 'init', '--quiet')
    git(source, 'remote', 'add', 'origin', dirty ? 'https://github.com/bijux/bijux-std.git' : 'https://example.invalid/foreign.git')
    if (dirty) writeFileSync(resolve(source, 'untracked.txt'), 'preserve this input')
    denied(directory, dirty ? /modified or untracked/ : /official origin/)
    if (dirty) assert.equal(existsSync(resolve(source, 'untracked.txt')), true)
  }
})

test('aliased cache parents are refused before creating files outside artifacts', t => {
  const directory = fixture(t)
  const outside = mkdtempSync(resolve(owner, 'unrelated-'))
  t.after(() => rmSync(outside, {recursive: true, force: true}))
  symlinkSync(outside, resolve(directory, 'artifacts'))
  denied(directory, /path aliases/)
  assert.equal(existsSync(resolve(outside, 'standards')), false)
})
