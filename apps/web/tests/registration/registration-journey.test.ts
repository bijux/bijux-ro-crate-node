import {spawn, type ChildProcess} from 'node:child_process'
import {once} from 'node:events'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {chromium, type BrowserContext, type Page} from 'playwright'

if (!/^bijuxregistration[0-9a-f]{16}$/.test(process.env.BIJUX_REGISTRATION_PROJECT ?? '')) throw Error('Run this test using the disposable local registration runner')
const base = 'http://127.0.0.1:14321'
async function startServer(): Promise<ChildProcess> {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {
    cwd:new URL('../..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'14321', BIJUX_LOCAL_REFERENCE:'1', NODE_ENV:'development'}, stdio:'ignore',
  })
  for (let attempt = 0;; attempt++) {
    try {if ((await fetch(base)).ok) return server} catch {}
    if (attempt === 100 || server.exitCode !== null) {server.kill(); throw Error('Astro server did not start')}
    await new Promise(resolve => setTimeout(resolve,100))
  }
}
async function signIn(page:Page, context:BrowserContext, username = 'researcher-a', password = 'local-a') {
  const popup = context.waitForEvent('page')
  await page.getByRole('button', {name:'Sign in locally'}).click()
  const login = await popup
  try {
    await login.locator('#username').fill(username, {timeout:5000})
    await login.locator('#password').fill(password)
    await login.locator('#kc-login').click()
  } catch (error) {if (!login.isClosed()) throw error}
  await page.getByText(/Signed in to the local reference|A previous save is waiting/).waitFor()
}
async function saveNewDraft(page:Page): Promise<string> {
  const saved = page.waitForResponse(response => response.url().endsWith('/api/local/drafts') && response.request().method() === 'POST')
  await page.getByRole('button', {name:'Save local draft', exact:true}).click()
  const response = await saved
  assert.equal(response.status(), 201)
  const {draftId} = await response.json() as {draftId:string}
  assert.ok(draftId)
  await page.getByText('Local draft saved.', {exact:false}).waitFor()
  await page.locator('#account-draft').locator(`option[value="${draftId}"]`).waitFor({state:'attached'})
  return draftId
}

test('a registered local account saves, reopens and updates a private draft', async () => {
  const server = await startServer()
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${base}/#account`)
    const popup = context.waitForEvent('page')
    await page.getByRole('button', {name:'Sign in locally'}).click()
    const login = await popup
    await login.getByRole('link', {name:'Register'}).click()
    const username = `local-${crypto.randomUUID()}`
    await login.locator('#firstName').fill('Local')
    await login.locator('#lastName').fill('Researcher')
    await login.locator('#email').fill(`${username}@example.invalid`)
    await login.locator('#username').fill(username)
    await login.locator('#password').fill('local-password-123')
    await login.locator('#password-confirm').fill('local-password-123')
    await login.getByRole('button', {name:'Register'}).click()
    await page.getByText('Signed in to the local reference.', {exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name:'Study details'}).click()
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Private local study')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name:'Local account'}).click()
    const draftId = await saveNewDraft(page)
    await context.close()
    const returningContext = await browser.newContext()
    const returning = await returningContext.newPage()
    await returning.addInitScript(() => {
      const observed:{requests:Array<{session:string; revision:number; id:number}>; responses:Array<{session:string; revision:number; id:number}>} = {requests:[], responses:[]}
      ;(window as unknown as {validationWorkerTraffic:typeof observed}).validationWorkerTraffic = observed
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        constructor(url:string | URL, options?:WorkerOptions) {
          super(url, options)
          this.addEventListener('message', event => observed.responses.push(structuredClone(event.data)))
        }
        override postMessage(message:unknown, transferOrOptions?:Transferable[] | StructuredSerializeOptions):void {
          observed.requests.push(structuredClone(message) as typeof observed.requests[number])
          if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions)
          else super.postMessage(message, transferOrOptions)
        }
      }
    })
    returning.on('dialog', dialog => void dialog.accept())
    await returning.goto(`${base}/#account`)
    await signIn(returning, returningContext, username, 'local-password-123')
    await returning.locator('#account-draft').selectOption(draftId)
    await returning.getByRole('button', {name:'Open saved local draft'}).click()
    await returning.getByText('Local draft opened.', {exact:false}).waitFor()
    const navigation = returning.locator('aside[aria-label="Study navigation"]')
    await navigation.getByRole('link', {name:'Study details'}).click()
    assert.equal(await returning.getByLabel('Study title').inputValue(), 'Private local study')
    const live = returning.getByRole('region', {name:'Live validation'})
    await live.getByText(/Validation: invalid/).waitFor()
    assert.ok(await live.locator('li').count() > 0)
    const previousRequests = await returning.evaluate(() => (window as unknown as {validationWorkerTraffic:{requests:unknown[]}}).validationWorkerTraffic.requests.length)
    await live.getByRole('status').evaluate(status => {
      const history:string[] = []
      ;(window as unknown as {validationStateHistory:string[]}).validationStateHistory = history
      new MutationObserver(() => {history.push(status.textContent ?? '')}).observe(status, {subtree:true, childList:true, characterData:true})
    })
    await returning.getByLabel('Study title').fill('Updated local study')
    await returning.waitForFunction(previous => {
      const state = window as unknown as {validationStateHistory:string[]; validationWorkerTraffic:{requests:Array<{session:string; revision:number; id:number}>; responses:Array<{session:string; revision:number; id:number}>}}
      const changes = state.validationStateHistory
      const transient = changes.findIndex(value => /Validation: (editing|validating)/.test(value))
      const request = state.validationWorkerTraffic.requests.slice(previous).at(-1)
      return transient >= 0 && changes.slice(transient + 1).some(value => /Validation: invalid/.test(value)) && request !== undefined &&
        state.validationWorkerTraffic.responses.some(response => response.session === request.session && response.revision === request.revision && response.id === request.id)
    }, previousRequests)
    await live.getByText(/Validation: invalid/).waitFor()
    assert.ok(await live.locator('li').count() > 0)
    await navigation.getByRole('link', {name:'Validate crate'}).click()
    await returning.getByText(/Validation: invalid/).waitFor()
    await navigation.getByRole('link', {name:'Local account'}).click()
    await returning.getByRole('button', {name:'Save local draft'}).click()
    await returning.getByText('Local draft saved.', {exact:false}).waitFor()
    await returning.reload()
    await returning.getByText('Signed in to the local reference.', {exact:false}).waitFor()
    await returning.locator('#account-draft').selectOption(draftId)
    await returning.getByRole('button', {name:'Open saved local draft'}).click()
    await returning.getByText('Local draft opened.', {exact:false}).waitFor()
    await returning.locator('aside[aria-label="Study navigation"]').getByRole('link', {name:'Study details'}).click()
    assert.equal(await returning.getByLabel('Study title').inputValue(), 'Updated local study')
    await returningContext.close()
    const otherContext = await browser.newContext()
    const other = await otherContext.newPage()
    await other.goto(`${base}/#account`)
    await signIn(other, otherContext)
    assert.equal((await other.request.get(`${base}/api/local/drafts/${draftId}`)).status(), 404)
    await otherContext.close()
  } finally {
    await browser?.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})
