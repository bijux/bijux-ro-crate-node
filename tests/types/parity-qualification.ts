import {qualifyCapture} from '../parity/qualification.mjs'

declare const generalCapture: Parameters<typeof qualifyCapture>[1]
if (false) {
  const qualifiedGeneral = qualifyCapture([], generalCapture)
  const commit: string = qualifiedGeneral.commit
  const corpus: string = qualifiedGeneral.corpus_sha256
  void [commit, corpus]
  const row = {name: 'case', status: 'valid', exception: null, report: {highest_error_level: null, issues: {}}, inputs_sha256: {}}
  const input = {commit: 'commit', corpus_sha256: 'digest', cases: [row] as [typeof row], kind: 'raw' as const, collection_qualification: 'old' as const, extra: 42 as const}
  const qualified = qualifyCapture([], input)
  const extra: 42 = qualified.extra
  const kind: 'qualified-main' = qualified.kind
  const count: number = qualified.collection_qualification.qualified_collection_cases
  // @ts-expect-error Qualification replaces the original kind.
  const oldKind: 'raw' = qualified.kind
  // @ts-expect-error Qualification maps cases into a fresh array, not the original tuple.
  const originalTuple: [typeof row] = qualified.cases
  // @ts-expect-error Qualification replaces any previous qualification field.
  const oldQualification: 'old' = qualified.collection_qualification
  void [extra, kind, count, oldKind, originalTuple, oldQualification]
}
