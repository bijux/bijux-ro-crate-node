import assert from 'node:assert/strict'
import {createWorkspace, reportOf} from '@bijux/ro-crate-core'

const workspace = createWorkspace(new Map([['x', 'value']]))
assert.equal(await workspace.readText('x'), 'value')
assert.equal(workspace.resolveFile('./x'), 'x')
assert.equal(workspace.resolveFile('missing/../x'), null)
assert.equal(reportOf([]).highest_error_level, null)
