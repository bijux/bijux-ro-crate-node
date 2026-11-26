import { createServer } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { createLocalIdentityService, type LocalIdentityConfiguration } from '../../../src/server/identity/server.js';

/** HTTP harness for the same Web Request handler used by Astro's route. */
export async function startLocalIdentityService(options: LocalIdentityConfiguration): Promise<{ close(): Promise<void> }> {
  const service = await createLocalIdentityService(options);
  const origin = new URL(options.origin);
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      const method = incoming.method ?? 'GET';
      const body = method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      const init: RequestInit & { duplex?: 'half' } = { method, headers, ...(body ? { body, duplex: 'half' } : {}) };
      const result = await service.handle(new Request(new URL(incoming.url ?? '/', origin), init));
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      if (!result.body) { outgoing.end(); return; }
      const reader = result.body.getReader();
      for (;;) { const { value, done } = await reader.read(); if (done) break; outgoing.write(value); }
      outgoing.end();
    })().catch(() => { if (!outgoing.headersSent) outgoing.writeHead(500); outgoing.end(); });
  });
  server.listen(Number(origin.port), '127.0.0.1');
  try { await once(server, 'listening'); } catch (error) { await service.close(); throw error; }
  return { async close() { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await service.close(); } };
}
