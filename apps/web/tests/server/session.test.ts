import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { startLocalIdentityService } from './support/harness.js';

const origin = 'http://127.0.0.1:14321';
const configuration = {
  origin,
  issuer: 'http://127.0.0.1:18080/realms/authoring',
  clientId: 'local-authoring',
  databaseUrl: 'postgresql://authoring:local-reference-only@127.0.0.1:15433/authoring',
};

test('local sessions survive service restart and enforce logout origin', async () => {
  let service = await startLocalIdentityService(configuration);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    assert.equal((await context.request.get(`${origin}/api/local/session`)).status(), 401);
    assert.equal((await context.request.get(`${origin}/api/local/drafts`)).status(), 404);
    await page.goto(`${origin}/api/local/auth/login`);
    await page.locator('#username').fill('researcher-a');
    await page.locator('#password').fill('local-a');
    await page.locator('#kc-login').click();
    await page.waitForURL(`${origin}/api/local/auth/callback*`);
    const before = await context.request.get(`${origin}/api/local/session`);
    assert.equal(before.status(), 200);
    const identity: unknown = await before.json();
    assert.ok(identity && typeof identity === 'object' && 'subject' in identity && 'issuer' in identity);
    assert.equal(identity.issuer, configuration.issuer);
    assert.equal(typeof identity.subject, 'string');
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(`${origin}/api/local/auth/login`);
    await otherPage.locator('#username').fill('researcher-b');
    await otherPage.locator('#password').fill('local-b');
    await otherPage.locator('#kc-login').click();
    await otherPage.waitForURL(`${origin}/api/local/auth/callback*`);
    const otherIdentity: { subject: string } = await (await other.request.get(`${origin}/api/local/session`)).json();
    assert.notEqual(identity.subject, otherIdentity.subject);
    await service.close();
    service = await startLocalIdentityService(configuration);
    assert.equal((await context.request.get(`${origin}/api/local/session`)).status(), 200);
    assert.equal((await context.request.post(`${origin}/api/local/auth/logout`, { headers: { origin: 'http://evil.example' } })).status(), 403);
    assert.ok('session' in identity && typeof identity.session === 'string');
    assert.equal((await context.request.post(`${origin}/api/local/auth/logout`, { headers: { origin, 'x-bijux-session':identity.session } })).status(), 204);
    assert.equal((await context.request.get(`${origin}/api/local/session`)).status(), 401);
    assert.equal((await other.request.get(`${origin}/api/local/session`)).status(), 200);
    await other.close();
  } finally {
    await browser.close();
    await service.close();
  }
});

test('local identity refuses non-loopback database and issuer configuration', async () => {
  await assert.rejects(startLocalIdentityService({ ...configuration, databaseUrl: 'postgresql://user:password@remote.example/authoring' }), /loopback/);
  await assert.rejects(startLocalIdentityService({ ...configuration, issuer: 'https://identity.example/realm' }), /loopback/);
});

