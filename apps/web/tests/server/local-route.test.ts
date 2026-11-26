import { strict as assert } from 'node:assert';
import { test } from 'node:test';
const routeModule = '../../src/pages/api/local/[...path].js';
const { ALL } = await import(routeModule) as {ALL:(context:{request:Request}) => Promise<Response>};

test('local account route rejects forged hosts and invalid port configuration', async () => {
  const before = {...process.env};
  try {
    process.env.BIJUX_LOCAL_REFERENCE = '1';
    process.env.BIJUX_LOCAL_WEB_PORT = '14322';
    const request = new Request('http://127.0.0.1:14322/api/local/session', {headers:{host:'evil.example'}});
    assert.equal((await ALL({request})).status, 400);
    const external = new Request('http://example.invalid:14322/api/local/session', {headers:{host:'127.0.0.1:14322'}});
    assert.equal((await ALL({request:external})).status, 400);
    process.env.BIJUX_LOCAL_DATABASE_PORT = 'https://example.invalid';
    const local = new Request('http://127.0.0.1:14322/api/local/session', {headers:{host:'127.0.0.1:14322'}});
    assert.equal((await ALL({request:local})).status, 503);
    delete process.env.BIJUX_LOCAL_DATABASE_PORT;
    process.env.BIJUX_LOCAL_RECEIVER_PORT = 'https://example.invalid';
    assert.equal((await ALL({request:local})).status, 503);
  } finally { process.env = before; }
});
