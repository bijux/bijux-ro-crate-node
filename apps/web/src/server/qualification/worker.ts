import {parentPort} from 'node:worker_threads'
import {validateCrate} from '@bijux/ro-crate-validator'

if (!parentPort) throw new Error('Qualification worker requires a parent')
const port = parentPort
port.once('message', async (files: Map<string, Uint8Array>) => {
  port.postMessage(await validateCrate(files))
})
