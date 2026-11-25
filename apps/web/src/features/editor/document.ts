import {applyChange, createDraft, materializeDraft, type DraftChange, type DraftDocument, type ContributionKind, type StudyRelationship, type ChangeResult} from '@bijux/ro-crate-creator'

export const newEditor = createDraft
export function changeStudy(draft: DraftDocument, change: DraftChange): DraftDocument {
  const result = applyChange(draft, change)
  if (result.status === 'rejected') throw new Error(result.issues.map(issue => issue.message).join('; '))
  return result.draft
}
export function exportMetadata(draft: DraftDocument) {
  const result = materializeDraft(draft)
  if (result.status === 'blocked') return result
  const metadata = result.files.get('ro-crate-metadata.json')
  if (typeof metadata !== 'string') return {status: 'blocked' as const, issues: [{code: 'missing-metadata', message: 'Metadata could not be prepared.'}]}
  return {status: 'materialized' as const, metadata, files: result.files}
}

export function applyEditorChange(draft: DraftDocument, change: DraftChange): ChangeResult {
  return applyChange(draft, change)
}

export function addContribution(draft: DraftDocument, kind: ContributionKind, relationship?: StudyRelationship): ChangeResult {
  const created = applyEditorChange(draft, {type: 'add-entity', kind})
  if (created.status !== 'applied' || !relationship) return created
  const linked = applyEditorChange(created.draft, {type: 'add-reference', sourceId: './', relationship, targetId: created.entityId})
  return linked.status === 'applied' ? {...linked, entityId: created.entityId} : linked
}
