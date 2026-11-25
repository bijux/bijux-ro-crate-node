import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { startLocalIdentityService } from '../src/identity/server.js';

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
    assert.equal((await context.request.get(`${origin}/session`)).status(), 401);
    await page.goto(`${origin}/auth/login`);
    await page.locator('#username').fill('researcher-a');
    await page.locator('#password').fill('local-a');
    await page.locator('#kc-login').click();
    await page.waitForURL(`${origin}/auth/callback*`);
    const before = await context.request.get(`${origin}/session`);
    assert.equal(before.status(), 200);
    const identity: unknown = await before.json();
    assert.ok(identity && typeof identity === 'object' && 'subject' in identity && 'issuer' in identity);
    assert.equal(identity.issuer, configuration.issuer);
    assert.equal(typeof identity.subject, 'string');
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(`${origin}/auth/login`);
    await otherPage.locator('#username').fill('researcher-b');
    await otherPage.locator('#password').fill('local-b');
    await otherPage.locator('#kc-login').click();
    await otherPage.waitForURL(`${origin}/auth/callback*`);
    const otherIdentity: { subject: string } = await (await other.request.get(`${origin}/session`)).json();
    assert.notEqual(identity.subject, otherIdentity.subject);
    await service.close();
    service = await startLocalIdentityService(configuration);
    assert.equal((await context.request.get(`${origin}/session`)).status(), 200);
    assert.equal((await context.request.post(`${origin}/auth/logout`, { headers: { origin: 'http://evil.example' } })).status(), 403);
    assert.equal((await context.request.post(`${origin}/auth/logout`, { headers: { origin } })).status(), 204);
    assert.equal((await context.request.get(`${origin}/session`)).status(), 401);
    assert.equal((await other.request.get(`${origin}/session`)).status(), 200);
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
