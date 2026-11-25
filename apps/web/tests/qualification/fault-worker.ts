import {parentPort} from 'node:worker_threads'
if (!parentPort) throw new Error('A parent is required')
parentPort.once('message', (files: Map<string, Uint8Array>) => {
  if (files.has('malformed')) {parentPort?.postMessage({status: 'valid'}); return}
  if (files.has('crash')) throw new Error('Controlled worker failure')
  const issues = {CRITICAL: [], ERROR: [], WARNING: [], INFO: [], DEBUG: []}
  if (files.has('missing-debug')) {const {DEBUG: _debug, ...rest} = issues; parentPort?.postMessage({status: 'valid', report: {highest_error_level: null, issues: rest}}); return}
  if (files.has('missing-highest')) {parentPort?.postMessage({status: 'valid', report: {issues}}); return}
  if (files.has('missing-stage')) {parentPort?.postMessage({status: 'incomplete', reason: 'failure', report: {highest_error_level: null, issues}}); return}
  if (files.has('valid-with-error')) {parentPort?.postMessage({status: 'valid', report: {highest_error_level: 'ERROR', issues: {...issues, ERROR: [{message: 'failure', severity: 40, location_description: null}]}}}); return}
  if (files.has('valid-with-critical')) {parentPort?.postMessage({status: 'valid', report: {highest_error_level: 'CRITICAL', issues: {...issues, CRITICAL: [{message: 'failure', severity: 50, location_description: null}]}}}); return}
  if (files.has('bad-severity')) {parentPort?.postMessage({status: 'valid', report: {highest_error_level: 'WARNING', issues: {...issues, WARNING: [{message: 'failure', severity: 40, location_description: null}]}}}); return}
  if (files.has('invalid-without-errors')) {parentPort?.postMessage({status: 'invalid', report: {highest_error_level: null, issues}}); return}
  if (files.has('heap')) {
    const retained: number[][] = []
    while (true) retained.push(Array.from({length: 100_000}, (_, index) => index))
  }
  while (true) { /* Exercise termination of CPU-bound work. */ }
})
