import assert from 'node:assert/strict'
import {access, mkdir, readFile, stat, writeFile} from 'node:fs/promises'
import {constants} from 'node:fs'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {homedir} from 'node:os'

export const runtimeImage = 'mcr.microsoft.com/playwright:v1.64.1-noble@sha256:ee15712262f017b8157421b212b12099146645f44b1bc5c0514cbbe6a229b1d0'
export const executablePaths = Object.freeze({
  chromium: '/ms-playwright/chromium-1248/chrome-linux64/chrome',
  'chromium-headless-shell': '/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
  firefox: '/ms-playwright/firefox-1555/firefox/firefox',
  webkit: '/ms-playwright/webkit-2370/pw_run.sh',
  ffmpeg: '/ms-playwright/ffmpeg-1013/ffmpeg-linux',
})
const revisions = Object.freeze({chromium: '1248', 'chromium-headless-shell': '1248', firefox: '1555', webkit: '2370', ffmpeg: '1013'})

export async function lockedBrowserDefinitions() {
  const require = createRequire(import.meta.url)
  return JSON.parse(await readFile(new URL('browsers.json', pathToFileURL(require.resolve('playwright-core/package.json'))), 'utf8'))
}

export function assertBrowserRuntime({lock, driverVersion, coreVersion, image, definitions, paths,
  browsersPath, platform, arch, nodeVersion, uid, homeUID}) {
  assert.equal(platform, 'linux', 'Browser image requires Linux')
  assert.equal(arch, 'x64', 'Browser image digest selects linux/amd64')
  assert.equal(nodeVersion, '24.3.0', 'Browser jobs require their pinned Node runtime')
  assert.equal(uid, 1001, 'Browser jobs require the image pwuser identity')
  assert.equal(homeUID, uid, 'Browser home must be owned by the running user')
  assert.equal(browsersPath, '/ms-playwright', 'Browser image must use its provisioned binaries')
  for (const version of [lock.packages[''].devDependencies.playwright, lock.packages['node_modules/playwright'].version,
    lock.packages['node_modules/playwright-core'].version, driverVersion, coreVersion, image.driverVersion])
    assert.equal(version, '1.64.1', 'Browser image and locked Playwright versions must agree')
  assert.equal(image.dockerImageName, 'mcr.microsoft.com/playwright:v1.64.1-noble', 'Expected the official Noble image')
  for (const [name, revision] of Object.entries(revisions))
    assert.equal(definitions.browsers.find(row => row.name === name)?.revision, revision, 'Locked browser revision differs: ' + name)
  assert.deepEqual(paths, executablePaths, 'Playwright must resolve the provisioned executable paths')
}

async function main() {
  const require = createRequire(import.meta.url), {chromium, firefox, webkit} = require('playwright')
  const input = {
    lock: JSON.parse(await readFile('package-lock.json', 'utf8')),
    driverVersion: require('playwright/package.json').version,
    coreVersion: require('playwright-core/package.json').version,
    image: JSON.parse(await readFile('/ms-playwright/.docker-info', 'utf8')),
    definitions: await lockedBrowserDefinitions(),
    paths: {...executablePaths, chromium: chromium.executablePath(), firefox: firefox.executablePath(), webkit: webkit.executablePath()},
    browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH, platform: process.platform, arch: process.arch, nodeVersion: process.versions.node,
    uid: process.getuid(), homeUID: (await stat(homedir())).uid,
  }
  assertBrowserRuntime(input)
  for (const path of Object.values(input.paths)) await access(path, constants.X_OK)
  const engine = process.env.BIJUX_TEST_ENGINE
  assert.ok(['chromium', 'firefox', 'webkit'].includes(engine), 'Expected one selected browser engine')
  const browser = await {chromium, firefox, webkit}[engine].launch({headless: true})
  let browserVersion
  try {
    browserVersion = browser.version()
    assert.ok(browserVersion, 'Provisioned browser must report its binary version')
    const page = await browser.newPage()
    assert.equal(await page.evaluate(() => 21 * 2), 42)
  } finally {await browser.close()}
  const receipt = {image: runtimeImage, node_version: input.nodeVersion, platform: input.platform, arch: input.arch,
    driver_version: input.driverVersion, docker: input.image, revisions, executable_paths: input.paths,
    engine, browser_version: browserVersion, uid: input.uid, home_uid: input.homeUID}
  await mkdir('artifacts/reports', {recursive: true})
  await writeFile('artifacts/reports/browser-runtime.json', JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify(receipt))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
