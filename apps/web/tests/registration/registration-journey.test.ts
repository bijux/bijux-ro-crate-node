import type {ChildProcess} from 'node:child_process'
import {referenceEnvironment, startOwnedServer} from './isolation.js'
import {once} from 'node:events'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {chromium, type BrowserContext, type Page} from 'playwright'
import pg from 'pg'

if (!/^bijuxregistration[0-9a-f]{16}$/.test(process.env.BIJUX_REGISTRATION_PROJECT ?? '')) throw Error('Run this test using the disposable local registration runner')
const base = 'http://127.0.0.1:14321'
async function startServer(): Promise<ChildProcess> {
  return startOwnedServer(referenceEnvironment(process.env))
}
async function signIn(page:Page, context:BrowserContext, username = 'researcher-a', password = 'local-a') {
  const popup = context.waitForEvent('page')
  await page.getByRole('button', {name:'Sign in locally'}).click()
  const login = await popup
  try {
    await login.locator('#username, #kc-attempted-username').first().waitFor({timeout:5000})
    if (await login.getByRole('button', {name:'Restart login'}).count()) await login.getByRole('button', {name:'Restart login'}).click()
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

test('local sign-out requires reauthentication and permits switching accounts without replacing current work', async () => {
  const server = await startServer()
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(7000)
    await page.goto(`${base}/#account`)
    await signIn(page, context)
    const original = await (await context.request.get(`${base}/api/local/session`)).json() as {subject:string}
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name:'Study details'}).click()
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Work retained through account switch')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name:'Local account'}).click()
    const draftId = await saveNewDraft(page)
    await page.getByRole('button', {name:'Sign out locally'}).click()
    await page.getByText('Signed out locally.', {exact:false}).waitFor()
    assert.equal((await context.request.get(`${base}/api/local/session`)).status(), 401)
    let popupEvent = context.waitForEvent('page')
    await page.getByRole('button', {name:'Sign in locally'}).click()
    const failed = await popupEvent
    await failed.getByRole('button', {name:'Restart login'}).click()
    await failed.locator('#username').fill('researcher-b')
    await failed.locator('#password').fill('wrong-password')
    await failed.locator('#kc-login').click()
    await failed.getByText('Invalid username or password.').waitFor()
    assert.equal((await context.request.get(`${base}/api/local/session`)).status(), 401)
    await failed.close()
    await page.getByRole('button', {name:'Sign in locally'}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Work retained through account switch')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name:'Local account'}).click()
    popupEvent = context.waitForEvent('page')
    await page.getByRole('button', {name:'Sign in locally'}).click()
    const switched = await popupEvent
    await switched.locator('#username, #kc-attempted-username').first().waitFor()
    if (await switched.getByRole('button', {name:'Restart login'}).count()) await switched.getByRole('button', {name:'Restart login'}).click()
    await switched.locator('#username').fill('researcher-b')
    await switched.locator('#password').fill('local-b')
    await switched.locator('#kc-login').click()
    await page.getByText('Signed in to the local reference.', {exact:false}).waitFor()
    const current = await (await context.request.get(`${base}/api/local/session`)).json() as {subject:string}
    assert.notEqual(current.subject, original.subject)
    assert.equal((await context.request.get(`${base}/api/local/drafts/${draftId}`)).status(), 404)
    assert.equal((await context.request.post(`${base}/api/local/auth/logout`, {headers:{origin:'http://evil.example'}})).status(), 403)
    assert.equal((await context.request.get(`${base}/api/local/session`)).status(), 200)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Work retained through account switch')
    await context.close()
  } finally {
    await browser?.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('a different tab cannot complete or close an unrelated local login popup', async () => {
  const server = await startServer()
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext()
    const first = await context.newPage(), second = await context.newPage()
    await first.goto(`${base}/#account`)
    const popupEvent = context.waitForEvent('page')
    await first.getByRole('button', {name:'Sign in locally'}).click()
    const popup = await popupEvent
    await popup.locator('#username').waitFor()
    await second.goto(`${base}/api/local/auth/login`)
    await second.locator('#username').fill('researcher-b')
    await second.locator('#password').fill('local-b')
    await second.locator('#kc-login').click()
    await second.waitForURL(`${base}/api/local/auth/callback*`)
    await first.waitForTimeout(1500)
    assert.equal(popup.isClosed(), false)
    assert.equal(await first.getByText('Signed in to the local reference.', {exact:false}).count(), 0)
    await popup.close()
    await first.getByText('Local sign-in was not completed.', {exact:false}).waitFor()
    assert.equal(await first.getByText('Signed in to the local reference.', {exact:false}).count(), 0)
    await context.close()
  } finally {
    await browser?.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('a changed shared session cannot replace the identity that completed this popup', async () => {
  const server = await startServer()
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const otherContext = await browser.newContext(), other = await otherContext.newPage()
    await other.goto(`${base}/api/local/auth/login`)
    await other.locator('#username').fill('researcher-b')
    await other.locator('#password').fill('local-b')
    await other.locator('#kc-login').click()
    await other.waitForURL(`${base}/api/local/auth/callback*`)
    const otherCookie = (await otherContext.cookies(base)).find(cookie => cookie.name === 'draft_session')
    assert.ok(otherCookie)
    const context = await browser.newContext(), page = await context.newPage()
    await page.goto(`${base}/#account`)
    await page.getByRole('button', {name:'Sign in locally'}).waitFor()
    let release!:() => void, reached!:() => void
    const held = new Promise<void>(resolve => {release = resolve})
    const intercepted = new Promise<void>(resolve => {reached = resolve})
    await page.route('**/api/local/session', async route => {reached(); await held; await route.continue()}, {times:1})
    const popupEvent = context.waitForEvent('page')
    await page.getByRole('button', {name:'Sign in locally'}).click()
    const popup = await popupEvent
    await popup.locator('#username').fill('researcher-a')
    await popup.locator('#password').fill('local-a')
    await popup.locator('#kc-login').click()
    await intercepted
    await context.addCookies([otherCookie])
    release()
    await page.getByText('The local account changed during sign-in.', {exact:false}).waitFor()
    assert.equal(await page.getByText('Signed in to the local reference.', {exact:false}).count(), 0)
    await context.close(); await otherContext.close()
  } finally {
    await browser?.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('a denied or replayed local login callback never authenticates a session', async () => {
  const server = await startServer()
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext()
    const login = await context.request.get(`${base}/api/local/auth/login`, {maxRedirects:0})
    assert.equal(login.status(), 302)
    const state = new URL(login.headers().location).searchParams.get('state')
    assert.ok(state)
    assert.equal((await context.request.get(`${base}/api/local/auth/callback?state=invalid&error=access_denied`)).status(), 400)
    const callback = `${base}/api/local/auth/callback?state=${encodeURIComponent(state)}&error=access_denied`
    const other = await browser.newContext()
    assert.equal((await other.request.get(callback)).status(), 400)
    await other.close()
    assert.equal((await context.request.get(callback)).status(), 200)
    assert.equal((await context.request.get(callback)).status(), 400)
    assert.equal((await context.request.get(`${base}/api/local/session`)).status(), 401)
    await context.close()
  } finally {
    await browser?.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('an unfinished local sign-in expires and closes its popup', async () => {
  const server = await startServer()
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext(), page = await context.newPage()
    await page.goto(`${base}/#account`)
    await page.getByRole('button', {name:'Sign in locally'}).waitFor()
    await page.clock.install()
    const popupEvent = context.waitForEvent('page')
    await page.getByRole('button', {name:'Sign in locally'}).click()
    const popup = await popupEvent
    await popup.locator('#username').waitFor()
    const closed = popup.waitForEvent('close')
    await page.clock.fastForward(300_001)
    await closed
    await page.getByText('Local sign-in expired.', {exact:false}).waitFor()
    assert.equal((await context.request.get(`${base}/api/local/session`)).status(), 401)
    await context.close()
  } finally {
    await browser?.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('two concurrent local sign-ins keep their own callback state', async () => {
  const server = await startServer()
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext(), first = await context.newPage(), second = await context.newPage()
    await first.goto(`${base}/#account`); await second.goto(`${base}/#account`)
    const firstPopupEvent = context.waitForEvent('page')
    await first.getByRole('button', {name:'Sign in locally'}).click()
    const firstPopup = await firstPopupEvent
    await firstPopup.locator('#username').waitFor()
    const secondPopupEvent = context.waitForEvent('page')
    await second.getByRole('button', {name:'Sign in locally'}).click()
    const secondPopup = await secondPopupEvent
    await secondPopup.locator('#username').waitFor()
    await firstPopup.locator('#username').fill('researcher-a')
    await firstPopup.locator('#password').fill('local-a')
    await firstPopup.locator('#kc-login').click()
    await first.getByText('Signed in to the local reference.', {exact:false}).waitFor()
    const firstIdentity = await (await context.request.get(`${base}/api/local/session`)).json() as {subject:string}
    assert.equal(secondPopup.isClosed(), false)
    await secondPopup.locator('#username').fill('researcher-a')
    await secondPopup.locator('#password').fill('local-a')
    await secondPopup.locator('#kc-login').click()
    await second.getByText('Signed in to the local reference.', {exact:false}).waitFor({timeout:10000})
    const secondIdentity = await (await context.request.get(`${base}/api/local/session`)).json() as {subject:string}
    assert.equal(firstIdentity.subject, secondIdentity.subject)
    assert.equal((await context.cookies(`${base}/api/local/auth/callback`)).filter(cookie => cookie.name.startsWith('login_state_')).length, 0)
    await context.close()
  } finally {
    await browser?.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('pending local sign-ins are bounded and released when denied', async () => {
  const server = await startServer()
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext()
    let firstState = ''
    for (let index = 0; index < 16; index++) {
      const response = await context.request.get(`${base}/api/local/auth/login`, {maxRedirects:0})
      assert.equal(response.status(), 302)
      if (!index) firstState = new URL(response.headers().location).searchParams.get('state') ?? ''
    }
    assert.ok(firstState)
    assert.equal((await context.request.get(`${base}/api/local/auth/login`, {maxRedirects:0})).status(), 503)
    const callback = `${base}/api/local/auth/callback?state=${encodeURIComponent(firstState)}&error=access_denied`
    assert.equal((await context.request.get(callback)).status(), 200)
    assert.equal((await context.request.get(callback)).status(), 400)
    assert.equal((await context.request.get(`${base}/api/local/auth/login`, {maxRedirects:0})).status(), 302)
    assert.equal((await context.request.get(`${base}/api/local/session`)).status(), 401)
    await context.close()
  } finally {
    await browser?.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})


test('session database failure clears consumed login state without authenticating', async () => {
  const server = await startServer()
  const database = new pg.Pool({connectionString:'postgresql://authoring:local-reference-only@127.0.0.1:15433/authoring'})
  let browser
  try {
    await database.query('ALTER TABLE draft_identity.sessions ADD CONSTRAINT reject_test_session CHECK (false) NOT VALID')
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext(), page = await context.newPage()
    await page.goto(`${base}/api/local/auth/login`)
    await page.locator('#username').fill('researcher-a')
    await page.locator('#password').fill('local-a')
    const stateCookies = (await context.cookies(`${base}/api/local/auth/callback`)).filter(cookie => cookie.name.startsWith('login_state_'))
    assert.equal(stateCookies.length, 1)
    const callback = page.waitForResponse(response => new URL(response.url()).pathname === '/api/local/auth/callback')
    await page.locator('#kc-login').click()
    const response = await callback
    assert.equal(response.status(), 500)
    assert.equal((await context.cookies(`${base}/api/local/auth/callback`)).filter(cookie => cookie.name.startsWith('login_state_')).length, 0)
    assert.equal((await context.request.get(response.url())).status(), 400)
    assert.equal((await context.request.get(`${base}/api/local/session`)).status(), 401)
    await context.close()
  } finally {
    await browser?.close()
    await database.query('ALTER TABLE draft_identity.sessions DROP CONSTRAINT IF EXISTS reject_test_session')
    await database.end()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})
