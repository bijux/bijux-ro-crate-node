import {portableCapture} from '../reference/jsonld-processing/portable.mjs'

if (false) {
  const capture = {reference_paths: {pyld_module: '/site/pyld/jsonld.py'}, imported_module: 'source',
    cases: [{name: 'case', exception: null, report: {highest_error_level: null, issues: {}}}], marker: 42 as const}
  const normalized = portableCapture(capture)
  const marker: 42 = normalized.marker
  // @ts-expect-error Installation paths are removed from portable captures.
  normalized.reference_paths
  void marker
}
