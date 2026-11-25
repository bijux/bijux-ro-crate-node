import type { APIRoute } from 'astro';
import { createLocalIdentityService } from '../../../server/identity/server.js';

export const prerender = false;
let service: ReturnType<typeof createLocalIdentityService> | undefined;

export const ALL: APIRoute = async ({ request }) => {
  if (process.env.BIJUX_LOCAL_REFERENCE !== '1') return new Response(null, { status: 404 });
  const port = (name:string, fallback:string) => {
    const value = process.env[name] ?? fallback
    if (!/^[0-9]{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw Error('Invalid local reference port')
    return value
  }
  let webPort:string, identityPort:string, databasePort:string
  try { webPort = port('BIJUX_LOCAL_WEB_PORT', '14321'); identityPort = port('BIJUX_LOCAL_IDENTITY_PORT', '18080'); databasePort = port('BIJUX_LOCAL_DATABASE_PORT', '15433') }
  catch { return new Response(null, {status:503}) }
  if (![ `http://127.0.0.1:${webPort}`, `http://localhost:${webPort}` ].includes(new URL(request.url).origin) || request.headers.get('host') !== `127.0.0.1:${webPort}`) return new Response(null, { status: 400 });
  service ??= createLocalIdentityService({
    origin: `http://127.0.0.1:${webPort}`,
    issuer: `http://127.0.0.1:${identityPort}/realms/authoring`,
    clientId: 'local-authoring',
    databaseUrl: `postgresql://authoring:local-reference-only@127.0.0.1:${databasePort}/authoring`,
    enableDrafts: true,
  });
  try { return await (await service).handle(request); }
  catch { service = undefined; return new Response(null, { status: 503 }); }
};
