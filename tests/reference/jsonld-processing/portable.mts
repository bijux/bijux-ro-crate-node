import assert from 'node:assert/strict'
import {portableCase, type PortableCapture} from '../../parity/normalize.mjs'

type Capture = {imported_module?: unknown; reference_paths?: {pyld_module?: unknown} | null; cases: PortableCapture[]}

/** Keep captured exception frames tied to their pinned module, not its install path. */
export function portableCapture<T extends Capture>(raw: T) {
  const {imported_module: _module, reference_paths: paths, ...result} = raw
  assert.deepEqual(Object.keys(paths ?? {}), ['pyld_module'])
  assert.ok(typeof paths!.pyld_module === 'string' && (paths!.pyld_module as string).startsWith('/') && (paths!.pyld_module as string).endsWith('/pyld/jsonld.py'))
  return {...result, cases: raw.cases.map(item => {
    const row = portableCase(item)
    if (row.exception && paths?.pyld_module)
      row.exception = JSON.parse(JSON.stringify(row.exception), (_key: string, value: unknown) =>
        typeof value === 'string' ? value.replaceAll(paths!.pyld_module as string, 'reference:pyld/jsonld.py') : value)
    return row
  })}
}
