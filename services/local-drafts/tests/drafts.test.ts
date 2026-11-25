import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { startLocalIdentityService } from '../src/identity/server.js';

const origin = 'http://127.0.0.1:14321';
const options = {
  origin,
  issuer: 'http://127.0.0.1:18080/realms/authoring',
  clientId: 'local-authoring',
  databaseUrl: 'postgresql://authoring:local-reference-only@127.0.0.1:15433/authoring',
  validateDraft(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || !('testContent' in value) || typeof value.testContent !== 'string') return undefined;
    return JSON.stringify(value);
  },
};
async function signIn(browser: Browser, username: string, password: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/auth/login`);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(`${origin}/auth/callback*`);
  return context;
}

test('authenticated local saves isolate owners and preserve conflicts across service restart', async () => {
  let service = await startLocalIdentityService(options);
  const browser = await chromium.launch({ headless: true });
  try {
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(`${origin}/drafts/00000000-0000-0000-0000-000000000000`)).status(), 401);
    await anonymous.close();
    const alice = await signIn(browser, 'researcher-a', 'local-a');
    const bob = await signIn(browser, 'researcher-b', 'local-b');
    const save = (context: BrowserContext, data: unknown) => context.request.post(`${origin}/drafts`, { headers: { origin }, data });
    const run = randomUUID();
    const firstRequest = { key: `${run}-initial`, payload: { testContent: 'original' } };
    const firstResponse = await save(alice, firstRequest);
    assert.equal(firstResponse.status(), 201);
    const first: { draftId: string; versionId: string; contentHash: string } = await firstResponse.json();
    assert.deepEqual(await (await save(alice, firstRequest)).json(), first);
    assert.equal((await save(alice, { ...firstRequest, payload: { testContent: 'different' } })).status(), 409);
    assert.equal((await bob.request.get(`${origin}/drafts/${first.draftId}`)).status(), 404);
    const nextRequest = { key: `${run}-next`, draftId: first.draftId, expectedHead: first.versionId, payload: { testContent: 'new' } };
    assert.equal((await save(bob, nextRequest)).status(), 404);
    const nextResponse = await save(alice, nextRequest);
    assert.equal(nextResponse.status(), 201);
    const next: { versionId: string } = await nextResponse.json();
    assert.equal((await save(alice, { ...nextRequest, key: `${run}-stale`, payload: { testContent: 'still local' } })).status(), 409);
    assert.equal((await alice.request.post(`${origin}/drafts`, { headers: { origin: 'http://other.invalid' }, data: firstRequest })).status(), 403);
    const databaseContainer = process.env.DRAFT_REFERENCE_DATABASE_CONTAINER;
    assert.equal(databaseContainer, 'bijuxauthoringaccounts-database-1');
    execFileSync(process.env.DOCKER ?? 'docker', ['restart', databaseContainer]);
    for (let attempt = 0; ; attempt++) {
      const response = await alice.request.get(`${origin}/drafts/${first.draftId}`);
      if (response.status() === 200) break;
      if (attempt === 30) throw new Error(`Database did not recover: ${response.status()}`);
      await delay(200);
    }
    await service.close();
    service = await startLocalIdentityService(options);
    const restored = await alice.request.get(`${origin}/drafts/${first.draftId}`);
    assert.equal(restored.status(), 200);
    const body: { versionId: string; payload: unknown } = await restored.json();
    assert.equal(body.versionId, next.versionId);
    assert.deepEqual(body.payload, { testContent: 'new' });
    const competing = await Promise.all(['left', 'right'].map(side => save(alice, {
      key: `${run}-${side}`, draftId: first.draftId, expectedHead: next.versionId, payload: { testContent: side },
    })));
    assert.deepEqual(competing.map(result => result.status()).sort(), [201, 409]);
    assert.equal((await save(alice, { key: `${run}-invalid`, payload: { unsupported: 'input' } })).status(), 400);
    assert.equal((await save(alice, { key: `${run}-large`, payload: { testContent: 'x'.repeat(1048577) } })).status(), 413);
    execFileSync(process.env.DOCKER ?? 'docker', ['restart', 'bijuxauthoringaccounts-identity-1']);
    for (let attempt = 0; ; attempt++) {
      const ready = await fetch(`${options.issuer}/.well-known/openid-configuration`).then(result => result.ok).catch(() => false);
      if (ready) break;
      if (attempt === 80) throw new Error('Identity provider did not recover');
      await delay(200);
    }
    const returned = await signIn(browser, 'researcher-a', 'local-a');
    assert.equal((await returned.request.get(`${origin}/drafts/${first.draftId}`)).status(), 200);
    await returned.close();
    await alice.close();
    await bob.close();
  } finally {
    await browser.close();
    await service.close();
  }
});
