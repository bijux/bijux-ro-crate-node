import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import pg from 'pg';
import * as oidc from 'openid-client';
import { handleDraftRequest } from '../drafts/http.js';
import { migrateDatabase } from '../database/migrations.js';

export interface LocalIdentityConfiguration {
  origin: string;
  issuer: string;
  clientId: string;
  databaseUrl: string;
  /** Enable local reference draft routes explicitly. */
  enableDrafts?: boolean;
}

interface PendingLogin { verifier: string; nonce: string; expires: number }
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const secret = (): string => randomBytes(32).toString('base64url');
function cookie(request: IncomingMessage, name: string): string | undefined {
  return request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
function setCookie(response: ServerResponse, name: string, value: string, age: number): void {
  response.setHeader('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}`);
}
function localUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash) {
    throw new Error('Local identity requires a loopback HTTP URL');
  }
  return url;
}

/** Starts the explicitly local reference identity service. */
export async function startLocalIdentityService(options: LocalIdentityConfiguration): Promise<{ close(): Promise<void> }> {
  const origin = localUrl(options.origin);
  if (origin.pathname !== '/' || !origin.port) throw new Error('Origin must include a loopback port');
  const issuer = localUrl(options.issuer);
  const databaseAddress = new URL(options.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(databaseAddress.protocol) || databaseAddress.hostname !== '127.0.0.1' || databaseAddress.search || databaseAddress.hash) {
    throw new Error('Local identity requires a loopback database URL');
  }
  const config = await oidc.discovery(issuer, options.clientId, undefined, oidc.None(), { execute: [oidc.allowInsecureRequests] });
  const database = new pg.Pool({ connectionString: options.databaseUrl });
  database.on('error', () => { console.error('Local identity database connection closed'); });
  try {
    await migrateDatabase(database);
  } catch (error) { await database.end(); throw error; }
  const pending = new Map<string, PendingLogin>();
  const server = createServer((request, response) => {
    void (async () => {
      response.setHeader('Cache-Control', 'no-store');
      if (request.headers.host !== origin.host || !request.url) { response.writeHead(400).end(); return; }
      const url = new URL(request.url, origin);
      if (url.origin !== origin.origin) { response.writeHead(400).end(); return; }
      if (request.method === 'GET' && url.pathname === '/auth/login') {
        for (const [key, value] of pending) if (value.expires < Date.now()) pending.delete(key);
        if (pending.size >= 100) { response.writeHead(503).end(); return; }
        const state = oidc.randomState();
        const verifier = oidc.randomPKCECodeVerifier();
        const nonce = oidc.randomNonce();
        pending.set(state, { verifier, nonce, expires: Date.now() + 300_000 });
        setCookie(response, 'login_state', state, 300);
        const destination = oidc.buildAuthorizationUrl(config, {
          redirect_uri: new URL('/auth/callback', origin).href, scope: 'openid', state, nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
        });
        response.writeHead(302, { Location: destination.href }).end(); return;
      }
      if (request.method === 'GET' && url.pathname === '/auth/callback') {
        const state = url.searchParams.get('state');
        const login = state ? pending.get(state) : undefined;
        if (state) pending.delete(state);
        if (!state || !login || login.expires < Date.now() || cookie(request, 'login_state') !== state) {
          response.writeHead(400).end(); return;
        }
        const tokens = await oidc.authorizationCodeGrant(config, url, {
          pkceCodeVerifier: login.verifier, expectedState: state, expectedNonce: login.nonce,
        });
        const claims = tokens.claims();
        if (!claims?.sub || claims.iss !== options.issuer) { response.writeHead(401).end(); return; }
        const token = secret();
        await database.query('INSERT INTO draft_identity.sessions VALUES ($1, $2, $3, now() + interval \'8 hours\')', [digest(token), claims.iss, claims.sub]);
        setCookie(response, 'draft_session', token, 28800);
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Signed in'); return;
      }
      const token = cookie(request, 'draft_session');
      if (options.enableDrafts && (url.pathname === '/drafts' || url.pathname.startsWith('/drafts/'))) {
        const session = token ? await database.query<{ issuer: string; subject: string }>(
          'SELECT issuer, subject FROM draft_identity.sessions WHERE token_hash = $1 AND expires_at > now()', [digest(token)]) : null;
        if (!session?.rowCount) { response.writeHead(401).end(); return; }
        const owner = session.rows[0];
        await handleDraftRequest({ request, response, url, origin, database, owner });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/session') {
        const result = token ? await database.query<{ issuer: string; subject: string }>(
          'SELECT issuer, subject FROM draft_identity.sessions WHERE token_hash = $1 AND expires_at > now()', [digest(token)]) : null;
        if (!result?.rowCount) { response.writeHead(401).end(); return; }
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result.rows[0])); return;
      }
      if (request.method === 'POST' && url.pathname === '/auth/logout') {
        if (request.headers.origin !== origin.origin) { response.writeHead(403).end(); return; }
        if (token) await database.query('DELETE FROM draft_identity.sessions WHERE token_hash = $1', [digest(token)]);
        setCookie(response, 'draft_session', '', 0);
        response.writeHead(204).end(); return;
      }
      response.writeHead(404).end();
    })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end(); });
  });
  server.listen(Number(origin.port), '127.0.0.1');
  try { await once(server, 'listening'); } catch (error) { await database.end(); throw error; }
  return { async close() { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await database.end(); } };
}
