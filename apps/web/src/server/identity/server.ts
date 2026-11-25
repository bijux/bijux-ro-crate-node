import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import * as oidc from 'openid-client';
import { handleDraftRequest } from '../drafts/http.js';
import { migrateDatabase } from '../database/migrations.js';

export interface LocalIdentityConfiguration {
  origin: string;
  issuer: string;
  clientId: string;
  databaseUrl: string;
  enableDrafts?: boolean;
}
interface PendingLogin { verifier: string; nonce: string; expires: number }
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const cookie = (request: Request, name: string): string | undefined => request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
const cookieValue = (name: string, value: string, age: number): string => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function localUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash) throw new Error('Local identity requires a loopback HTTP URL');
  return url;
}

export async function createLocalIdentityService(options: LocalIdentityConfiguration): Promise<{ handle(request: Request): Promise<Response>; close(): Promise<void> }> {
  const origin = localUrl(options.origin);
  if (origin.pathname !== '/' || !origin.port) throw new Error('Origin must include a loopback port');
  const issuer = localUrl(options.issuer);
  const databaseAddress = new URL(options.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(databaseAddress.protocol) || databaseAddress.hostname !== '127.0.0.1' || databaseAddress.search || databaseAddress.hash) throw new Error('Local identity requires a loopback database URL');
  const config = await oidc.discovery(issuer, options.clientId, undefined, oidc.None(), { execute: [oidc.allowInsecureRequests] });
  const database = new pg.Pool({ connectionString: options.databaseUrl });
  database.on('error', () => { console.error('Local identity database connection closed'); });
  try { await migrateDatabase(database); } catch (error) { await database.end(); throw error; }
  const pending = new Map<string, PendingLogin>();
  async function handle(request: Request): Promise<Response> {
    try {
      const incoming = new URL(request.url);
      const localAlias = `http://localhost:${origin.port}`;
      if (![origin.origin, localAlias].includes(incoming.origin) || request.headers.get('host') !== origin.host) return new Response(null, { status: 400 });
      const url = new URL(incoming.pathname + incoming.search, origin);
      if (request.method === 'GET' && url.pathname === '/api/local/auth/login') {
        for (const [key, value] of pending) if (value.expires < Date.now()) pending.delete(key);
        if (pending.size >= 100) return new Response(null, { status: 503 });
        const state = oidc.randomState(), verifier = oidc.randomPKCECodeVerifier(), nonce = oidc.randomNonce();
        pending.set(state, { verifier, nonce, expires: Date.now() + 300_000 });
        const destination = oidc.buildAuthorizationUrl(config, {
          redirect_uri: new URL('/api/local/auth/callback', origin).href, scope: 'openid', state, nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
        });
        return new Response(null, { status: 302, headers: { location: destination.href, 'set-cookie': cookieValue('login_state', state, 300) } });
      }
      if (request.method === 'GET' && url.pathname === '/api/local/auth/callback') {
        const state = url.searchParams.get('state'), login = state ? pending.get(state) : undefined;
        if (state) pending.delete(state);
        if (!state || !login || login.expires < Date.now() || cookie(request, 'login_state') !== state) return new Response(null, { status: 400 });
        const tokens = await oidc.authorizationCodeGrant(config, url, { pkceCodeVerifier: login.verifier, expectedState: state, expectedNonce: login.nonce });
        const claims = tokens.claims();
        if (!claims?.sub || claims.iss !== options.issuer) return new Response(null, { status: 401 });
        const token = randomBytes(32).toString('base64url');
        await database.query('INSERT INTO draft_identity.sessions VALUES ($1, $2, $3, now() + interval \'8 hours\')', [digest(token), claims.iss, claims.sub]);
        return new Response('Signed in. You may close this window.', { headers: { 'content-type': 'text/plain; charset=utf-8', 'set-cookie': cookieValue('draft_session', token, 28800) } });
      }
      const token = cookie(request, 'draft_session');
      if (options.enableDrafts && (url.pathname === '/api/local/drafts' || url.pathname.startsWith('/api/local/drafts/'))) {
        const session = token ? await database.query<{ issuer: string; subject: string }>('SELECT issuer, subject FROM draft_identity.sessions WHERE token_hash = $1 AND expires_at > now()', [digest(token)]) : null;
        if (!session?.rowCount) return new Response(null, { status: 401 });
        return await handleDraftRequest(request, url, origin, database, session.rows[0]);
      }
      if (request.method === 'GET' && url.pathname === '/api/local/session') {
        const result = token ? await database.query<{ issuer: string; subject: string }>('SELECT issuer, subject FROM draft_identity.sessions WHERE token_hash = $1 AND expires_at > now()', [digest(token)]) : null;
        return result?.rowCount ? Response.json(result.rows[0]) : new Response(null, { status: 401 });
      }
      if (request.method === 'POST' && url.pathname === '/api/local/auth/logout') {
        if (request.headers.get('origin') !== origin.origin) return new Response(null, { status: 403 });
        if (token) await database.query('DELETE FROM draft_identity.sessions WHERE token_hash = $1', [digest(token)]);
        return new Response(null, { status: 204, headers: { 'set-cookie': cookieValue('draft_session', '', 0) } });
      }
      return new Response(null, { status: 404 });
    } catch { return new Response(null, { status: 500 }); }
  }
  return { async handle(request) { const response = await handle(request); response.headers.set('cache-control', 'no-store'); return response; }, async close() { await database.end(); } };
}
