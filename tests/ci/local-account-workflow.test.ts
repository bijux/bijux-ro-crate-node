import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

for (const file of ['validation.yml', 'package-candidate.yml']) {
  test(`${file} requires isolated local account qualification`, async () => {
    const workflow = await readFile(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8')
    const job = workflow.match(/^  local-account:\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|(?![\s\S]))/m)?.[1]
    assert.ok(job)
    assert.match(job, /timeout-minutes: 5/)
    assert.match(job, /lane: \[store, browser, history-store, history-browser, reference-store, reference-browser\]/)
    assert.match(job, /npm ci/)
    assert.match(job, /npm run build/)
    for (const command of ['test:local-migrations', 'test:local-persistence', 'test:local-identity', 'test:local-session', 'test:local-drafts', 'test:local-journey']) assert.ok(job.includes(command), command)
    assert.match(job, /if: \$\{\{ matrix\.lane == 'store' \}\}[\s\S]*?npm run test:local-backup --workspace @bijux\/ro-crate-web/)
    assert.match(job, /docker compose -p bijuxauthoringaccounts/)
    for (const command of ['test:local-history-unit', 'test:local-history-store', 'test:local-history-browser']) assert.ok(job.includes(command), command)
    assert.match(job, /BIJUX_HISTORY_DISPOSABLE=bijux-history-postgres/)
    assert.match(job, /HISTORY_DATABASE_URL=postgresql:\/\/postgres:history@127\.0\.0\.1:15435\/history/)
    assert.match(job, /docker compose -p bijuxhistory/)
    assert.match(job, /matrix\.lane == 'history-store'/)
    assert.match(job, /matrix\.lane == 'history-browser'/)
    assert.match(job, /if: \$\{\{ matrix\.lane == 'history-store' \}\}[\s\S]*?npm run test:local-history-unit[\s\S]*?npm run test:local-history-store/)
    assert.match(job, /if: \$\{\{ matrix\.lane == 'history-browser' \}\}\n      run: \|\n        npm run test:local-history-browser[^\n]*\n        BIJUX_QUAL_WEB_PORT=14322 BIJUX_QUAL_IDENTITY_PORT=18082 BIJUX_QUAL_DATABASE_PORT=15436 npm run test:local-qualification/)
    assert.match(job, /if test -f artifacts\/history-services\/compose\.yaml; then docker compose -p bijuxhistory .* down -v/)
    for (const command of ['test:local-reference-store', 'test:local-reference-browser']) assert.ok(job.includes(command), command)
    assert.match(job, /BIJUX_SUBMISSION_DISPOSABLE=bijux-submission-postgres/)
    assert.match(job, /BIJUX_REFERENCE_DISPOSABLE=bijux-reference-postgres/)
    assert.match(job, /BIJUX_REFERENCE_CONTAINER=bijuxreferencesubmission-receiver-db/)
    assert.match(job, /SUBMISSION_DATABASE_URL=postgresql:\/\/postgres:reference@127\.0\.0\.1:15440\/reference/)
    assert.match(job, /REFERENCE_DATABASE_URL=postgresql:\/\/postgres:reference@127\.0\.0\.1:15441\/reference/)
    assert.match(job, /matrix\.lane == 'reference-store'/)
    assert.match(job, /matrix\.lane == 'reference-browser'/)
    assert.match(job, /if: \$\{\{ matrix\.lane == 'reference-store' \}\}\n      run: \|\n        BIJUX_SUBMISSION_DISPOSABLE=.*npm run test:local-reference-store/)
    assert.match(job, /if: \$\{\{ matrix\.lane == 'reference-browser' \}\}\n      run: \|\n        BIJUX_REFERENCE_DISPOSABLE=.*npm run test:local-reference-browser/)
    assert.match(job, /postgres:17\.12@sha256:[a-f0-9]{64}/)
    assert.match(job, /docker compose -p bijuxreferencesubmission/)
    assert.match(job, /if docker inspect bijuxreferencesubmission-receiver-db/)
    assert.match(job, /if: \$\{\{ always\(\) \}\}/)
    assert.doesNotMatch(job, /continue-on-error:/)
    assert.match(job, /if: \$\{\{ matrix\.lane == 'browser' \|\| matrix\.lane == 'history-browser' \|\| matrix\.lane == 'reference-browser' \}\}\n      run: bash scripts\/ci\/install-ubuntu-browser\.sh/)
    assert.match(job, /PLAYWRIGHT_BROWSERS_PATH=\$PWD\/artifacts\/playwright/)
    const web = workflow.match(/^  authoring-web:\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|(?![\s\S]))/m)?.[1]
    assert.ok(web?.includes('npm run check --workspace @bijux/ro-crate-web'))
    assert.ok(web?.includes('npm run test --workspace @bijux/ro-crate-web'))
    const admission = file === 'validation.yml' ? 'packages' : 'archives'
    const aggregate = workflow.match(new RegExp(`^  ${admission}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:\\n|(?![\\s\\S]))`, 'm'))?.[1]
    assert.ok(aggregate?.includes('    - local-account\n'))
    assert.ok(aggregate?.includes('    - local-registration\n'))
    const registration = workflow.match(/^  local-registration:\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|(?![\s\S]))/m)?.[1]
    assert.ok(registration)
    assert.match(registration, /timeout-minutes: 5/)
    assert.match(registration, /bash scripts\/ci\/install-ubuntu-browser\.sh/)
    assert.doesNotMatch(registration, /playwright install --with-deps/)

    assert.match(registration, /npm run test:local-registration --workspace @bijux\/ro-crate-web/)
    assert.doesNotMatch(registration, /continue-on-error:/)
  })
}

