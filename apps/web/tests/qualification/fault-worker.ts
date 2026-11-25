import {parentPort} from 'node:worker_threads'
if (!parentPort) throw new Error('A parent is required')
parentPort.once('message', (files: Map<string, Uint8Array>) => {
  if (files.has('malformed')) {parentPort?.postMessage({status: 'valid'}); return}
  if (files.has('crash')) throw new Error('Controlled worker failure')
  while (true) { /* Exercise termination of CPU-bound work. */ }
})
