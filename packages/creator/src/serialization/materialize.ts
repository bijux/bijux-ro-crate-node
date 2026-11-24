import type {CrateFiles} from '@bijux/ro-crate-core'
import {inspectDraft, type DraftDocument} from '../document/draft.js'

export type MaterializeResult = {readonly status: 'materialized'; readonly revision: number; readonly files: CrateFiles} | {readonly status: 'blocked'; readonly revision: number; readonly issues: readonly {readonly code: string; readonly message: string}[]}
export function materializeDraft(draft: DraftDocument): MaterializeResult {
  const {revision, study} = inspectDraft(draft)
  if (!study) return {status: 'blocked', revision, issues: [{code: 'missing-study', message: 'Add a study before exporting metadata'}]}
  const {id, ...fields} = study
  const metadata = {
    '@context': ['https://w3id.org/ro/crate/1.1/context', {bia: 'http://bia/'}],
    '@graph': [
      {'@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', conformsTo: {'@id': 'https://w3id.org/ro/crate/1.1'}, about: {'@id': id}},
      {'@id': id, '@type': ['Dataset', 'bia:Study'], ...fields},
    ],
  }
  return {status: 'materialized', revision, files: new Map([['ro-crate-metadata.json', JSON.stringify(metadata, null, 2) + '\n']])}
}
