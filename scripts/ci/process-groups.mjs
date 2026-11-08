import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'

/** Preserve order within each independent group and await every started group. */
export async function runProcessGroups(groups, {cwd, env = process.env, timeout = 240000} = {}) {
  assert.ok(groups.length > 0 && groups.every(group => group.length > 0), 'Process groups must not be empty')
  const results = await Promise.allSettled(groups.map(async group => {
    for (const {command, args = [], env: overrides = {}} of group) {
      await new Promise((resolve, reject) => {
        const child = spawn(command, args, {cwd, env: {...env, ...overrides}, stdio: 'inherit',
          timeout, killSignal: 'SIGKILL'})
        child.on('error', reject)
        child.on('close', (code, signal) => code === 0 ? resolve() :
          reject(new Error(`${command} exited ${signal ?? code}`)))
      })
    }
  }))
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
  if (errors.length) throw new AggregateError(errors, 'Required process groups failed')
}