test('normal app checks own account units and strict server sources', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../apps/web/package.json', import.meta.url), 'utf8')) as {scripts: Record<string,string>}
  assert.match(manifest.scripts.test, /tests\/account\/local-account\.test\.ts/)
  assert.match(manifest.scripts.test, /tests\/conflict-comparison\.test\.ts/)
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

test('owned account job names retain the accepted dependency admission policy', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const script = `
import json, sys
from pathlib import Path
from types import ModuleType
root = Path(sys.argv[1])
path = root / '.github/scripts/workflow_execution/source_loading.py'
source = path.read_bytes()
loader = ModuleType('bijux_workflow_admission')
loader.__file__ = str(path)
exec(compile(source, str(path), 'exec'), loader.__dict__)
policy = loader.load_package(source)
manifest = json.loads((root / '.github/standards/repo-config.manifest.json').read_text())
configuration = next(repo for repo in manifest['repositories'] if repo['name'] == 'bijux-ro-crate-node')['workflow_execution_policy']
for filename in ['validation.yml', 'package-candidate.yml']:
    relative = '.github/workflows/' + filename
    document = policy.parse_workflow((root / relative).read_bytes(), relative)
    policy.validate_owned_execution({relative: document}, configuration)
    if filename != 'validation.yml':
        continue
    document['jobs']['local-account']['name'] = 'Local account / unadmitted'
    try:
        policy.validate_owned_execution({relative: document}, configuration)
    except ValueError as error:
        assert 'admission name prefix missing' in str(error), str(error)
    else:
        raise AssertionError('The policy admitted an unprefixed account job')
`
  const result = spawnSync('python3', ['-B', '-c', script, root], {encoding:'utf8'})
  assert.equal(result.status, 0, result.stderr || String(result.error))
})

test('the required browser journey owns conflict and principal-change coverage', async () => {
  const journey = await readFile(new URL('../../apps/web/tests/account/local-account-journey.test.ts', import.meta.url), 'utf8')
  assert.match(journey, /conflict comparison preserves retained, current and confirmed head/)
  assert.match(journey, /a comparison response from a prior principal cannot replace current state/)
  assert.match(journey, /saving work loaded under another account requires explicit copy consent/)
})

test('local database fixtures wait for authenticated TCP queries before use', async () => {
  for (const file of ['validation.yml', 'package-candidate.yml']) {
    const workflow = await readFile(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8')
    const job = workflow.match(/^  local-account:\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|(?![\s\S]))/m)?.[1]
    assert.ok(job)
    for (const [container, database, password] of [
      ['bijuxauthoring-accounts-test-postgres', 'drafts', 'local-reference'],
      ['bijuxhistory-test-postgres', 'history', 'history'],
      ['bijuxreference-store-db', 'reference', 'reference'],
      ['bijuxreference-store-receiver-db', 'reference', 'reference'],
      ['bijuxreferencesubmission-receiver-db', 'reference', 'reference'],
    ]) assert.ok(job.includes(`docker exec -e PGPASSWORD=${password} ${container} psql -h 127.0.0.1 -U postgres -d ${database} -Atqc 'SELECT 1'`), container)
    assert.doesNotMatch(job, /pg_isready/)
  }
  const compose = await readFile(new URL('../../ops/local-authoring/compose.yaml', import.meta.url), 'utf8')
  assert.match(compose, /PGPASSWORD="\$\$POSTGRES_PASSWORD" psql -h 127\.0\.0\.1 -U "\$\$POSTGRES_USER" -d "\$\$POSTGRES_DB" -Atqc "SELECT 1"/)
})
