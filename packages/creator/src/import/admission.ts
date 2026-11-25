import {createWorkspace, snapshotFiles} from '@bijux/ro-crate-core'
import type {CrateFiles, CrateValue} from '@bijux/ro-crate-core'
import {identityKey, own} from '../document/state.js'
import type {DraftDocument, EntityKind, EntityView, Relationship, StudyView} from '../document/draft.js'
import {parsePreservingJSON} from './json.js'
import {importManifest} from './manifest.js'
import {contributionFields, contributionTerms, type ContributionKind, type StudyRelationship} from '../document/contributions.js'

export interface ImportOptions {readonly metadataPaths: readonly string[]; readonly maxBytes?: number}
export type ImportResult =
  | {readonly status: 'editable'; readonly draft: DraftDocument; readonly excludedPaths: readonly string[]}
  | {readonly status: 'read-only'; readonly files: ReadonlyMap<string, Uint8Array>; readonly excludedPaths: readonly string[]; readonly issues: readonly string[]}
  | {readonly status: 'rejected'; readonly issues: readonly string[]}
const maxImportBytes = 10 * 1024 * 1024
const descriptor = 'ro-crate-metadata.json'
const asObject = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const relationRules: Record<Relationship, {source: EntityKind | 'study'; target: EntityKind; single?: boolean}> = {
  author:{source:'study',target:'contributor'}, relatedPublication:{source:'study',target:'publication'}, funding:{source:'study',target:'grant'},
  memberOf:{source:'contributor',target:'affiliation'}, funder:{source:'grant',target:'funding-body'},
  organismClassification:{source:'biosample',target:'taxon'},
  biologicalEntity: {source:'specimen', target:'biosample'}, imagingPreparationProtocol: {source:'specimen', target:'preparation-protocol'},
  associatedSpecimen: {source:'dataset', target:'specimen', single:true}, associatedSpecimenImagingPreparationProtocol: {source:'dataset', target:'preparation-protocol'},
  associatedImageAcquisitionProtocol: {source:'dataset', target:'acquisition-protocol'},
}
const terms: Record<string, readonly [string, boolean]> = {
  ...Object.fromEntries(Object.entries(contributionTerms).map(([key, term]) => [key,[term['@id'],term['@container'] === '@set']])),
  name: ['schema:name',false], description: ['schema:description',false], license: ['schema:license',false], hasPart: ['schema:hasPart',true],
  column:['csvw:column',true], columnName:['csvw:name',false], propertyUrl:['csvw:propertyUrl',false], tableSchema:['csvw:tableSchema',false],
  organismClassification:['schema:taxonomicRange',true], scientificName:['http://rs.tdwg.org/dwc/terms/scientificName',false], fbbiId:['bia:fbbiId',true], imagingMethodName:['bia:imagingMethodName',true],
  biologicalEntity: ['bia:sampleOf',true], imagingPreparationProtocol: ['bia:imagingPreparationProtocol',true],
  associatedSpecimen: ['bia:associatedSubject',false], associatedSpecimenImagingPreparationProtocol: ['bia:associatedImagingPreparationProtocol',true],
  associatedImageAcquisitionProtocol: ['bia:associatedImageAcquisitionProtocol',true], imagingInstrumentDescription: ['bia:imagingInstrumentDescription',false],
}
const kinds: Record<string, EntityKind> = {'bia:BioSample':'biosample', 'bia:Taxon':'taxon', 'bia:Specimen':'specimen', 'bia:SpecimenImagingPreparationProtocol':'preparation-protocol', 'bia:ImageAcquisitionProtocol':'acquisition-protocol', 'bia:Dataset':'dataset', 'bia:Contributor':'contributor', 'bia:Affiliation':'affiliation', 'bia:Publication':'publication', 'bia:Grant':'grant', 'bia:FundingBody':'funding-body'}
function expand(iri: string): string {return iri.replace(/^bia:/, 'http://bia/').replace(/^schema:/, 'http://schema.org/')}
function contextSupported(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 2 || value[0] !== 'https://w3id.org/ro/crate/1.1/context') return false
  const context = asObject(value[1])
  if (!context || context.bia !== 'http://bia/') return false
  for (const [key, definition] of Object.entries(context)) {
    if (key === 'bia') continue
    if (key === 'Dataset' || key === 'CreativeWork' || key === 'File' || key === 'Person') {if (definition !== `schema:${key}` && definition !== `http://schema.org/${key}`) return false; continue}
    if (key === 'schema' || key === 'csvw') {if (definition !== (key === 'schema' ? 'http://schema.org/' : 'http://www.w3.org/ns/csvw#')) return false; continue}
    if (key === '@type') {const type = asObject(definition); if (!type || Object.keys(type).length !== 1 || type['@container'] !== '@set') return false; continue}
    if (key.startsWith('@')) return false
    const expected = terms[key]
    const mapping = typeof definition === 'string' ? definition : asObject(definition)?.['@id']
    const object = asObject(definition)
    if (object && Object.keys(object).some(part => part !== '@id' && part !== '@container' && part !== '@type')) return false
    if (expected && (mapping !== expected[0] || (expected[1] && object?.['@container'] !== '@set') || (!expected[1] && object?.['@container'] !== undefined))) return false
    if (!expected && (typeof mapping !== 'string' || mapping.startsWith('@') || ['http://bia/', 'http://schema.org/'].includes(mapping) || Object.values(terms).some(([iri]) => expand(iri) === expand(mapping)))) return false
    if (object?.['@type'] !== undefined && (expected || object['@type'] !== '@json')) return false
    if (object?.['@container'] !== undefined && object['@container'] !== '@set') return false
  }
  return true
}
function identifiers(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(identifiers)
  const item = asObject(value)
  if (!item) return []
  return Object.entries(item).flatMap(([key, nested]) => key === '@id' && typeof nested === 'string' ? [nested] : identifiers(nested))
}
function unsafeNested(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(unsafeNested)
  const item = asObject(value)
  if (!item) return false
  if (Object.hasOwn(item, '@id') && Object.keys(item).length > 1) return true
  if (['@reverse','@included','@nest','@graph'].some(key => Object.hasOwn(item, key))) return true
  return Object.values(item).some(unsafeNested)
}
function containsScopedContext(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsScopedContext)
  const object = asObject(value)
  return object ? Object.entries(object).some(([key, nested]) => key === '@context' || containsScopedContext(nested)) : false
}
function projection(metadata: Record<string, unknown>): {study: StudyView; entities: EntityView[]; ids: string[]} {
  if (!contextSupported(metadata['@context']) || !Array.isArray(metadata['@graph'])) throw Error('Unsupported JSON-LD context or graph')
  const graph = metadata['@graph'].map(asObject)
  if (graph.some(node => !node || typeof node['@id'] !== 'string' || containsScopedContext(node))) throw Error('Unsupported graph node or scoped context')
  const nodes = graph as Record<string, unknown>[]
  const context = (metadata['@context'] as [string, Record<string, unknown>])[1]
  for (const node of nodes) for (const [key, value] of Object.entries(node)) {
    if (unsafeNested(value)) throw Error('Unsupported nested JSON-LD node')
    if (Object.hasOwn(terms, key) && !['name', 'description', 'license', 'hasPart'].includes(key) && !Object.hasOwn(context, key)) throw Error('Unmapped supported property')
    if (!Object.hasOwn(terms, key) && Object.values(terms).some(([iri]) => expand(key) === expand(iri))) throw Error('Ambiguous property alias')
    if (['@reverse', '@included', '@nest', '@graph'].includes(key)) throw Error('Unsupported JSON-LD graph structure')
  }
  const ids = nodes.map(node => node['@id'] as string)
  if (new Set(ids.map(identityKey)).size !== ids.length) throw Error('Duplicate graph identifiers')
  const root = nodes.find(node => node['@id'] === './')
  const document = nodes.find(node => node['@id'] === descriptor)
  const documentTypes = Array.isArray(document?.['@type']) ? document['@type'] : [document?.['@type']]
  if (!root || !document || !documentTypes.includes('CreativeWork') || asObject(document.conformsTo)?.['@id'] !== 'https://w3id.org/ro/crate/1.1' || asObject(document.about)?.['@id'] !== './') throw Error('Unsupported descriptor or study identity')
  const rootTypes = Array.isArray(root['@type']) ? root['@type'] : [root['@type']]
  if (!rootTypes.includes('bia:Study')) throw Error('Root is not a supported study')
  for (const key of ['name','description','license','fundingStatement']) if (root[key] !== undefined && !(key === 'fundingStatement' && root[key] === null) && typeof root[key] !== 'string') throw Error('Unsupported study field')
  if (root.hasPart !== undefined && (!Array.isArray(root.hasPart) || root.hasPart.some(part => typeof asObject(part)?.['@id'] !== 'string'))) throw Error('Unsupported study membership')
  const studyReferences: Partial<Record<StudyRelationship,readonly string[]>> = {}
  for (const key of ['author','relatedPublication','funding'] as const) if (root[key] !== undefined) {
    const refs = root[key]
    if (!Array.isArray(refs) || refs.some(ref => typeof asObject(ref)?.['@id'] !== 'string' || Object.keys(asObject(ref)!).length !== 1)) throw Error('Unsupported study relationship')
    const targets = refs.map(ref => asObject(ref)!['@id'] as string)
    if (new Set(targets).size !== targets.length) throw Error('Duplicate study references')
    if (targets.length) studyReferences[key] = targets
  }
  const study: StudyView = {id:'./', ...(Object.keys(studyReferences).length ? {references:studyReferences} : {}), ...(typeof root.fundingStatement === 'string' ? {fundingStatement:root.fundingStatement} : {}), ...(typeof root.name === 'string' ? {name:root.name} : {}), ...(typeof root.description === 'string' ? {description:root.description} : {}), ...(typeof root.license === 'string' ? {license:root.license} : {})}
  const entities: EntityView[] = []
  for (const node of nodes) {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
    const matched = types.filter(type => typeof type === 'string' && Object.hasOwn(kinds, type)) as string[]
    if (matched.length > 1) throw Error('Ambiguous entity type')
    if (!matched.length || node === root) continue
    const kind = kinds[matched[0]]
    const references: Partial<Record<Relationship, readonly string[]>> = {}
    for (const [key, rule] of Object.entries(relationRules) as Array<[Relationship, typeof relationRules[Relationship]]>) {
      if (rule.source === 'study' || node[key] === undefined) continue
      if (rule.source !== kind) throw Error('Unsupported relationship source')
      const values = rule.single ? [node[key]] : node[key]
      if (!Array.isArray(values) || values.some(value => typeof asObject(value)?.['@id'] !== 'string' || Object.keys(asObject(value)!).length !== 1)) throw Error('Unsupported relationship representation')
      references[key] = values.map(value => asObject(value)!['@id'] as string)
      if (new Set(references[key]).size !== references[key]!.length) throw Error('Duplicate references')
    }
    const fields = Object.hasOwn(contributionFields, kind) ? contributionFields[kind as ContributionKind] : kind === 'taxon' ? ['scientificName'] : kind === 'specimen' ? [] : kind === 'acquisition-protocol' ? ['name','description','imagingInstrumentDescription'] : ['name','description']
    const values: Record<string,string> = {}
    for (const key of fields) {if (node[key] !== undefined && node[key] !== null && typeof node[key] !== 'string') throw Error('Unsupported entity field'); if (typeof node[key] === 'string') values[key] = node[key]}
    if (kind === 'contributor' && node.role !== undefined && (!Array.isArray(node.role) || node.role.some(role => typeof role !== 'string'))) throw Error('Unsupported contributor roles')
    for (const key of ['fbbiId','imagingMethodName'] as const) if (node[key] !== undefined && (kind !== 'acquisition-protocol' || !Array.isArray(node[key]) || node[key].some(item => typeof item !== 'string'))) throw Error('Unsupported imaging terms')
    entities.push({id:node['@id'] as string, kind, references, ...values, ...(Array.isArray(node.fbbiId) ? {fbbiId:[...node.fbbiId] as string[]} : {}), ...(Array.isArray(node.imagingMethodName) ? {imagingMethodName:[...node.imagingMethodName] as string[]} : {}), ...(kind === 'contributor' && Array.isArray(node.role) ? {role:[...node.role] as string[]} : {})})
  }
  for (const entity of entities) for (const [key, ids] of Object.entries(entity.references) as Array<[Relationship, readonly string[]]>) if (ids.some(id => !entities.some(target => target.id === id && target.kind === relationRules[key].target))) throw Error('Unresolved or incompatible relationship')
  for (const [key, targets] of Object.entries(studyReferences) as Array<[StudyRelationship,readonly string[]]>) if (targets.some(id => !entities.some(target => target.id === id && target.kind === relationRules[key].target))) throw Error('Unresolved study relationship')
  return {study, entities, ids: identifiers(metadata['@graph'])}
}
async function bytesOf(value: CrateValue): Promise<Uint8Array> {
  if (typeof value === 'string') {if (!value.isWellFormed()) throw Error('Invalid Unicode text'); return new TextEncoder().encode(value)}
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0))
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer())
  throw Error('Unsupported file value')
}
function byteSize(value: CrateValue): number {
  if (typeof value === 'string') {if (!value.isWellFormed()) throw Error('Invalid Unicode text'); return new TextEncoder().encode(value).length}
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value.byteLength
  if (value instanceof Blob) return value.size
  throw Error('Unsupported file value')
}
export async function importCrate(files: CrateFiles, options: ImportOptions): Promise<ImportResult> {
  return admitCrate(files, options, maxImportBytes)
}

