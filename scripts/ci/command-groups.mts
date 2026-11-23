import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'

interface Command {command: string; args?: readonly string[]; env?: NodeJS.ProcessEnv}
interface CommandOptions {cwd?: string | URL; env?: NodeJS.ProcessEnv; timeout?: number}

/** Preserve order within each independent command sequence and await every started sequence. */
export async function runCommandGroups(groups: readonly (readonly Command[])[], {cwd, env = process.env, timeout = 240000}: CommandOptions = {}) {
  assert.ok(groups.length > 0 && groups.every(group => group.length > 0), 'Command groups must not be empty')
  const results = await Promise.allSettled(groups.map(async group => {
    for (const {command, args = [], env: overrides = {}} of group) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, {cwd, env: {...env, ...overrides}, stdio: 'inherit'})
        let timedOut = false
        let escalated = false
        let escalation: NodeJS.Timeout | undefined
        let deadline: NodeJS.Timeout | undefined
        const finish = (error?: Error) => {
          clearTimeout(timer)
          clearTimeout(escalation)
          clearTimeout(deadline)
          error ? reject(error) : resolve()
        }
        const timer = timeout === 0 ? undefined : setTimeout(() => {
          timedOut = true
          // Playwright closes its browsers and exits on SIGINT; SIGTERM only starts cleanup.
          child.kill('SIGINT')
          escalation = setTimeout(() => {
            escalated = true
            child.kill('SIGKILL')
            deadline = setTimeout(() => finish(new Error(`${command} timed out; cleanup unconfirmed`)), 1000)
          }, 2000)
        }, timeout)
        child.on('error', error => finish(timedOut ? new Error(`${command} timed out; cleanup unconfirmed`, {cause: error}) : error))
        child.on('close', (code, signal) => {
          if (timedOut) finish(new Error(`${command} timed out${escalated || process.platform === 'win32' ? '; cleanup unconfirmed' : ''}`))
          else finish(code === 0 ? undefined : new Error(`${command} exited ${signal ?? code}`))
        })
      })
    }
  }))
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
  if (errors.length) throw new AggregateError(errors, 'Required command groups failed')
}
