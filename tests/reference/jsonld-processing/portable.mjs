import assert from 'node:assert/strict'
import {portableCase} from '../../parity/normalize.mjs'

/** Keep captured exception frames tied to their pinned module, not its install path. */
export function portableCapture(raw) {
  const {imported_module: _module, reference_paths: paths, ...result} = raw
  assert.deepEqual(Object.keys(paths ?? {}), ['pyld_module'])
  assert.ok(typeof paths.pyld_module === 'string' && paths.pyld_module.startsWith('/') && paths.pyld_module.endsWith('/pyld/jsonld.py'))
  return {...result, cases: raw.cases.map(item => {
    const row = portableCase(item)
    if (row.exception && paths?.pyld_module)
      row.exception = JSON.parse(JSON.stringify(row.exception), (_key, value) =>
        typeof value === 'string' ? value.replaceAll(paths.pyld_module, 'reference:pyld/jsonld.py') : value)
    return row
  })}
}