test('a delayed logout response cannot erase a newer local sign-in', {timeout:45_000}, async () => {
  const service = await startLocalIdentityService({...configuration, enableDrafts:true});
  const browser = await chromium.launch({headless:true});
  let release!:() => void;
  const held = new Promise<void>(resolve => {release = resolve});
  let reached!:() => void, fail!:(reason:unknown) => void;
  const revoked = new Promise<void>((resolve,reject) => {reached = resolve; fail = reject});
  try {
    const context = await browser.newContext();
    const first = await context.newPage();
    const signIn = async (page:typeof first, username:string, password:string) => {
      await page.goto(`${origin}/api/local/auth/login`);
      const restart = page.getByText('Restart login', {exact:true});
      if (await restart.isVisible()) await restart.click();
      if (await page.locator('#username').isVisible()) await page.locator('#username').fill(username);
      await page.locator('#password').fill(password);
      await page.locator('#kc-login').click();
      await page.waitForURL(`${origin}/api/local/auth/callback*`);
    };
    await signIn(first, 'researcher-a', 'local-a');
    const firstIdentity = await (await context.request.get(`${origin}/api/local/session`)).json() as {subject:string; session:string};
    assert.match(firstIdentity.session, /^[0-9a-f]{64}$/);
    assert.equal((await fetch(`${origin}/api/local/session`, {headers:{'x-bijux-session':firstIdentity.session}})).status, 401);
    assert.equal((await fetch(`${origin}/api/local/auth/logout`, {method:'POST',headers:{origin,'x-bijux-session':firstIdentity.session}})).status, 409);
    const previous = (await context.cookies(origin)).find(item => item.name === 'draft_session');
    assert.ok(previous);
    await first.route('**/api/local/auth/logout', async route => {
      try {
        const response = await route.fetch();
        assert.equal(response.status(), 204);
        reached();
        await held;
        await route.fulfill({response});
      } catch (error) {fail(error); throw error;}
    });
    await first.evaluate(session => {void fetch('/api/local/auth/logout', {method:'POST', headers:{'x-bijux-session':session}});}, firstIdentity.session);
    await revoked;
    const staleCookie = `draft_session=${previous.value}`;
    assert.equal((await fetch(`${origin}/api/local/session`, {headers:{cookie:staleCookie, host:'127.0.0.1:14321'}})).status, 401);
    assert.equal((await fetch(`${origin}/api/local/drafts`, {headers:{cookie:staleCookie, host:'127.0.0.1:14321'}})).status, 401);
    const other = await browser.newContext();
    const second = await other.newPage();
    await signIn(second, 'researcher-b', 'local-b');
    const newer = (await other.cookies(origin)).find(item => item.name === 'draft_session');
    assert.ok(newer);
    await context.addCookies([newer]);
    const identity = await (await context.request.get(`${origin}/api/local/session`)).json() as {subject:string; session:string};
    assert.notEqual(identity.subject, firstIdentity.subject);
    assert.notEqual((await context.cookies(origin)).find(item => item.name === 'draft_session')?.value, previous.value);
    const finished = first.waitForResponse(response => response.url() === `${origin}/api/local/auth/logout`);
    release();
    await finished;
    const current = await context.request.get(`${origin}/api/local/session`);
    assert.equal(current.status(), 200);
    assert.equal((await current.json() as {subject:string}).subject, identity.subject);
    assert.equal((await context.request.post(`${origin}/api/local/auth/logout`, {headers:{origin:'http://evil.example','x-bijux-session':identity.session}})).status(), 403);
    assert.equal((await context.request.get(`${origin}/api/local/session`)).status(), 200);
    assert.equal((await context.request.post(`${origin}/api/local/auth/logout`, {headers:{origin,'x-bijux-session':firstIdentity.session}})).status(), 409);
    assert.equal((await context.request.get(`${origin}/api/local/session`)).status(), 200);
    assert.equal((await context.request.post(`${origin}/api/local/auth/logout`, {headers:{origin}})).status(), 409);
    assert.equal((await context.request.post(`${origin}/api/local/auth/logout`, {headers:{origin,'x-bijux-session':identity.session}})).status(), 204);
    assert.equal((await context.cookies(origin)).find(item => item.name === 'draft_session')?.value, newer.value);
    assert.equal((await context.request.get(`${origin}/api/local/session`)).status(), 401);
    await signIn(first, 'researcher-a', 'local-a');
    const relogged = await context.request.get(`${origin}/api/local/session`);
    assert.equal(relogged.status(), 200);
    const firstAgain = await relogged.json() as {subject:string; session:string};
    assert.equal(firstAgain.subject, firstIdentity.subject);
    assert.notEqual(firstAgain.session, firstIdentity.session);
    assert.equal((await context.request.post(`${origin}/api/local/auth/logout`, {headers:{origin,'x-bijux-session':firstIdentity.session}})).status(), 409);
    assert.equal((await context.request.get(`${origin}/api/local/session`)).status(), 200);
    await other.close();
    await context.close();
  } finally {release(); await browser.close(); await service.close();}
});
