// Generated from tests/package/core.mts by npm run generate:runtime; do not edit.
export function coreScenario(core) {
    return { code: `
import assert from 'node:assert/strict'
import {createWorkspace, reportOf} from '${core.name}'
const workspace = createWorkspace(new Map([['x','value']]))
assert.equal(await workspace.readText('x'), 'value')
assert.equal(workspace.resolveFile('./x'), 'x')
assert.equal(workspace.resolveFile('missing/../x'), null)
assert.equal(reportOf([]).highest_error_level,null)
`, nodeTypes: `
import {createWorkspace, fromDirectory} from '${core.name}'
const entry = Object.assign(new Blob(['value']), {name: 'metadata', webkitRelativePath: 'crate/metadata'})
const files = fromDirectory([entry]); const selectedPath: string | null = createWorkspace(files).resolveFile('./metadata'); void selectedPath
`, browserTypes: `
import {createWorkspace, type CrateFiles} from '${core.name}'
const files: CrateFiles = new Map([['x','value']]); const selectedPath: string | null = createWorkspace(files).resolveFile('./x'); void selectedPath
` };
}
