import {createWorkspace} from '@bijux/ro-crate-core'
import {inspectDraft, type DraftDocument, type EntityView} from '../document/draft.js'
import {own, stateOf} from '../document/state.js'
import {importCrate, importCrateForRecovery, type ImportResult} from '../import/admission.js'
import {parsePreservingJSON} from '../import/json.js'
import {materializeDraft} from '../serialization/materialize.js'
import {counter, exactKeys, object, sameJSON, validateFreshState} from './validate.js'
import {preservesImportedSource} from './preservation.js'

const backupLimit = 64 * 1024 * 1024
const metadataLimit = 10 * 1024 * 1024
const editedLimit = 16 * 1024 * 1024
export type DecodeResult = {readonly status:'decoded'; readonly draft:DraftDocument} | {readonly status:'read-only'; readonly files:ReadonlyMap<string, Uint8Array>; readonly excludedPaths:readonly string[]; readonly issues:readonly string[]} | {readonly status:'rejected'; readonly issues:readonly string[]}
type EncodedFiles = Array<[string, string]>
function encodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}
function encodedFiles(files: ReadonlyMap<string, Uint8Array>, limit = metadataLimit): EncodedFiles {
  if (files.size > 64 || [...files.values()].reduce((size, bytes) => size + bytes.length, 0) > limit) throw Error('Backup metadata exceeds the size limit')
  return [...files].map(([path, bytes]) => [path, encodeBytes(bytes)])
}
function decodeFiles(value: unknown, limit = metadataLimit): Map<string, Uint8Array> {
  if (!Array.isArray(value) || value.length > 64) throw Error('Invalid backup files')
  const files = new Map<string, Uint8Array>()
  let size = 0
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string' || files.has(pair[0])) throw Error('Invalid backup file entry')
    size += Math.floor(pair[1].length * 3 / 4)
    if (size > limit + 2 * value.length) throw Error('Backup metadata exceeds the size limit')
    const binary = atob(pair[1])
    if (btoa(binary) !== pair[1]) throw Error('Noncanonical backup bytes')
    files.set(pair[0], Uint8Array.from(binary, char => char.charCodeAt(0)))
  }
  return files
}
function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (typeof value === 'string') return new TextEncoder().encode(value)
  throw Error('Unexpected materialized file')
}
function finish(value: unknown): string {
  const result = JSON.stringify(value)
  if (result.length > backupLimit || new TextEncoder().encode(result).length > backupLimit) throw Error('Backup exceeds the size limit')
  return result
}
export function encodeDraft(draft: DraftDocument): string {
  const state = stateOf(draft)
  const view = inspectDraft(draft)
  const snapshot = {study:view.study, entities:view.entities, files:view.files}
  if (!state.source) return finish({version:1, kind:'draft', revision:state.revision, nextId:state.nextId, snapshot})
  const output = materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('Imported draft cannot be materialized')
  const current = new Map([...output.files].map(([path, value]) => [path, asBytes(value)]))
  return finish({version:1, kind:'draft', revision:state.revision, nextId:state.nextId, snapshot, source:{original:encodedFiles(state.source.files), current:encodedFiles(current, editedLimit)}})
}
export function encodeReadOnlyImport(result: Extract<ImportResult, {status:'read-only'}>): string {
  return finish({version:1, kind:'read-only', files:encodedFiles(result.files), excludedPaths:result.excludedPaths})
}
async function admit(files: Map<string, Uint8Array>, edited = false) {
  const result = await (edited ? importCrateForRecovery : importCrate)(files, {metadataPaths:[...files.keys()]})
  if (result.status !== 'editable') throw Error('Backup source is not safely editable')
  return stateOf(result.draft)
}
const byteEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value,index) => value === b[index])
function reconcileImported(snapshot: unknown, projected: {study:unknown; entities:EntityView[]; files:unknown}): EntityView[] | null {
  if (!object(snapshot) || !exactKeys(snapshot, ['study','entities','files']) || !Array.isArray(snapshot.entities)) return null
  const allowed: Record<string, readonly string[]> = {specimen:['biologicalEntity','imagingPreparationProtocol'], dataset:['associatedSpecimen','associatedSpecimenImagingPreparationProtocol','associatedImageAcquisitionProtocol'], biosample:['organismClassification'], taxon:[], 'preparation-protocol':[], 'acquisition-protocol':[], contributor:['memberOf'], affiliation:[], publication:[], grant:['funder'], 'funding-body':[]}
  const normalize = (entities: unknown[]): unknown[] | null => {
    const normalized: unknown[] = []
    for (const entity of entities) {
      if (!object(entity) || typeof entity.kind !== 'string' || !Object.hasOwn(allowed,entity.kind) || !object(entity.references)) return null
      const references: Record<string, unknown> = {}
      for (const [key, targets] of Object.entries(entity.references)) {
        if (!allowed[entity.kind].includes(key) || !Array.isArray(targets)) return null
        if (targets.length) references[key] = targets
      }
      if (entity.label !== undefined && (entity.kind !== 'specimen' || typeof entity.label !== 'string')) return null
      const {label: _label, ...scientific} = entity
      normalized.push({...scientific, references})
    }
    return normalized
  }
  const actual = normalize(snapshot.entities), expected = normalize(projected.entities)
  if (!actual || !expected || !sameJSON({study:snapshot.study, entities:actual, files:snapshot.files}, {study:projected.study, entities:expected, files:projected.files})) return null
  return snapshot.entities as EntityView[]
}
export async function decodeDraft(serialized: string): Promise<DecodeResult> {
  const reject = (issue: string): DecodeResult => ({status:'rejected', issues:[issue]})
  try {
    if (typeof serialized !== 'string' || serialized.length > backupLimit || !serialized.isWellFormed() || new TextEncoder().encode(serialized).length > backupLimit) return reject('Backup exceeds the size limit or is not valid text')
    const value = parsePreservingJSON(serialized)
    if (!object(value) || value.version !== 1) return reject('Unsupported backup format or version')
    if (value.kind === 'read-only') {
      if (!exactKeys(value, ['version','kind','files','excludedPaths']) || !Array.isArray(value.excludedPaths) || value.excludedPaths.length > 10000 || value.excludedPaths.some(path => typeof path !== 'string')) return reject('Invalid read-only backup')
      const files = decodeFiles(value.files)
      const names = [...files.keys(), ...value.excludedPaths as string[]]
      if (new Set(names).size !== names.length) return reject('Duplicate backup paths')
      const workspace = createWorkspace(new Map(names.map(path => [path, ''])))
      if (names.some(path => workspace.resolveFile(path) !== path)) return reject('Invalid backup paths')
      const result = await importCrate(files, {metadataPaths:[...files.keys()]})
      if (result.status === 'rejected') return reject(result.issues.join('; '))
      return {status:'read-only', files, excludedPaths:[...value.excludedPaths as string[]], issues: result.status === 'read-only' ? result.issues : ['Backup was recorded as read-only']}
    }
    if (value.kind !== 'draft' || !exactKeys(value, ['version','kind','revision','nextId','snapshot'], ['source']) || !counter(value.revision, 0) || !counter(value.nextId, 1)) return reject('Invalid backup envelope')
    if (value.source === undefined) return {status:'decoded', draft:own(validateFreshState(value.snapshot, value.revision, value.nextId))}
    if (!object(value.source) || !exactKeys(value.source, ['original','current'])) return reject('Invalid imported source')
    const original = decodeFiles(value.source.original)
    const current = decodeFiles(value.source.current, editedLimit)
    if (original.size !== current.size || [...original.keys()].some(path => !current.has(path))) return reject('Imported file inventory differs')
    const prior = await admit(original)
    const latest = await admit(current, true)
    if (!prior.source || !latest.source) return reject('Missing imported source')
    if (!preservesImportedSource(prior.source, latest.source, value.nextId)) return reject('Imported opaque content was not preserved')
    const projected = {study:latest.study, entities:latest.entities, files:latest.files}
    if (value.nextId > 1 + value.revision + new Set(prior.source.reservedIds).size || (value.revision === 0 && (value.nextId !== 1 || !sameJSON(value.snapshot, projected)))) return reject('Inconsistent imported draft counters or view')
    const entities = reconcileImported(value.snapshot, projected)
    if (!entities) return reject('Draft state differs from its materialized source')
    for (const [path, bytes] of original) if (path !== 'ro-crate-metadata.json' && path !== 'file_list.tsv' && !byteEqual(bytes,current.get(path)!)) return reject('Auxiliary metadata differs')
    const descriptorChanged = !byteEqual(original.get('ro-crate-metadata.json')!,current.get('ro-crate-metadata.json')!)
    const oldManifest = original.get('file_list.tsv'), newManifest = current.get('file_list.tsv')
    const manifestChanged = !!oldManifest && !!newManifest && !byteEqual(oldManifest,newManifest)
    if (value.revision === 0 && (descriptorChanged || manifestChanged)) return reject('Changed imported content has an invalid revision')
    const source = {...latest.source, files:original, dirty:descriptorChanged, reservedIds:[...new Set([...prior.source.reservedIds,...latest.source.reservedIds])], ...(latest.source.manifest ? {manifest:{...latest.source.manifest, dirty:manifestChanged}} : {})}
    const draft = own({...latest, entities, revision:value.revision, nextId:value.nextId, source})
    const output = materializeDraft(draft)
    if (output.status !== 'materialized' || [...current].some(([path, bytes]) => !byteEqual(bytes,asBytes(output.files.get(path))))) return reject('Backup content cannot be reconstructed exactly')
    return {status:'decoded', draft}
  } catch (error) {return reject(error instanceof Error ? error.message : 'Invalid backup')}
}
