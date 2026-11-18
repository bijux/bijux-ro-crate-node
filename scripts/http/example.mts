import {serve} from './server.mjs'

const host = await serve()
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => {
  await host.close()
  process.exit(0)
})
console.log('Submission example: ' + host.origin + '/examples/submission/index.html')
