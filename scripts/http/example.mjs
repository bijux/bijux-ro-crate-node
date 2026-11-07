import {serve} from './server.mjs'

const host = await serve()
console.log('Submission example: ' + host.origin + '/examples/submission/index.html')
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await host.close()
  process.exit(0)
})
