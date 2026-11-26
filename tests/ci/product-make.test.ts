import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {copyFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'

test('product Make targets work without the shared framework and propagate failures', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const parent = join(root, 'artifacts', 'work')
  await mkdir(parent, {recursive: true})
  const fixture = await mkdtemp(join(parent, 'product-make-'))
  try {
    await mkdir(join(fixture, 'makes'))
    await mkdir(join(fixture, 'bin'))
    await copyFile(join(root, 'Makefile'), join(fixture, 'Makefile'))
    await copyFile(join(root, 'makes', 'product.mk'), join(fixture, 'makes', 'product.mk'))
    await writeFile(join(fixture, 'bin', 'npm'), '#!/bin/sh\n[ "$2" != "check:types" ]\n', {mode: 0o755})
    await writeFile(join(fixture, 'bin', 'node'), '#!/bin/sh\nexit 0\n', {mode: 0o755})
    const env = {...process.env, PATH: `${join(fixture, 'bin')}:${process.env.PATH ?? ''}`}
    const build = spawnSync('make', ['product-build'], {cwd: fixture, env, encoding: 'utf8'})
    assert.equal(build.status, 0, build.stderr)
    const types = spawnSync('make', ['product-types'], {cwd: fixture, env, encoding: 'utf8'})
    assert.notEqual(types.status, 0, 'a failed typecheck must fail Make')
    const browser = spawnSync('make', ['app-test-browser'], {cwd: fixture, env, encoding: 'utf8'})
    assert.equal(browser.status, 0, browser.stderr)
    assert.match(browser.stdout, /test:e2e --workspace @bijux\/ro-crate-web/)
    assert.match(browser.stdout, /artifacts\/playwright/)
    const browserInstall = spawnSync('make', ['app-browser-install'], {cwd: fixture, env, encoding: 'utf8'})
    assert.equal(browserInstall.status, 0, browserInstall.stderr)
    assert.match(browserInstall.stdout, /playwright install chromium/)
    const config = spawnSync('make', ['app-dev-config-check'], {cwd: fixture, env, encoding: 'utf8'})
    assert.equal(config.status, 0, config.stderr)
    assert.match(config.stdout, /config-check\.mts --development/)
    const mixed = spawnSync('make', ['product-build', 'bijux-standard-check'], {cwd: fixture, env, encoding: 'utf8'})
    assert.notEqual(mixed.status, 0, 'standards goals must still require their framework')
  } finally {
    await rm(fixture, {recursive: true, force: true})
  }
})
