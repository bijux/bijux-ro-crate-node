import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

for (const file of ['validation.yml', 'package-candidate.yml']) {
  test(`${file} requires isolated local account qualification`, async () => {
    const workflow = await readFile(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8')
    const job = workflow.match(/^  local-account:\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|(?![\s\S]))/m)?.[1]
    assert.ok(job)
    assert.match(job, /timeout-minutes: 5/)
    assert.match(job, /lane: \[store, browser\]/)
    assert.match(job, /npm ci/)
    assert.match(job, /npm run build/)
    for (const command of ['test:local-migrations', 'test:local-persistence', 'test:local-identity', 'test:local-session', 'test:local-drafts', 'test:local-journey']) assert.ok(job.includes(command), command)
    assert.match(job, /docker compose -p bijuxauthoringaccounts/)
    assert.match(job, /if: \$\{\{ always\(\) \}\}/)
    assert.doesNotMatch(job, /continue-on-error:/)
    assert.match(job, /npx playwright install --with-deps chromium/)
    assert.match(job, /PLAYWRIGHT_BROWSERS_PATH=\$PWD\/artifacts\/playwright/)
    const web = workflow.match(/^  authoring-web:\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|(?![\s\S]))/m)?.[1]
    assert.ok(web?.includes('npm run check --workspace @bijux/ro-crate-web'))
    assert.ok(web?.includes('npm run test --workspace @bijux/ro-crate-web'))
    const admission = file === 'validation.yml' ? 'packages' : 'archives'
    const aggregate = workflow.match(new RegExp(`^  ${admission}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:\\n|(?![\\s\\S]))`, 'm'))?.[1]
    assert.ok(aggregate?.includes('    - local-account\n'))
  })
}

test('normal app checks own account units and strict server sources', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../apps/web/package.json', import.meta.url), 'utf8')) as {scripts: Record<string,string>}
  assert.match(manifest.scripts.test, /tests\/local-account\.test\.ts/)
  assert.match(manifest.scripts.test, /tests\/server\/recovery-admission\.test\.ts/)
  assert.match(manifest.scripts.check, /tsc --noEmit -p tests\/server\/tsconfig\.json/)
  const root = JSON.parse(await readFile(new URL('../../tsconfig.json', import.meta.url), 'utf8')) as {references: Array<{path:string}>}
  assert.ok(root.references.some(reference => reference.path === './apps/web/tests/server/tsconfig.json'))
})

test('reference images use immutable multi-platform digests', async () => {
  const compose = await readFile(new URL('../../ops/local-authoring/compose.yaml', import.meta.url), 'utf8')
  assert.match(compose, /postgres:17\.12@sha256:[a-f0-9]{64}/)
  assert.match(compose, /quay\.io\/keycloak\/keycloak:26\.8\.2@sha256:[a-f0-9]{64}/)
})
