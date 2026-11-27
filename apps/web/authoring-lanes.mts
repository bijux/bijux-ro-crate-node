import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

export const authoringLanes = ['core','recovery','entity','specimen','listings'] as const
const boundaryLanes:Readonly<Record<string,string>> = {
  'tests/recovery/failure-guidance.test.ts':'test:e2e:recovery',
  'tests/recovery/account-save-confirmation.test.ts':'test:e2e:recovery',
  'tests/recovery/study-input.test.ts':'test:e2e:recovery',
  'tests/recovery/replacement-safety.test.ts':'test:e2e:recovery',
  'tests/recovery/entity-input.test.ts':'test:e2e:entity',
  'tests/recovery/specimen-label-limit.test.ts':'test:e2e:specimen',
  'tests/files-journey.test.ts':'test:e2e:listings',
  'tests/vocabulary/recovery-limit.test.ts':'test:e2e:listings',
}
const invocation = /^\s*node\s+--import\s+tsx\s+--test(?:\s+--test-concurrency=1)?((?:\s+tests\/[\w./-]+\.test\.ts)+)\s*$/
function files(command:string):string[] | null {
  const result:string[] = []
  for (const part of command.split('&&')) {
    const match = invocation.exec(part)
    if (!match) return null
    result.push(...match[1].trim().split(/\s+/))
  }
  return result
}

/** Ensure CI lanes partition the explicitly registered full browser suite. */
export function authoringLaneProblems(scripts:Readonly<Record<string,string>>):string[] {
  const expected = files(scripts['test:e2e'] ?? '')
  if (!expected || new Set(expected).size !== expected.length) return ['Invalid or duplicated full browser suite']
  const problems:string[] = [], selected:string[] = []
  const declared = Object.keys(scripts).filter(name => name.startsWith('test:e2e:')).sort()
  const names = authoringLanes.map(name => `test:e2e:${name}`).sort()
  if (JSON.stringify(declared) !== JSON.stringify(names)) problems.push('Browser lane scripts do not match the required lanes')
  for (const name of names) {
    const command = scripts[name], lane = command && files(command)
    if (!lane || command.includes('&&')) {problems.push(`Invalid browser lane: ${name}`); continue}
    if ((name === 'test:e2e:recovery' || name === 'test:e2e:listings') && !command.includes('--test-concurrency=1')) problems.push(`Browser lane must serialize large cases: ${name}`)
    if ((name === 'test:e2e:entity' || name === 'test:e2e:specimen') && lane.length !== 1) problems.push(`Browser lane must isolate its large case: ${name}`)
    for (const path of lane) if (boundaryLanes[path] && boundaryLanes[path] !== name) problems.push(`Browser boundary test ${path} must run in ${boundaryLanes[path]}`)
    selected.push(...lane)
  }
  const full = new Set(expected), assigned = new Set(selected)
  for (const path of full) if (!assigned.has(path)) problems.push(`Browser test missing from lanes: ${path}`)
  for (const path of assigned) if (!full.has(path)) problems.push(`Unexpected browser lane test: ${path}`)
  if (assigned.size !== selected.length) problems.push('Browser test assigned more than once')
  return problems
}

async function main() {
  const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url),'utf8')) as {scripts:Record<string,string>}
  const problems = authoringLaneProblems(manifest.scripts)
  if (problems.length) {for (const problem of problems) console.error(problem); process.exitCode = 1}
  else console.log('Authoring browser lanes cover the full suite exactly once.')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
