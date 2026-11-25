import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import * as oidc from 'openid-client';
import { chromium } from 'playwright';

const issuer = 'http://127.0.0.1:18080/realms/authoring';
test('reference identity provider exposes the expected OIDC issuer', async () => {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  assert.equal(response.status, 200);
  const metadata: unknown = await response.json();
  assert.ok(metadata !== null && typeof metadata === 'object');
  assert.ok('issuer' in metadata);
  assert.equal(metadata.issuer, issuer);
  assert.ok('authorization_endpoint' in metadata);
  assert.ok('token_endpoint' in metadata);
});

test('two local accounts authenticate through authorization code and PKCE', async () => {
  const client = await oidc.discovery(new URL(issuer), 'local-authoring', undefined, oidc.None(), { execute: [oidc.allowInsecureRequests] });
  const callback = createServer((_request, response) => response.end('Local callback'));
  callback.listen(14321, '127.0.0.1');
  await once(callback, 'listening');
  const browser = await chromium.launch({ headless: true });
  try {
    const subjects: string[] = [];
    for (const [username, password] of [['researcher-a', 'local-a'], ['researcher-b', 'local-b']]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const verifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const authorization = oidc.buildAuthorizationUrl(client, {
        redirect_uri: 'http://127.0.0.1:14321/auth/callback', scope: 'openid',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', state, nonce,
      });
      await page.goto(authorization.href);
      await page.locator('#username').fill(username);
      await page.locator('#password').fill(password);
      await page.locator('#kc-login').click();
      await page.waitForURL('http://127.0.0.1:14321/auth/callback*', { timeout: 5000 });
      const tokens = await oidc.authorizationCodeGrant(client, new URL(page.url()), {
        pkceCodeVerifier: verifier, expectedState: state, expectedNonce: nonce,
      });
      const claims = tokens.claims();
      assert.equal(claims?.iss, issuer);
      assert.ok(claims?.sub);
      subjects.push(claims.sub);
      await context.close();
    }
    assert.notEqual(subjects[0], subjects[1]);
  } finally {
    await browser.close();
    callback.close();
  }
});
