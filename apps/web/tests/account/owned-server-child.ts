const entry = new URL('../../../../artifacts/web/dist/server/entry.mjs', import.meta.url)
const {startServer} = await import(entry.href) as {startServer:() => {server:{server:import('node:http').Server}; done:Promise<void>}}
const {server, done} = startServer()
server.server.once('listening', () => {
  const address = server.server.address()
  if (address && typeof address !== 'string') process.send?.({port:address.port})
})
done.catch(() => {process.exitCode = 1})
