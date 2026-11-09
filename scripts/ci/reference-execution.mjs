import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {closeSync, openSync} from 'node:fs'
import {resolve} from 'node:path'

/** Keep each capture's file descriptors owned until its child has closed. */
export async function runReferenceStep(step, {cwd, timeout = 240000} = {}) {
  assert.ok(Number.isFinite(timeout) && timeout > 0 && timeout <= 240000, 'Reference timeout must remain bounded')
  const descriptors = [], started = Date.now()
  try {
    const input = step.stdin ? openSync(resolve(cwd, step.stdin), 'r') : 'inherit'
    if (typeof input === 'number') descriptors.push(input)
    const output = step.stdout ? openSync(resolve(cwd, step.stdout), 'w') : 'inherit'
    if (typeof output === 'number') descriptors.push(output)
    await new Promise((accept, reject) => {
      const child = spawn(step.command, step.args, {cwd, stdio: [input, output, 'inherit'],
        env: {...process.env, ...step.env, PYTHONDONTWRITEBYTECODE: '1'}})
      const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
      let error
      child.once('error', value => {error = value})
      child.once('close', (status, signal) => {
        clearTimeout(timer)
        if (error) reject(error)
        else if (status !== 0) reject(new Error(`Reference command failed (${signal ?? status}): ${step.command}`))
        else accept()
      })
    })
    return {seconds: (Date.now() - started) / 1000, status: 0}
  } finally {for (const descriptor of descriptors) closeSync(descriptor)}
}

/** Bound independent families to two chains; validation follows their barrier. */
export async function runReferenceFamilies(families, final, execute) {
  assert.ok(families.length && families.every(family => family.steps.length), 'Reference families must not be empty')
  assert.equal(new Set(families.map(family => family.name)).size, families.length, 'Reference family names must be unique')
  let next = 0
  const failures = []
  const worker = async () => {
    while (next < families.length && !failures.length) {
      const family = families[next++]
      try {for (const step of family.steps) await execute(step)}
      catch (error) {failures.push(error)}
    }
  }
  await Promise.all([worker(), worker()])
  if (failures.length) throw new AggregateError(failures, 'Reference family qualification failed')
  await execute(final)
}
