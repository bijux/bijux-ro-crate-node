const entry = new URL('../../../../artifacts/web/dist/server/entry.mjs', import.meta.url)
const {startServer} = await import(entry.href) as {startServer:() => {server:{server:import('node:http').Server}; done:Promise<void>}}
const {server, done} = startServer()
server.server.once('listening', () => process.send?.('listening'))
done.catch(error => {console.error(error); process.exitCode = 1})
