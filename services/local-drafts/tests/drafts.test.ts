import { request as httpRequest } from 'node:http';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { applyChange, createDraft, importCrate } from '@bijux/ro-crate-creator';
import { encodeRecovery } from '../../../apps/web/src/drafts/recovery-codec.js';
import { RECOVERY_REQUEST_MAX_BYTES } from '../src/recovery/admission.js';
import { startLocalIdentityService } from '../src/identity/server.js';

const origin = 'http://127.0.0.1:14321';
const options = {
  origin,
  issuer: 'http://127.0.0.1:18080/realms/authoring',
  clientId: 'local-authoring',
  databaseUrl: 'postgresql://authoring:local-reference-only@127.0.0.1:15433/authoring',
  enableDrafts: true,
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

// An unclosed, chunked request proves authorization happens before body consumption.
async function streamProbe(cookie?: string, overflow = false): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = httpRequest(`${origin}/drafts`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', 'transfer-encoding': 'chunked', ...(cookie ? { cookie } : {}) },
    }, response => {
      response.resume();
      settled = true;
      clearTimeout(timer);
      resolve(response.statusCode ?? 0);
      req.destroy();
    });
    const timer = setTimeout(() => { req.destroy(); reject(Error('Request was not rejected promptly')); }, 30000);
    req.on('error', error => { if (!settled) { clearTimeout(timer); reject(error); } });
    req.flushHeaders();
    if (overflow) {
      const chunk = Buffer.alloc(1024 * 1024, 0x20);
      let remaining = RECOVERY_REQUEST_MAX_BYTES + 1;
      const send = () => {
        while (!settled && remaining > 0) {
          const bytes = Math.min(remaining, chunk.length);
          remaining -= bytes;
          if (!req.write(chunk.subarray(0, bytes))) { req.once('drain', send); return; }
        }
        if (!settled) req.end();
      };
      send();
    }
  });
}

test('authenticated local saves isolate owners and preserve conflicts across service restart', async () => {
  let service = await startLocalIdentityService(options);
  const browser = await chromium.launch({ headless: true });
  try {
    assert.equal(await streamProbe(), 401);
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(`${origin}/drafts/00000000-0000-0000-0000-000000000000`)).status(), 401);
    await anonymous.close();
    const alice = await signIn(browser, 'researcher-a', 'local-a');
    const bob = await signIn(browser, 'researcher-b', 'local-b');
    const cookies = await alice.cookies(origin);
    const cookie = cookies.map(item => `${item.name}=${item.value}`).join('; ');
    assert.equal(await streamProbe(cookie, true), 413);
    const save = (context: BrowserContext, data: unknown) => context.request.post(`${origin}/drafts`, { headers: { origin }, data });
    const run = randomUUID();
    const created = applyChange(createDraft(), { type: 'add-study' });
    assert.equal(created.status, 'applied');
    if (created.status !== 'applied') throw Error('setup');
    const initial = JSON.parse(encodeRecovery({ draft: createDraft(), pending: [{ id: 'p:1', path: 'images/raw.tif', size: '900719925474099312345' }] }));
    const complete = JSON.parse(encodeRecovery({ draft: created.draft, pending: [{ id: 'p:1', path: 'images/raw.tif', size: '3' }] }));
    const firstRequest = { key: `${run}-initial`, recovery: initial };
    const pending = Array.from({ length: 300 }, (_, index) => ({ id: `p:${index + 1}`, path: `${index}-${'x'.repeat(3900)}`, size: '9' }));
    const largeRecovery = JSON.parse(encodeRecovery({ draft: createDraft(), pending }));
    assert.ok(Buffer.byteLength(JSON.stringify(largeRecovery)) > 1048576);
    const largeSave = await save(alice, { key: `${run}-large-valid`, recovery: largeRecovery });
    assert.equal(largeSave.status(), 201);
    const largeId: { draftId: string } = await largeSave.json();
    assert.deepEqual((await (await alice.request.get(`${origin}/drafts/${largeId.draftId}`)).json()).recovery, largeRecovery);
    assert.equal((await alice.request.post(`${origin}/drafts`, { headers: { origin, 'content-type': 'application/json' }, data: Buffer.from([0xff]) })).status(), 400);
    const firstResponse = await save(alice, firstRequest);
    assert.equal(firstResponse.status(), 201);
    const first: { draftId: string; versionId: string; contentHash: string } = await firstResponse.json();
    assert.deepEqual(await (await save(alice, firstRequest)).json(), first);
    assert.equal((await save(alice, { ...firstRequest, recovery: complete })).status(), 409);
    assert.equal((await bob.request.get(`${origin}/drafts/${first.draftId}`)).status(), 404);
    const nextRequest = { key: `${run}-next`, draftId: first.draftId, expectedHead: first.versionId, recovery: complete };
    assert.equal((await save(bob, nextRequest)).status(), 404);
    const initialBody: { frozen: { status: string } } = await (await alice.request.get(`${origin}/drafts/${first.draftId}`)).json();
    assert.equal(initialBody.frozen.status, 'blocked');
    const nextResponse = await save(alice, nextRequest);
    assert.equal(nextResponse.status(), 201);
    const next: { versionId: string } = await nextResponse.json();
    assert.equal((await save(alice, { ...nextRequest, key: `${run}-stale`, recovery: initial })).status(), 409);
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
    assert.deepEqual(await (await save(alice, firstRequest)).json(), first);
    assert.deepEqual((await (await alice.request.get(`${origin}/drafts/${largeId.draftId}`)).json()).recovery, largeRecovery);
    const restored = await alice.request.get(`${origin}/drafts/${first.draftId}`);
    assert.equal(restored.status(), 200);
    const body: { versionId: string; recovery: unknown; frozen: { status: string; files: Array<{ path: string; base64: string }> } } = await restored.json();
    assert.equal(body.versionId, next.versionId);
    assert.deepEqual(body.recovery, complete);
    assert.equal(body.frozen.status, 'materialized');
    assert.ok(body.frozen.files.some(file => file.path === 'ro-crate-metadata.json'));
    const competing = await Promise.all(['left', 'right'].map(side => save(alice, {
      key: `${run}-${side}`, draftId: first.draftId, expectedHead: next.versionId, recovery: side === 'left' ? initial : complete,
    })));
    assert.deepEqual(competing.map(result => result.status()).sort(), [201, 409]);
    assert.equal((await save(alice, { key: `${run}-invalid`, recovery: { unsupported: 'input' } })).status(), 400);
    assert.equal((await save(alice, { key: `${run}-forged`, recovery: initial, frozen: { status: 'materialized', files: [] } })).status(), 400);
    const readOnly = await importCrate(new Map([['ro-crate-metadata.json', new Uint8Array([255])]]), { metadataPaths: ['ro-crate-metadata.json'] });
    if (readOnly.status !== 'read-only') throw Error('setup');
    const readOnlyRecovery = JSON.parse(encodeRecovery({ readOnly, pending: [] }));
    const readOnlySave = await save(alice, { key: `${run}-readonly`, recovery: readOnlyRecovery });
    assert.equal(readOnlySave.status(), 201);
    const readOnlyId: { draftId: string } = await readOnlySave.json();
    const readOnlyBody: { frozen: { status: string; files: Array<{ base64: string }> } } = await (await alice.request.get(`${origin}/drafts/${readOnlyId.draftId}`)).json();
    assert.equal(readOnlyBody.frozen.status, 'read-only');
    assert.equal(readOnlyBody.frozen.files[0].base64, '/w==');
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
