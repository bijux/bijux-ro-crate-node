import assert from 'node:assert/strict'

const jobs = JSON.parse(process.env.BIJUX_REQUIRED_JOBS ?? '{}')
assert.ok(Object.keys(jobs).length, 'An aggregate gate must depend on required jobs')
for (const [name, job] of Object.entries(jobs))
  assert.equal(job.result, 'success', 'Required job did not succeed: ' + name)
console.log('All required job groups succeeded')
