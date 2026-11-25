import type {DraftView, EntityView} from '@bijux/ro-crate-creator'

const titles: Record<EntityView['kind'], string> = {
  biosample:'Biosample', taxon:'Taxon', specimen:'Specimen', 'preparation-protocol':'Preparation protocol', 'acquisition-protocol':'Acquisition protocol', dataset:'Dataset',
  contributor:'Contributor', affiliation:'Affiliation', publication:'Publication', grant:'Grant', 'funding-body':'Funding body',
}
export function displayName(entity: EntityView, view: DraftView): string {
  const position = view.entities.filter(item => item.kind === entity.kind).findIndex(item => item.id === entity.id) + 1
  return `${entity.label || entity.name || `${titles[entity.kind]} ${position}`} (${entity.id})`
}
export function recordId(id: string): string {return `scientific-record-${id}`}
export function recordHref(section: ScientificSection, id: string): string {return `#${section}/${encodeURIComponent(id)}`}
export type ScientificSection = 'biosamples' | 'specimens' | 'protocols' | 'datasets' | 'export'
export function sectionFor(entity: EntityView): ScientificSection {
  if (entity.kind === 'biosample') return 'biosamples'
  if (entity.kind === 'specimen') return 'specimens'
  if (entity.kind === 'dataset') return 'datasets'
  if (entity.kind === 'preparation-protocol' || entity.kind === 'acquisition-protocol') return 'protocols'
  return 'export'
}
