import {execFileSync} from 'node:child_process'
import {copyFile, lstat, mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises'
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {renderDocument} from './site.mts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const output = resolve(root, 'artifacts/documentation/site')
await rm(output, {recursive: true, force: true})
const tracked = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean)
const paths = tracked.filter(path => /\.md$/i.test(path) && !path.startsWith('.bijux/') && !path.startsWith('.github/'))
const assets = new Set<string>()
for (const path of paths) {
  const target = resolve(output, path.replace(/\.md$/i, '.html'))
  await mkdir(dirname(target), {recursive: true})
  const source = resolve(root, path)
  if (!(await lstat(source)).isFile()) throw new Error(`Documentation source is not a regular file: ${path}`)
  const resolved = relative(root, await realpath(source))
  if (resolved === '..' || resolved.startsWith('..' + sep)) throw new Error(`Documentation source escapes repository: ${path}`)
  const html = renderDocument(await readFile(source, 'utf8'), path, href => {
    let pathname: string
    try {pathname = decodeURIComponent(href.split(/[?#]/, 1)[0])} catch {return}
    if (!pathname || /\.md$/i.test(pathname) || isAbsolute(pathname)) return
    const asset = relative(root, resolve(root, dirname(path), pathname))
    if (asset === '..' || asset.startsWith('..' + sep)) return
    for (const trackedPath of tracked) if (trackedPath === asset || trackedPath.startsWith(asset.replace(/\/$/, '') + '/')) assets.add(trackedPath)
  })
  await writeFile(target, html)
}
for (const path of assets) {
  if (/\.md$/i.test(path)) continue
  const source = resolve(root, path)
  if (!(await lstat(source)).isFile()) continue
  const resolved = relative(root, await realpath(source))
  if (resolved === '..' || resolved.startsWith('..' + sep)) throw new Error(`Asset escapes repository: ${path}`)
  const target = resolve(output, path)
  await mkdir(dirname(target), {recursive: true})
  await copyFile(source, target)
}
await writeFile(resolve(output, 'index.html'), await readFile(resolve(output, 'README.html')))
const list = paths.map(path => {
  const label = path.replace(/[\\\[\]]/g, '\\$&')
  const href = path.split('/').map(encodeURIComponent).join('/').replace(/\.md$/i, '.html')
  return `- [${label}](${href})`
}).join('\n')
await writeFile(resolve(output, 'contents.html'), renderDocument(`# All guides\n\n${list}\n`, 'contents.md'))
console.log(`Built ${paths.length} Markdown pages in artifacts/documentation/site`)
