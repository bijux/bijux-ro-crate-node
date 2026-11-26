import type { APIRoute } from 'astro';
import { createLocalIdentityService } from '../../../server/identity/server.js';

export const prerender = false;
let service: ReturnType<typeof createLocalIdentityService> | undefined;

export const ALL: APIRoute = async ({ request }) => {
  if (process.env.BIJUX_LOCAL_REFERENCE !== '1') return new Response(null, { status: 404 });
  if (!['http://127.0.0.1:14321', 'http://localhost:14321'].includes(new URL(request.url).origin) || request.headers.get('host') !== '127.0.0.1:14321') return new Response(null, { status: 400 });
  service ??= createLocalIdentityService({
    origin: 'http://127.0.0.1:14321',
    issuer: 'http://127.0.0.1:18080/realms/authoring',
    clientId: 'local-authoring',
    databaseUrl: 'postgresql://authoring:local-reference-only@127.0.0.1:15433/authoring',
    enableDrafts: true,
  });
  try { return await (await service).handle(request); }
  catch { service = undefined; return new Response(null, { status: 503 }); }
};
