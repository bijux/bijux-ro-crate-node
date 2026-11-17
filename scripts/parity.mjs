import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const loader = Object.hasOwn(process.env, 'BIJUX_VALIDATOR_MODULE') ? [] : ['--import', 'tsx']
const runner = fileURLToPath(new URL('../tests/parity/run.mjs', import.meta.url))
const result = spawnSync(process.execPath, [...loader, runner, ...process.argv.slice(2)], {stdio: 'inherit'})
if (result.error) throw result.error
if (result.signal) process.kill(process.pid, result.signal)
process.exit(result.status ?? 1)
