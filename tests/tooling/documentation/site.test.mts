import assert from 'node:assert/strict'
import {test} from 'node:test'
import {renderDocument} from '../../../scripts/docs/site.mts'

test('renders existing Markdown links and anchored headings for local browsing', () => {
  const html = renderDocument('# Getting Started\n\n[Guide](guide.md#local-loop)\n', 'docs/index.md')
  assert.match(html, /id="getting-started"/)
  assert.match(html, /href="guide\.html#local-loop"/)
})

test('escapes raw HTML and rejects dangerous link protocols', () => {
  const html = renderDocument('<script>alert(1)</script>\n\n[bad](javascript:alert(1))', 'README.md')
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /href="javascript:/)
})

test('builds browsable repository documentation and referenced local data', async () => {
  const {execFileSync} = await import('node:child_process')
  const {readFile, access} = await import('node:fs/promises')
  const {fileURLToPath} = await import('node:url')
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/docs/build.mts'], {cwd: root})
  const output = new URL('../../../artifacts/documentation/site/', import.meta.url)
  const home = await readFile(new URL('index.html', output), 'utf8')
  assert.match(home, /href="docs\/development\/contributing\.html"/)
  const guide = await readFile(new URL('docs/development/contributing.html', output), 'utf8')
  assert.match(guide, /<h1[^>]*>Contributing/)
  await access(new URL('docs/compatibility/reference.json', output))
  assert.match(home, /href="examples\/submission\/editor\.mts"/)
  await access(new URL('examples/submission/editor.mts', output))
})


test('reports local image assets for the documentation builder', () => {
  const links: string[] = []
  renderDocument('![diagram](diagram.png)', 'docs/guide.md', href => links.push(href))
  assert.deepEqual(links, ['diagram.png'])
})
