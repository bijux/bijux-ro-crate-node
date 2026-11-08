import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {root} from '../host.mjs'

/** Bind the Session's external core import before the browser loads any module. */
export async function bindSessionCore(page, origin, corePath) {
  assert.ok(corePath.startsWith('/'), 'The selected core needs an absolute server path')
  const html = await readFile(root + '/examples/submission/index.html', 'utf8')
  const marker = /<script type="importmap">([^<]+)<\/script>/g
  const maps = [...html.matchAll(marker)]
  assert.equal(maps.length, 1, 'Expected one owned example import map')
  const mapping = JSON.parse(maps[0][1])
  assert.ok(mapping.imports['@bijux/ro-crate-core'])
  mapping.imports['@bijux/ro-crate-core'] = corePath
  const body = html.replace(marker, '<script type="importmap">' + JSON.stringify(mapping) + '</script>')
  await page.route(origin + '/examples/submission/index.html', route => route.fulfill({contentType: 'text/html', body}))
}