/** Revalidate an edited backup under its separate bounded recovery limit. */
export async function importCrateForRecovery(files: CrateFiles, options: ImportOptions): Promise<ImportResult> {
  return admitCrate(files, options, 16 * 1024 * 1024)
}

async function admitCrate(files: CrateFiles, options: ImportOptions, ceiling: number): Promise<ImportResult> {
  const reject = (issue: string): ImportResult => ({status:'rejected', issues:[issue]})
  try {
    if (!files || typeof files.entries !== 'function' || !options || !Array.isArray(options.metadataPaths)) return reject('A file selection and explicit metadata paths are required')
    const limit = options.maxBytes ?? ceiling
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > ceiling) return reject('Invalid metadata size limit')
    if (files.size > 10000) return reject('Selection exceeds the file count limit')
    const selected: Array<[string, CrateValue]> = []
    for (const entry of files.entries()) {
      if (selected.length >= 10000) return reject('Selection exceeds the file count limit')
      selected.push(entry)
    }
    const workspace = createWorkspace(new Map(selected.map(([path]) => [path, ''])))
    if (selected.length > 10000 || selected.some(([path]) => workspace.resolveFile(path) !== path)) return reject('Selection paths must be canonical and unique')
    if (options.metadataPaths.length > 64) return reject('Metadata selection exceeds the file count limit')
    const paths = [...options.metadataPaths]
    if (paths.length > 64 || new Set(paths).size !== paths.length || !paths.includes(descriptor) || paths.some(path => !files.has(path))) return reject('Metadata selection must include a unique descriptor and existing files')
    if (paths.some(path => !/\.(?:json|jsonld|tsv|csv|txt)$/i.test(path))) return reject('Only selected text metadata formats may be admitted')
    let total = 0
    for (const path of paths) {const value = files.get(path)!; if (typeof value === 'string' && value.length > limit) return reject('Metadata exceeds the size limit'); total += byteSize(value); if (total > limit) return reject('Metadata exceeds the size limit')}
    const snapshot = snapshotFiles(new Map(paths.map(path => [path, files.get(path)!])))
    const admitted = new Map<string, Uint8Array>()
    for (const path of paths) admitted.set(path, await bytesOf(snapshot.get(path)!))
    const excludedPaths = selected.map(([path]) => path).filter(path => !paths.includes(path))
    const readOnly = (issue: string): ImportResult => ({status:'read-only', files:admitted, excludedPaths, issues:[issue]})
    let metadata: Record<string, unknown>
    try {
      for (const bytes of admitted.values()) {
        const content = new TextDecoder('utf-8', {fatal:true}).decode(bytes)
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) return readOnly('Metadata contains binary control characters')
      }
      const text = new TextDecoder('utf-8', {fatal:true}).decode(admitted.get(descriptor)!)
      const parsed = asObject(parsePreservingJSON(text))
      if (!parsed) return readOnly('Descriptor must be a JSON object')
      metadata = parsed
      const model = projection(metadata)
      if (model.ids.includes('file_list.tsv') && !admitted.has('file_list.tsv')) return readOnly('The referenced file list was not admitted')
      const manifest = model.ids.includes('file_list.tsv') ? importManifest(metadata, admitted.get('file_list.tsv')!, model.entities) : undefined
      if (admitted.has('file_list.tsv') && !manifest) return readOnly('File list is not referenced by the descriptor')
      const draft = own({revision:0, study:model.study, entities:model.entities, files:manifest?.files ?? [], nextId:1, source:{files:admitted, metadata, dirty:false, reservedIds:model.ids, ...(manifest ? {manifest:manifest.manifest} : {})}})
      return {status:'editable', draft, excludedPaths}
    } catch (error) {return readOnly(error instanceof Error ? error.message : 'Unsupported metadata')}
  } catch (error) {return reject(error instanceof Error ? error.message : 'Invalid selection')}
}
