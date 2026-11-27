import type {ChildProcess} from 'node:child_process'
import {startOwnedServerProcess} from './owned-server.js'
import assert from 'node:assert/strict'
import type {BrowserContext, Page} from 'playwright'

export const base = 'http://127.0.0.1:14321'
export async function signIn(page:Page, context:BrowserContext, username = 'researcher-a', password = 'local-a') {
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
export async function waitForCurrentRecovery(page:Page) {
  await page.locator('.local-status').getByText(/Recovery copy saved in this browser|Changes will be saved as a separate recovery copy/).waitFor()
}
export async function saveNewDraft(page: Page): Promise<string> {
  const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/local/drafts') && response.request().method() === 'POST')
  await page.getByRole('button', {name:'Save local draft', exact:true}).click()
  const response = await saveResponse
  assert.equal(response.status(), 201)
  const {draftId} = await response.json() as {draftId:string}
  assert.ok(draftId)
  await page.getByText('Local draft saved.', {exact:false}).waitFor()
  await page.locator('#account-draft').locator(`option[value="${draftId}"]`).waitFor({state:'attached'})
  return draftId
}
export async function startServer(enabled = true, port = 14321): Promise<ChildProcess> {
  const {child} = await startOwnedServerProcess({port, env:{...process.env, HOST:'127.0.0.1', PORT:String(port), BIJUX_LOCAL_REFERENCE:enabled ? '1' : '0'}})
  return child
}
