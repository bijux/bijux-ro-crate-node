import {spawn} from 'node:child_process'

// This process remains the group leader until its caller releases it.
let targetStatus = 0
process.on('SIGTERM', () => {})
process.on('disconnect', () => process.exit(targetStatus))
process.on('message', (message: {command?: string, args?: string[], managed?: 'original-collections', signal?: 'SIGTERM' | 'SIGKILL'}) => {
  if (message.signal) {process.kill(-process.pid, message.signal); return}
  if (!message.command) {process.disconnect?.(); return}
  const child = spawn(message.command, message.args ?? [], {stdio: message.managed ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit', env: process.env})
  if (message.managed) {
    child.on('message', value => {if (value === 'reference:cancel') process.send?.({cancel: true})})
    child.send?.({referenceOwner: process.pid})
  }
  child.once('error', error => {targetStatus = 1; process.send?.({error: {message: error.message, code: (error as NodeJS.ErrnoException).code}})})
  child.once('exit', (status, signal) => {targetStatus = status ?? 1; process.send?.({status, signal})})
})
