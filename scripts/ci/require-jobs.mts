import assert from 'node:assert/strict'

const jobs: unknown = JSON.parse(process.env.BIJUX_REQUIRED_JOBS ?? '{}')
assert.ok(Object.keys(jobs as object).length, 'An aggregate gate must depend on required jobs')
for (const [name, job] of Object.entries(jobs as Record<string, unknown>))
  assert.equal((job as {result?: unknown}).result, 'success', 'Required job did not succeed: ' + name)
console.log('All required job groups succeeded')
