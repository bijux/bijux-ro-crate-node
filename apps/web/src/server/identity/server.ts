import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import * as oidc from 'openid-client';
import { handleDraftRequest } from '../drafts/http.js';
import { handleSubmissionRequest } from '../submission/http.js';
import { migrateDatabase } from '../database/migrations.js';
import { preferredUsername } from '../../identity/preferred-username.js';

export interface LocalIdentityConfiguration {
  origin: string;
  issuer: string;
  clientId: string;
  databaseUrl: string;
  enableDrafts?: boolean;
  receiverOrigin?: string;
}
interface PendingLogin { verifier: string; nonce: string; expires: number }
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const sessionMarker = (token:string): string => digest(`local-session-precondition\0${token}`);
const cookie = (request: Request, name: string): string | undefined => request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
const cookieValue = (name: string, value: string, age: number, path = '/'): string => `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const callbackPath = '/api/local/auth/callback';
const maxPendingLogins = 16;
const stateCookie = (state: string) => `login_state_${state}`;
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
    let consumedCookie: string | undefined;
    try {
      const incoming = new URL(request.url);
      const localAlias = `http://localhost:${origin.port}`;
      if (![origin.origin, localAlias].includes(incoming.origin) || request.headers.get('host') !== origin.host) return new Response(null, { status: 400 });
      const url = new URL(incoming.pathname + incoming.search, origin);
      if (request.method === 'GET' && url.pathname === '/api/local/auth/login') {
        for (const [key, value] of pending) if (value.expires < Date.now()) pending.delete(key);
        if (pending.size >= maxPendingLogins) return new Response(null, { status: 503 });
        const state = oidc.randomState(), verifier = oidc.randomPKCECodeVerifier(), nonce = oidc.randomNonce();
        pending.set(state, { verifier, nonce, expires: Date.now() + 300_000 });
        const destination = oidc.buildAuthorizationUrl(config, {
          redirect_uri: new URL('/api/local/auth/callback', origin).href, scope: 'openid', prompt: 'login', state, nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
        });
        return new Response(null, { status: 302, headers: { location: destination.href, 'set-cookie': cookieValue(stateCookie(state), state, 300, callbackPath) } });
      }
      if (request.method === 'GET' && url.pathname === '/api/local/auth/callback') {
        const state = url.searchParams.get('state');
        if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return new Response(null, { status: 400 });
        const login = pending.get(state), name = stateCookie(state);
        if (!login || login.expires < Date.now() || cookie(request, name) !== state) return new Response(null, { status: 400 });
        pending.delete(state);
        const clear = cookieValue(name, '', 0, callbackPath);
        consumedCookie = clear;
        if (url.searchParams.get('error') === 'access_denied') return new Response('Sign-in was not completed. You may close this window.', {headers: {'content-type': 'text/plain; charset=utf-8', 'set-cookie': clear}});
        if (url.searchParams.has('error')) return new Response(null, {status: 400, headers: {'set-cookie': clear}});
        let claims: ReturnType<Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>['claims']>;
        try {claims = (await oidc.authorizationCodeGrant(config, url, { pkceCodeVerifier: login.verifier, expectedState: state, expectedNonce: login.nonce })).claims();}
        catch {return new Response(null, {status: 401, headers: {'set-cookie': clear}});}
        if (!claims?.sub || claims.iss !== options.issuer) return new Response(null, { status: 401, headers: {'set-cookie': clear} });
        const token = randomBytes(32).toString('base64url');
        await database.query('INSERT INTO draft_identity.sessions (token_hash, issuer, subject, expires_at, preferred_username) VALUES ($1, $2, $3, now() + interval \'8 hours\', $4)', [digest(token), claims.iss, claims.sub, preferredUsername(claims.preferred_username)]);
        const owner = digest(JSON.stringify([claims.iss, claims.sub]));
        const scriptNonce = randomBytes(18).toString('base64');
        const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local sign-in</title></head><body><p>Signed in. You may close this window.</p><script nonce="${scriptNonce}">window.opener?.postMessage({type:'local-sign-in-completed',owner:'${owner}'},${JSON.stringify(origin.origin)})</script></body></html>`;
        const headers = new Headers({'content-type': 'text/html; charset=utf-8', 'content-security-policy': `default-src 'none'; connect-src 'self'; script-src 'nonce-${scriptNonce}'`, 'referrer-policy': 'no-referrer'});
        headers.append('set-cookie', clear);
        headers.append('set-cookie', cookieValue('draft_session', token, 28800));
        return new Response(body, {headers});
      }
      const token = cookie(request, 'draft_session');
      if (options.enableDrafts && (url.pathname === '/api/local/submissions' || url.pathname === '/api/local/drafts' || url.pathname.startsWith('/api/local/drafts/'))) {
        const session = token ? await database.query<{ issuer: string; subject: string }>('SELECT issuer, subject FROM draft_identity.sessions WHERE token_hash = $1 AND expires_at > now()', [digest(token)]) : null;
        if (!session?.rowCount) return new Response(null, { status: 401 });
        const expectedOwner = request.headers.get('x-bijux-owner');
        if (expectedOwner !== null && expectedOwner !== digest(JSON.stringify([session.rows[0].issuer, session.rows[0].subject]))) return new Response(null, { status: 403 });
        if (url.pathname === '/api/local/submissions' || url.pathname.endsWith('/submission') || url.pathname.endsWith('/submission/reconcile')) return await handleSubmissionRequest(request, url, origin, database, session.rows[0], options.receiverOrigin);
        return await handleDraftRequest(request, url, origin, database, session.rows[0]);
      }
      if (request.method === 'GET' && url.pathname === '/api/local/session') {
        const result = token ? await database.query<{ issuer: string; subject: string; preferred_username:string | null }>('SELECT issuer, subject, preferred_username FROM draft_identity.sessions WHERE token_hash = $1 AND expires_at > now()', [digest(token)]) : null;
        return result?.rowCount && token ? Response.json({issuer:result.rows[0].issuer, subject:result.rows[0].subject, preferredUsername:preferredUsername(result.rows[0].preferred_username), session:sessionMarker(token)}) : new Response(null, { status: 401 });
      }
      if (request.method === 'POST' && url.pathname === '/api/local/auth/logout') {
        if (request.headers.get('origin') !== origin.origin) return new Response(null, { status: 403 });
        if (!token || request.headers.get('x-bijux-session') !== sessionMarker(token)) return new Response(null, {status:409});
        if (token) await database.query('DELETE FROM draft_identity.sessions WHERE token_hash = $1', [digest(token)]);
        // A delayed logout must not clear a newer sign-in's cookie.
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    } catch { return new Response(null, { status: 500, ...(consumedCookie ? {headers: {'set-cookie': consumedCookie}} : {}) }); }
  }
  return { async handle(request) { const response = await handle(request); response.headers.set('cache-control', 'no-store'); return response; }, async close() { await database.end(); } };
}
