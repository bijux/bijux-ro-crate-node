<script setup lang="ts">
import {computed, shallowRef, ref, onMounted, onUnmounted, nextTick, watch} from 'vue'
import {applyChanges, inspectDraft, inspectIncomingReferences, type StudyField, type DraftChange, type ChangeResult, type BulkResult, type EntityKind, type ContributionKind, type StudyRelationship} from '@bijux/ro-crate-creator'
import {newEditor, changeStudy, exportMetadata, applyEditorChange, addContribution} from './document'
import ContributorsPanel from './contributions/ContributorsPanel.vue'
import AffiliationsPanel from './contributions/AffiliationsPanel.vue'
import PublicationsPanel from './contributions/PublicationsPanel.vue'
import FundingPanel from './contributions/FundingPanel.vue'
import BiosamplesPanel from './scientific/BiosamplesPanel.vue'
import SpecimensPanel from './scientific/SpecimensPanel.vue'
import ProtocolsPanel from './scientific/ProtocolsPanel.vue'
import DatasetsPanel from './scientific/DatasetsPanel.vue'
import {recordId, sectionFor} from './scientific/records'
import FilesPanel from './files/FilesPanel.vue'
import {applyPreview, type AssignmentPreview, type PendingFile} from './files/inventory'
import type {FileSelection} from './files/selection'
import {editableTermSlot, sameTermSlot, type PendingTerm, type TermSlot} from '../../drafts/pending'
import {zipSync, strToU8} from 'fflate'
import ValidationPanel from './validation/ValidationPanel.vue'
import LiveValidation from './validation/LiveValidation.vue'
import {ValidationCoordinator, type ValidationStatus} from './validation/coordinator'
import {createValidationSession} from './validation/worker'
import {importCrate, type ImportResult} from '@bijux/ro-crate-creator'
import {encodeRecovery, decodeRecovery, RECOVERY_MAX_BYTES, type RecoveryResult} from '../../drafts/recovery-codec'
import {indexedRecoveryStore, type RecoveryStore, type RecoverySummary} from '../../drafts/recovery-store'
import {RecoveryProgress} from '../../drafts/recovery-progress'
import {RecoveryWriter} from '../../drafts/recovery-writer'
import RecoveryPanel from './RecoveryPanel.vue'
import AccountPanel from './account/AccountPanel.vue'
import HistoryPanel from './account/HistoryPanel.vue'
import {useLocalAccount} from './account/use-local-account'

const sections = [
  {id: 'study', label: 'Study details'},
  {id: 'biosamples', label: 'Biosamples'},
  {id: 'specimens', label: 'Specimens'},
  {id: 'protocols', label: 'Protocols'},
  {id: 'datasets', label: 'Datasets'},
  {id: 'files', label: 'Files'},
  {id: 'contributors', label: 'Contributors'},
  {id: 'affiliations', label: 'Affiliations'},
  {id: 'publications', label: 'Publications'},
  {id: 'funding', label: 'Funding'},
  {id: 'validation', label: 'Validate crate'},
  {id: 'recovery', label: 'Local recovery'},
  {id: 'account', label: 'Local account'},
  {id: 'export', label: 'Export metadata'},
] as const
type Section = typeof sections[number]['id']
const activeSection = ref<Section>('study')
const main = ref<HTMLElement | null>(null)
const activeLabel = computed(() => sections.find(section => section.id === activeSection.value)?.label ?? 'Study details')
function syncSection(focus = false) {
  const fragment = window.location.hash.slice(1)
  const slash = fragment.indexOf('/')
  const sectionId = slash < 0 ? fragment : fragment.slice(0, slash)
  const section = sections.find(item => item.id === sectionId)
  activeSection.value = section && (view.value.study || section.id === 'study' || section.id === 'validation' || section.id === 'recovery' || section.id === 'account' || section.id === 'export') ? section.id : 'study'
  let entityId: string | null = null
  if (slash >= 0 && section && activeSection.value === section.id) {
    try {
      const id = decodeURIComponent(fragment.slice(slash + 1))
      const entity = view.value.entities.find(item => item.id === id)
      if (entity && sectionFor(entity) === section.id) entityId = id
    } catch { /* Invalid fragments fall back to the section heading. */ }
  }
  if (focus) void nextTick(() => {
    const target = entityId ? document.getElementById(recordId(entityId)) : null
    if (target) target.focus()
    else main.value?.querySelector<HTMLElement>('.section-heading')?.focus()
  })
}
function onHashChange() {syncSection(true)}
onMounted(() => {syncSection(window.location.hash.includes('/')); window.addEventListener('hashchange', onHashChange)})
onUnmounted(() => window.removeEventListener('hashchange', onHashChange))

const draft = shallowRef(newEditor())
const exportPreview = computed(() => activeSection.value === 'export' ? exportMetadata(draft.value) : null)
const pendingFiles = shallowRef<readonly PendingFile[]>([])
const retryFileSelection = shallowRef<FileSelection | null>(null)
const pendingTerms = shallowRef<readonly PendingTerm[]>([])
const provisionalStudy = shallowRef<Partial<Record<StudyField,string>>>({})
const provisionalFields = computed(() => Object.keys(provisionalStudy.value) as StudyField[])
type EntityTextChange = Extract<DraftChange,{type:'set-field'}> | Extract<DraftChange,{type:'set-label'}> | Extract<DraftChange,{type:'set-roles'}>
type ProvisionalEntityText = {change:EntityTextChange; raw:string; field:string}
const provisionalEntity = shallowRef<Record<string,ProvisionalEntityText>>({})
const entityProvisionalEntries = computed(() => Object.entries(provisionalEntity.value))
const hasProvisionalText = computed(() => provisionalFields.value.length > 0 || entityProvisionalEntries.value.length > 0)
const entityProvisionalIssues = new Map<string,string[]>()
const entityProvisionalMessage = ref('')
const entityTextKey = (id:string, field:string) => JSON.stringify([id,field])
function entityText(id:string, field:string, fallback:string) {return provisionalEntity.value[entityTextKey(id,field)]?.raw ?? fallback}
function clearProvisionalNotices() {
  if (!hasProvisionalText.value) {
    if (recoveryBackupIssue.value === provisionalBackupNotice) recoveryBackupIssue.value = ''
    if (recoveryActionStatus.value === provisionalOpenNotice) recoveryActionStatus.value = ''
  }
}
function removeProvisionalEntity(key:string) {
  if (!Object.hasOwn(provisionalEntity.value,key)) return
  const next = {...provisionalEntity.value}; delete next[key]
  if (issues.value === entityProvisionalIssues.get(key)) issues.value = []
  entityProvisionalIssues.delete(key); entityProvisionalMessage.value = ''; provisionalEntity.value = next
  clearProvisionalNotices()
}
function discardProvisionalEntity(key:string) {if (window.confirm('Discard this unsaved record text?')) removeProvisionalEntity(key)}
function retryProvisionalEntity(key:string) {const item = provisionalEntity.value[key]; if (item) change(item.change,item.raw)}
async function copyProvisionalEntity(key:string) {
  const item = provisionalEntity.value[key]
  if (!item) return
  try {await navigator.clipboard.writeText(JSON.stringify({entityId:item.change.entityId,field:item.field,value:item.raw})); if (provisionalEntity.value[key] === item) entityProvisionalMessage.value = 'Copied record text as JSON.'}
  catch {if (provisionalEntity.value[key] === item) entityProvisionalMessage.value = 'Could not copy record text. Keep this page open and try again.'}
}
const provisionalMessage = ref('')
const provisionalBackupNotice = 'Resolve unsaved text before downloading an editable backup; it is not included.'
const provisionalOpenNotice = 'Resolve unsaved text before opening another draft.'
const provisionalIssues = new Map<StudyField,string[]>()
const studyFieldLabels:Record<StudyField,string> = {name:'Study title',description:'Description',license:'License',fundingStatement:'Funding statement'}
function removeProvisionalStudy(field:StudyField) {
  if (!Object.hasOwn(provisionalStudy.value,field)) return
  const next = {...provisionalStudy.value}; delete next[field]
  if (issues.value === provisionalIssues.get(field)) issues.value = []
  provisionalIssues.delete(field); provisionalMessage.value = ''; provisionalStudy.value = next
  clearProvisionalNotices()
}
function discardProvisionalStudy(field:StudyField) {if (window.confirm(`Discard the unsaved ${studyFieldLabels[field]} text?`)) removeProvisionalStudy(field)}
async function copyProvisionalStudy(field:StudyField) {
  const value = provisionalStudy.value[field]
  if (value === undefined) return
  try {await navigator.clipboard.writeText(JSON.stringify({field,value})); if (provisionalStudy.value[field] === value) provisionalMessage.value = `Copied ${studyFieldLabels[field]} as JSON text.`}
  catch {if (provisionalStudy.value[field] === value) provisionalMessage.value = `Could not copy ${studyFieldLabels[field]}. Keep this page open and try again.`}
}
const recoveryEncoder = new TextEncoder()
let recoveryBudget: {draft:typeof draft.value; files:readonly PendingFile[]; baseBytes:number} | undefined
function termsFitRecovery(terms:readonly PendingTerm[]):boolean {
  if (!recoveryBudget || recoveryBudget.draft !== draft.value || recoveryBudget.files !== pendingFiles.value) {
    const base = encodeRecovery({draft:draft.value,pending:pendingFiles.value})
    recoveryBudget = {draft:draft.value,files:pendingFiles.value,baseBytes:recoveryEncoder.encode(base).length}
  }
  const suffix = `,"pendingTerms":${JSON.stringify(terms)}`
  if (suffix.length > RECOVERY_MAX_BYTES - recoveryBudget.baseBytes) return false
  return recoveryBudget.baseBytes + recoveryEncoder.encode(suffix).length <= RECOVERY_MAX_BYTES
}
let fileAssignmentIssues: string[] | undefined
function applyFiles(preview:AssignmentPreview, selection:ReadonlySet<string>):'accepted' | 'rejected' | 'stale' {
  const result = applyPreview(preview,draft.value,pendingFiles.value,selection)
  if (result.status === 'stale') return 'stale'
  if (!acceptDraft(result.draft,pendingTerms.value,result.pending,hasProvisionalText.value)) {fileAssignmentIssues = issues.value; return 'rejected'}
  if (issues.value === fileAssignmentIssues) issues.value = []
  fileAssignmentIssues = undefined
  pendingFiles.value = result.pending
  return 'accepted'
}
const listingRecoveryIssue = 'These file listings would prevent unfinished vocabulary input from being recovered. Apply or discard it first.'
const listingProvisionalIssue = 'These file listings would prevent the draft from being recovered. Unsaved text remains open.'
function setPendingFiles(next:readonly PendingFile[]) {
  if (pendingTerms.value.length || hasProvisionalText.value) {
    try {encodeRecovery({draft:draft.value,pending:next,pendingTerms:pendingTerms.value})}
    catch {issues.value = [pendingTerms.value.length ? listingRecoveryIssue : listingProvisionalIssue]; reviewOpen.value = true; return false}
  }
  pendingFiles.value = next
  if (issues.value.length === 1 && (issues.value[0] === listingRecoveryIssue || issues.value[0] === listingProvisionalIssue)) issues.value = []
  return true
}
const view = computed(() => inspectDraft(draft.value))
const validationStatus = shallowRef<ValidationStatus>({state: 'blocked', eligible: false})
const payload = shallowRef<ReadonlyMap<string, Blob>>(new Map())
const missingPayload = computed(() => view.value.files.filter(file => !payload.value.has(file.path)).length)
let validation: ValidationCoordinator | undefined
onMounted(() => {
  validation = new ValidationCoordinator(createValidationSession(), status => {validationStatus.value = status})
  refreshValidation()
})
function refreshValidation() {
  if (!validation) return
  if (hasProvisionalText.value) validation.block('Resolve unsaved text before validation.')
  else if (pendingTerms.value.length) validation.block('Apply or discard pending vocabulary input before validation.')
  else if (pendingFiles.value.length) validation.block('Assign or remove pending file listings before validation.')
  else validation.update(draft.value, payload.value)
}
watch([draft, pendingFiles, pendingTerms, provisionalStudy, provisionalEntity], refreshValidation, {flush: 'sync'})
onUnmounted(() => validation?.dispose())
function selectPayload(files: ReadonlyMap<string, Blob>) {payload.value = new Map(files); refreshValidation()}
function rejectPayloadSelection(message: string) {payload.value = new Map(); validation?.block(message)}
function continueValidated() {
  if (!validation) return
  try {
    const snapshot = validation.continue()
    const metadata = snapshot.files.get('ro-crate-metadata.json')
    if (metadata === undefined) throw new Error('Validated metadata is missing')
    const bytes = metadata instanceof Uint8Array ? new Uint8Array(metadata) : metadata
    const blob = new Blob([bytes], {type: 'application/ld+json'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'ro-crate-metadata.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (error) {issues.value = [String(error)]; reviewOpen.value = true}
}
const recoveryRecords = shallowRef<readonly RecoverySummary[]>([])
const recoveryListIssue = ref('')
let recoveryListRequest = 0
const recoveryStatus = ref('Recovery is starting.')
const visibleRecoveryStatus = computed(() => hasProvisionalText.value ? 'Unsaved text is not included in browser recovery. Earlier admitted work may still be saved.' : recoveryStatus.value)
const recoveryActionStatus = ref('')
function reportRecoveryAction(action:number, message:string) {if (currentRecoverySelection(action)) recoveryActionStatus.value = message}
const recoveryDeleteStatus = ref('')
const recoveryBackupIssue = ref('')
const exportIssue = ref('')
const recoveryDeleteBusy = ref(false)
const recoveryProgress = new RecoveryProgress(status => {recoveryStatus.value = status})
const readOnlyMessage = ref('')
const readOnlyBackup = ref('')
let recoverySelection = 0
let recoveryObservation = 0
// Replacement intent invalidates older downloads; downloads never cancel a pending replacement.
function beginRecoverySelection() {recoveryActionStatus.value = ''; recoveryObservation++; return ++recoverySelection}
function currentRecoverySelection(selection:number) {return selection === recoverySelection}
function beginRecoveryObservation() {recoveryActionStatus.value = ''; return {selection:recoverySelection, observation:++recoveryObservation}}
function currentRecoveryObservation(action:{selection:number; observation:number}) {return currentRecoverySelection(action.selection) && action.observation === recoveryObservation}
function reportRecoveryObservation(action:{selection:number; observation:number}, message:string) {if (currentRecoveryObservation(action)) recoveryActionStatus.value = message}
let recoveryStore: RecoveryStore | undefined
let recoveryWriter: RecoveryWriter | undefined
let recoveryTimer: ReturnType<typeof setTimeout> | undefined
let changed = false
function guardNavigation(event: BeforeUnloadEvent) {if (changed || hasProvisionalText.value) {event.preventDefault(); event.returnValue = ''}}
async function refreshRecoveryRecords() {
  if (!recoveryStore) return
  const request = ++recoveryListRequest
  try {
    const records = await recoveryStore.list()
    if (request === recoveryListRequest) {recoveryRecords.value = records; recoveryListIssue.value = ''}
  } catch (error) {
    if (request === recoveryListRequest) recoveryListIssue.value = `Recovery copies could not be listed: ${String(error)}`
  }
}
function onRecoveryFocus() {if (activeSection.value === 'recovery') void refreshRecoveryRecords()}
watch(activeSection, section => {if (section === 'recovery') void refreshRecoveryRecords()})
onMounted(async () => {
  window.addEventListener('beforeunload', guardNavigation)
  window.addEventListener('focus', onRecoveryFocus)
  try {
    recoveryWriter = new RecoveryWriter(crypto.randomUUID(), () => crypto.randomUUID())
    recoveryStore = indexedRecoveryStore(indexedDB)
    await refreshRecoveryRecords()
    if (recoveryProgress.current() === 0) recoveryStatus.value = recoveryListIssue.value || 'Changes will be saved as a separate recovery copy in this browser.'
  } catch (error) {if (recoveryProgress.current() === 0) recoveryStatus.value = `Browser recovery unavailable: ${String(error)}. Download a backup to keep your work.`}
})
onUnmounted(() => {window.removeEventListener('beforeunload', guardNavigation); window.removeEventListener('focus', onRecoveryFocus); clearTimeout(recoveryTimer)})
function scheduleRecovery() {
  changed = true
  const generation = recoveryProgress.changed()
  clearTimeout(recoveryTimer)
  recoveryTimer = setTimeout(() => {
    let backup: string
    try {backup = encodeRecovery({draft:draft.value, pending:pendingFiles.value, pendingTerms:pendingTerms.value})}
    catch (error) {recoveryProgress.failed(generation,error); return}
    if (!recoveryStore || !recoveryWriter) {recoveryProgress.failed(generation, Error('Browser storage is unavailable')); return}
    void recoveryWriter.save(recoveryStore, backup).then(() => {
      recoveryProgress.saved(generation)
      void refreshRecoveryRecords()
    }).catch(error => {recoveryProgress.failed(generation,error); void refreshRecoveryRecords()})
  }, 500)
}
watch([draft, pendingFiles, pendingTerms], scheduleRecovery, {flush:'sync'})
function saveText(text:string, name:string) {
  const url = URL.createObjectURL(new Blob([text], {type:'application/json'}))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
function downloadBackup() {
  if (hasProvisionalText.value) {recoveryBackupIssue.value = provisionalBackupNotice; return}
  beginRecoveryObservation()
  recoveryBackupIssue.value = ''
  try {saveText(encodeRecovery({draft:draft.value,pending:pendingFiles.value,pendingTerms:pendingTerms.value}), 'study-backup.json')}
  catch (error) {recoveryBackupIssue.value = `Backup could not be created: ${String(error)}. Your work remains open. This is the result of the last editable-backup attempt.`}
}
function downloadReadOnly() {
  const action = beginRecoveryObservation()
  try {if (readOnlyBackup.value) saveText(readOnlyBackup.value, 'read-only-backup.json')}
  catch (error) {reportRecoveryObservation(action, `Read-only backup could not be created: ${String(error)}. Your work remains open.`)}
}
async function adoptRecovery(result:RecoveryResult, original:string, options?:boolean | {message?:string; verify?:()=>Promise<boolean>}, action = beginRecoverySelection()) {
  if (!currentRecoverySelection(action)) return false
  if (hasProvisionalText.value) {reportRecoveryAction(action, provisionalOpenNotice); return false}
  if (result.status === 'rejected') {reportRecoveryAction(action, `Recovery rejected: ${result.issues.join('; ')}`); return false}
  if (result.status === 'read-only') {
    readOnlyBackup.value = original
    readOnlyMessage.value = `This backup is read-only: ${result.issues.join('; ')}. The current study remains open; download the read-only backup below.`
    return false
  }
  const settings = typeof options === 'object' ? options : undefined
  if (options !== true && !window.confirm(settings?.message ?? 'Replace the current study with this recovery copy? Download the current backup first if needed.')) return false
  if (settings?.verify && !await settings.verify()) {reportRecoveryAction(action, 'The account or draft changed. Your current work remains open.'); return false}
  if (!currentRecoverySelection(action) || hasProvisionalText.value) return false
  retryFileSelection.value = null
  if (issues.value.length === 1 && (issues.value[0] === listingRecoveryIssue || issues.value[0] === listingProvisionalIssue)) issues.value = []
  validation?.block('Recovery replaced the current draft. Select image files again.')
  account.resetBinding()
  payload.value = new Map()
  pendingFiles.value = result.pending
  pendingTerms.value = result.pendingTerms
  draft.value = result.draft
  readOnlyMessage.value = ''; readOnlyBackup.value = ''
  reportRecoveryAction(action, 'Recovery opened. Image files need to be selected again.')
  return true
}
async function downloadRecord(summary:RecoverySummary) {
  const action = beginRecoveryObservation()
  try {
    if (!recoveryStore) throw Error('Browser storage is unavailable')
    const record = await recoveryStore.read(summary.id, summary.revision)
    if (!currentRecoveryObservation(action)) return
    saveText(record.backup, 'recovery-copy.json')
    reportRecoveryObservation(action, 'Recovery copy downloaded. Your current work remains open.')
  } catch (error) {reportRecoveryObservation(action, `Recovery copy could not be downloaded: ${String(error)}`); await refreshRecoveryRecords()}
}
async function restoreRecord(summary:RecoverySummary) {
  const action = beginRecoverySelection()
  try {
    if (!recoveryStore) throw Error('Browser storage is unavailable')
    const record = await recoveryStore.read(summary.id,summary.revision)
    await adoptRecovery(await decodeRecovery(record.backup),record.backup,undefined,action)
  } catch (error) {reportRecoveryAction(action, `Recovery copy could not be opened: ${String(error)}`); await refreshRecoveryRecords()}
}
async function removeRecord(record:RecoverySummary) {
  if (recoveryDeleteBusy.value || !window.confirm('Delete this recovery copy? This cannot be undone.')) return
  recoveryDeleteBusy.value = true
  beginRecoveryObservation()
  const generation = recoveryProgress.current()
  recoveryDeleteStatus.value = ''
  try {
    if (!recoveryStore || !recoveryWriter) throw Error('Browser storage is unavailable')
    const removedCurrent = await recoveryWriter.remove(recoveryStore, record)
    if (removedCurrent) recoveryProgress.removedCurrent(generation)
    await refreshRecoveryRecords()
    recoveryDeleteStatus.value = 'Recovery copy deleted.'
  } catch (error) {recoveryDeleteStatus.value = `Recovery copy could not be deleted: ${String(error)}`; await refreshRecoveryRecords()}
  finally {recoveryDeleteBusy.value = false}
}
async function reopenBackup(file:File) {
  const action = beginRecoverySelection()
  try {
    if (file.size > RECOVERY_MAX_BYTES) throw Error('Backup exceeds the size limit')
    const text = new TextDecoder('utf-8', {fatal:true}).decode(await file.arrayBuffer())
    await adoptRecovery(await decodeRecovery(text), text,undefined,action)
  } catch (error) {reportRecoveryAction(action, `Backup could not be opened: ${String(error)}`)}
}
async function importMetadata(files:File[]) {
  const action = beginRecoverySelection()
  try {
    if (files.length > 64 || files.reduce((total,file) => total + file.size,0) > 10 * 1024 * 1024) throw Error('Metadata selection exceeds the import limit')
    if (new Set(files.map(file => file.name)).size !== files.length) throw Error('Metadata filenames must be unique')
    const data = new Map(await Promise.all(files.map(async file => [file.name,new Uint8Array(await file.arrayBuffer())] as const)))
    const result:ImportResult = await importCrate(data, {metadataPaths:[...data.keys()]})
    if (!currentRecoverySelection(action)) return
    if (result.status === 'rejected') {reportRecoveryAction(action, `Import rejected: ${result.issues.join('; ')}`); return}
    if (result.status === 'read-only') {
      const backup = encodeRecovery({readOnly:result,pending:[]})
      await adoptRecovery(await decodeRecovery(backup),backup,undefined,action)
      return
    }
    const backup = encodeRecovery({draft:result.draft,pending:[]})
    await adoptRecovery(await decodeRecovery(backup),backup,undefined,action)
  } catch (error) {reportRecoveryAction(action, `Metadata could not be imported: ${String(error)}`)}
}
const accountEditGeneration = ref(0)
watch([draft, pendingFiles, pendingTerms, payload, provisionalStudy, provisionalEntity], () => {accountEditGeneration.value++}, {flush:'sync'})
const accountGeneration = () => accountEditGeneration.value
const accountCapture = () => {if (hasProvisionalText.value) throw Error('Resolve unsaved text before saving or comparing drafts.'); return encodeRecovery({draft:draft.value, pending:pendingFiles.value, pendingTerms:pendingTerms.value})}
const historyBusy = ref(false)
const props = defineProps<{localReferenceEnabled:boolean}>()
const editorReady = ref(false)
onMounted(() => {editorReady.value = true})
const account = useLocalAccount({
  beginRecoverySelection,
  currentRecoverySelection,
  capture:accountCapture,
  adopt:adoptRecovery,
  readOnly:(message, backup) => {readOnlyMessage.value = message; readOnlyBackup.value = backup},
  download:saveText,
}, props.localReferenceEnabled)
const {accountAvailable, accountIdentity, accountDrafts, accountNextCursor, accountPreviousPage, accountBinding, accountStatus, accountBusy, accountPending, accountComparison, changeDraftPage,
  refreshAccount, signInLocally, signOutLocally, saveAccount, openAccountDraft, downloadPendingSave, discardPendingSave,
  comparePendingSave, recoverRetained, openConfirmedHead, saveCurrentCopy, downloadCurrentComparison, downloadHeadComparison, closeComparison} = account
watch([draft, pendingFiles, pendingTerms, provisionalStudy, provisionalEntity], account.noteEdit, {flush:'sync'})
const dependencies = computed(() => new Map(view.value.entities.map(entity => [entity.id, inspectIncomingReferences(draft.value,entity.id)])))
const issues = ref<string[]>([])
const reviewOpen = ref(false)
function createStudy() {
  try {acceptDraft(changeStudy(draft.value, {type: 'add-study'}),pendingTerms.value)}
  catch (error) {issues.value = [String(error)]}
}
function applyStudyText(field:StudyField, value:string) {
  try {
    if (acceptDraft(changeStudy(draft.value, {type:'set-field', entityId:'./', field, value:value || null}),pendingTerms.value,pendingFiles.value,hasProvisionalText.value)) {
      removeProvisionalStudy(field); issues.value = []; return
    }
  } catch (error) {issues.value = [String(error)]; reviewOpen.value = true}
  provisionalIssues.set(field,issues.value)
  provisionalMessage.value = ''
  provisionalStudy.value = {...provisionalStudy.value,[field]:value}
}
function setField(field:StudyField, event:Event) {applyStudyText(field,(event.target as HTMLInputElement | HTMLTextAreaElement).value)}
function retryProvisionalStudy(field:StudyField) {const value = provisionalStudy.value[field]; if (value !== undefined) applyStudyText(field,value)}
function acceptDraft(next:typeof draft.value, remaining:readonly PendingTerm[], files:readonly PendingFile[] = pendingFiles.value, checkRecovery = false):boolean {
  if (remaining.length || checkRecovery) {
    const candidate = inspectDraft(next)
    if (remaining.some(term => !editableTermSlot(candidate,term))) {issues.value = ['Apply or discard affected unfinished vocabulary input before changing this record.']; reviewOpen.value = true; return false}
    try {encodeRecovery({draft:next,pending:files,pendingTerms:remaining})}
    catch {issues.value = [remaining.length ? 'This change would prevent the draft from being recovered. The unfinished vocabulary input remains open.' : 'This change would prevent the draft from being recovered.']; reviewOpen.value = true; return false}
  }
  draft.value = next
  return true
}
function receive(result: ChangeResult | BulkResult, resolved?:TermSlot):boolean {
  if (result.status === 'applied') {
    const remaining = resolved ? pendingTerms.value.filter(item => !sameTermSlot(item,resolved)) : pendingTerms.value
    if (!acceptDraft(result.draft,remaining,pendingFiles.value,!!resolved || hasProvisionalText.value)) return false
    if (resolved) pendingTerms.value = remaining
    issues.value = []; return true
  }
  const count = 'references' in result ? result.references?.length ?? 0 : 0
  issues.value = result.issues.map(issue => issue.message + (count ? ` (${count} reference${count === 1 ? '' : 's'}).` : ''))
  reviewOpen.value = true
  return false
}
function setPendingTerm(term:PendingTerm) {
  if (!editableTermSlot(view.value,term)) {issues.value = ['This vocabulary field is no longer editable.']; reviewOpen.value = true; return}
  const existing = pendingTerms.value.findIndex(item => sameTermSlot(item,term))
  if (existing < 0 && pendingTerms.value.length >= 1000) {issues.value = ['Apply or discard an unfinished vocabulary entry before adding another.']; reviewOpen.value = true; return}
  const next = existing < 0 ? [...pendingTerms.value,term] : pendingTerms.value.map((item,index) => index === existing ? term : item)
  try {if (!termsFitRecovery(next)) throw Error('Recovery limit exceeded')}
  catch {issues.value = ['This vocabulary input exceeds the available recovery space. Apply or discard existing input before continuing.']; reviewOpen.value = true; return}
  pendingTerms.value = next
}
function discardTerm(slot:TermSlot) {pendingTerms.value = pendingTerms.value.filter(item => !sameTermSlot(item,slot))}
function applyTerm(change:DraftChange, slot:TermSlot) {
  const result = applyEditorChange(draft.value,change)
  receive(result,slot)
}
function change(command:DraftChange, raw?:string) {
  if (command.type === 'delete-entity' && entityProvisionalEntries.value.some(([,item]) => item.change.entityId === command.entityId)) {
    issues.value = ['Resolve unsaved text for this record before deleting it.']; reviewOpen.value = true; return
  }
  if (raw !== undefined && (command.type === 'set-field' || command.type === 'set-label' || command.type === 'set-roles')) {
    const field = command.type === 'set-label' ? 'label' : command.type === 'set-roles' ? 'roles' : command.field
    const key = entityTextKey(command.entityId,field)
    try {if (receive(applyEditorChange(draft.value,command))) {removeProvisionalEntity(key); return}}
    catch (error) {issues.value = [String(error)]; reviewOpen.value = true}
    entityProvisionalIssues.set(key,issues.value); entityProvisionalMessage.value = ''
    provisionalEntity.value = {...provisionalEntity.value,[key]:{change:command,field,raw}}
    return
  }
  receive(applyEditorChange(draft.value,command))
}
function addScientific(kind: EntityKind) {receive(applyEditorChange(draft.value,{type:'add-entity',kind}))}
function batch(changes: readonly DraftChange[]) {
  if (changes.some(command => command.type === 'delete-entity' && entityProvisionalEntries.value.some(([,item]) => item.change.entityId === command.entityId))) {
    issues.value = ['Resolve unsaved text for this record before deleting it.']; reviewOpen.value = true; return
  }
  receive(applyChanges(draft.value,changes))
}
function add(kind: ContributionKind, relationship?: StudyRelationship) {receive(addContribution(draft.value, kind, relationship))}
async function download() {
  exportIssue.value = ''
  if (hasProvisionalText.value) {exportIssue.value = 'Resolve unsaved text before exporting metadata.'; return}
  try {
    if (pendingTerms.value.length) {issues.value = ['Apply or discard unfinished vocabulary input before export.']; reviewOpen.value = true; return}
    const result = exportMetadata(draft.value)
    if (result.status === 'blocked') {issues.value = result.issues.map(issue => issue.message); reviewOpen.value = true; return}
    if (pendingFiles.value.length) {issues.value = ['Assign or remove all pending file listings before export.']; reviewOpen.value = true; return}
    const entries = [...result.files.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
    const multi = entries.length > 1
    const archiveEntries = await Promise.all(entries.map(async ([path, data]) => [path, typeof data === 'string' ? strToU8(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data)] as const))
    const bytes = multi ? new Uint8Array(zipSync(Object.fromEntries(archiveEntries), {mtime: new Date(1980, 0, 1)})) : result.metadataBytes
    const url = URL.createObjectURL(new Blob([bytes], {type: multi ? 'application/zip' : 'application/ld+json'}))
    const link = document.createElement('a')
    link.href = url; link.download = multi ? 'ro-crate-metadata.zip' : 'ro-crate-metadata.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (error) {exportIssue.value = `Metadata export could not be created: ${String(error)}. Your work remains open.`}
}
</script>

<template>
  <div class="application">
    <nav class="vf-navigation vf-navigation--main application-navigation" aria-label="Mobile study sections">
      <div class="vf-body">
        <ul class="vf-navigation__list vf-list application-navigation__list">
          <li v-for="section in sections.filter(item => view.study || item.id === 'study' || item.id === 'validation' || item.id === 'recovery' || item.id === 'account' || item.id === 'export')" :key="section.id" class="vf-navigation__item"><a class="vf-navigation__link" :href="`#${section.id}`" :aria-current="activeSection === section.id ? 'page' : undefined">{{ section.label }}</a></li>
        </ul>
      </div>
    </nav>
    <div class="vf-body workspace">
      <aside class="workspace-navigation" aria-label="Study navigation">
        <h2>Study editor</h2>
        <p>Describe your study and prepare its metadata.</p>
        <nav aria-label="Study sections">
          <ul class="vf-list">
            <li v-for="section in sections.filter(item => view.study || item.id === 'study' || item.id === 'validation' || item.id === 'recovery' || item.id === 'account' || item.id === 'export')" :key="section.id"><a class="vf-link" :class="{'current-section': activeSection === section.id}" :href="`#${section.id}`" :aria-current="activeSection === section.id ? 'page' : undefined">{{ section.label }}</a></li>
          </ul>
        </nav>
        <div class="workspace-note"><strong>Working locally</strong><p>Recovery copies stay in this browser. Download a full backup to keep another copy.</p></div>
      </aside>
      <main ref="main" class="vf-content workspace-main">
        <LiveValidation v-if="view.study && activeSection !== 'validation'" :status="validationStatus" />
        <nav class="workspace-breadcrumb" aria-label="Breadcrumb"><ol class="vf-list"><li><a class="vf-link" href="#study">Workspace</a></li><li aria-hidden="true">/</li><li aria-current="page">{{ activeLabel }}</li></ol></nav>
        <h1 v-if="view.study">{{ view.study.name || 'Untitled study' }}</h1>
        <h1 v-else>Create a study</h1>
        <p v-if="!view.study">Start with the title, description and license for your study.</p>
        <p v-else>Describe the research behind your data.</p>
        <div class="local-status"><strong>Local recovery</strong><p role="status">{{ visibleRecoveryStatus }}</p><p v-if="recoveryActionStatus" role="status">{{ recoveryActionStatus }}</p></div>
        <section v-if="provisionalFields.length" aria-labelledby="unsaved-study-title" role="alert">
          <h2 id="unsaved-study-title">Unsaved study text</h2>
          <p>This text is not in browser recovery, backups, validation, account saves or metadata export. Keep this page open; closing it can lose the text. Copy it as JSON, retry, or discard it.</p>
          <ul><li v-for="field in provisionalFields" :key="field">{{ studyFieldLabels[field] }}
            <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="retryProvisionalStudy(field)">Retry {{ studyFieldLabels[field] }}</button>
            <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="copyProvisionalStudy(field)">Copy {{ studyFieldLabels[field] }} as JSON</button>
            <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="discardProvisionalStudy(field)">Discard {{ studyFieldLabels[field] }}</button>
          </li></ul><p v-if="provisionalMessage" role="status">{{ provisionalMessage }}</p>
        </section>
        <section v-if="entityProvisionalEntries.length" aria-labelledby="unsaved-record-title" role="alert">
          <h2 id="unsaved-record-title">Unsaved record text</h2>
          <p>This text is not in browser recovery, backups, validation, account saves or metadata export. Keep this page open; closing it can lose the text. Copy it as JSON, retry, or discard it.</p>
          <ul><li v-for="[key,item] in entityProvisionalEntries" :key="key">{{ item.field }} — {{ item.change.entityId }}
            <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="retryProvisionalEntity(key)">Retry {{ item.field }} for {{ item.change.entityId }}</button>
            <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="copyProvisionalEntity(key)">Copy {{ item.field }} for {{ item.change.entityId }} as JSON</button>
            <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="discardProvisionalEntity(key)">Discard {{ item.field }} for {{ item.change.entityId }}</button>
          </li></ul><p v-if="entityProvisionalMessage" role="status">{{ entityProvisionalMessage }}</p>
        </section>
        <section v-if="activeSection === 'study' && !view.study" class="study-section">
          <h2 class="section-heading" tabindex="-1">Study details</h2>
          <p>Create a study to add its metadata.</p>
          <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" :disabled="!editorReady" @click="createStudy">Create study</button>
        </section>
        <section v-else-if="activeSection === 'study' && view.study" class="study-section" aria-labelledby="details-title">
          <h2 id="details-title" class="section-heading" tabindex="-1">Study details</h2>
          <p>These details help others understand your research.</p>
          <div class="vf-form__item"><label class="vf-form__label" for="title">Study title</label><p id="title-help" class="vf-form__helper">What are you investigating?</p><input id="title" class="vf-form__input" :value="provisionalStudy.name ?? view.study.name ?? ''" aria-describedby="title-help" placeholder="e.g. Imaging cell division in zebrafish" @input="setField('name', $event)" /></div>
          <div class="vf-form__item"><label class="vf-form__label" for="description">Description</label><p id="description-help" class="vf-form__helper">A short, useful overview of the study.</p><textarea id="description" class="vf-form__input" rows="5" :value="provisionalStudy.description ?? view.study.description ?? ''" aria-describedby="description-help" @input="setField('description', $event)"></textarea></div>
          <div class="vf-form__item"><label class="vf-form__label" for="license">License</label><p id="license-help" class="vf-form__helper">Use a license URL if you have one.</p><input id="license" class="vf-form__input" :value="provisionalStudy.license ?? view.study.license ?? ''" aria-describedby="license-help" placeholder="https://creativecommons.org/licenses/by/4.0/" @input="setField('license', $event)" /></div>
          <div class="vf-form__item"><label class="vf-form__label" for="funding-statement">Funding statement</label><p id="funding-statement-help" class="vf-form__helper">Describe support for the study, if applicable.</p><textarea id="funding-statement" class="vf-form__input" rows="3" :value="provisionalStudy.fundingStatement ?? view.study.fundingStatement ?? ''" aria-describedby="funding-statement-help" @input="setField('fundingStatement', $event)"></textarea></div>
        </section>
        <template v-if="view.study">
          <BiosamplesPanel :entity-text="entityText" v-if="activeSection === 'biosamples'" :view="view" :references="dependencies" :pending-terms="pendingTerms" @pending="setPendingTerm" @discard="discardTerm" @apply-term="applyTerm" @change="change" @add="addScientific" />
          <SpecimensPanel :entity-text="entityText" v-if="activeSection === 'specimens'" :view="view" :references="dependencies" @change="change" @add="addScientific" />
          <ProtocolsPanel :entity-text="entityText" v-if="activeSection === 'protocols'" :view="view" :references="dependencies" :pending-terms="pendingTerms" @pending="setPendingTerm" @discard="discardTerm" @apply-term="applyTerm" @change="change" @add="addScientific" />
          <DatasetsPanel :entity-text="entityText" v-if="activeSection === 'datasets'" :view="view" :references="dependencies" @change="change" @batch="batch" @add="addScientific" />
          <FilesPanel v-if="activeSection === 'files'" :draft="draft" :view="view" :pending="pendingFiles" :retry-selection="retryFileSelection" :admit-pending="setPendingFiles" :apply-assignment="applyFiles" @retry-selection="retryFileSelection = $event" @pending="setPendingFiles" />
          <ContributorsPanel :entity-text="entityText" v-if="activeSection === 'contributors'" :view="view" @change="change" @add="add" />
          <AffiliationsPanel :entity-text="entityText" v-if="activeSection === 'affiliations'" :view="view" @change="change" @add="add" />
          <PublicationsPanel :entity-text="entityText" v-if="activeSection === 'publications'" :view="view" @change="change" @add="add" />
          <FundingPanel :entity-text="entityText" v-if="activeSection === 'funding'" :view="view" @change="change" @add="add" />
        </template>
        <ValidationPanel v-if="activeSection === 'validation'" :status="validationStatus" :missing-payload="missingPayload" :listed-payload="view.files.length" @selection="selectPayload" @selection-error="rejectPayloadSelection" @continue="continueValidated" />
        <div v-if="pendingTerms.length" role="status"><p>{{ pendingTerms.length }} unfinished vocabulary entr{{ pendingTerms.length === 1 ? 'y' : 'ies' }}. Apply or discard before validation or export.</p><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="pendingTerms = []">Discard all unfinished vocabulary input</button></div>
        <AccountPanel v-if="activeSection === 'account' && !hasProvisionalText" :available="accountAvailable" :signed-in="!!accountIdentity" :busy="accountBusy || historyBusy" :status="accountStatus" :pending="accountPending" :comparison="accountComparison" :drafts="accountDrafts" :current-id="accountBinding?.draftId ?? null" :has-older="!!accountNextCursor" :has-newer="accountPreviousPage" @older="changeDraftPage('older')" @newer="changeDraftPage('newer')" @login="signInLocally" @logout="signOutLocally" @save="saveAccount()" @save-new="saveAccount(true)" @refresh="refreshAccount" @open="openAccountDraft" @download-pending="downloadPendingSave" @discard-pending="discardPendingSave" @compare="comparePendingSave" @recover="recoverRetained" @open-head="openConfirmedHead" @save-copy="saveCurrentCopy" @download-current="downloadCurrentComparison" @download-head="downloadHeadComparison" @close-comparison="closeComparison" />
        <HistoryPanel v-if="activeSection === 'account' && accountIdentity && !hasProvisionalText" :identity="accountIdentity" :drafts="accountDrafts" :capture="accountCapture" :generation="accountGeneration" :account-generation="account.operationGeneration" :account-busy="accountBusy" :adopt="adoptRecovery" @busy="historyBusy = $event" @binding="account.bindRestored" @refresh="refreshAccount" />
        <RecoveryPanel v-if="activeSection === 'recovery'" :records="recoveryRecords" :list-issue="recoveryListIssue" :status="visibleRecoveryStatus" :delete-status="recoveryDeleteStatus" :delete-busy="recoveryDeleteBusy" :backup-issue="recoveryBackupIssue" :read-only-message="readOnlyMessage" @restore="restoreRecord" @remove="removeRecord" @download-copy="downloadRecord" @download="downloadBackup" @download-read-only="downloadReadOnly" @reopen="reopenBackup" @metadata="importMetadata" />
        <section v-if="activeSection === 'export'" id="export" class="export-section">
          <h2 class="section-heading" tabindex="-1">Export metadata</h2><p>Download your current RO-Crate metadata. When files are listed, the ZIP contains JSON-LD and the file-list TSV. Image contents are not included.</p>
          <p v-if="exportIssue" role="alert">{{ exportIssue }}</p>
          <p v-if="exportPreview?.status === 'materialized' && !exportPreview.files.has('file_list.tsv')">This export does not include file_list.tsv. If your submission requires it, add file listings and check the archive's requirements before transferring your files.</p>
          <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" :disabled="hasProvisionalText" @click="download">{{ exportPreview?.status === 'materialized' && exportPreview.files.size > 1 ? 'Download metadata ZIP' : 'Download metadata' }}</button>
        </section>
      </main>
      <aside class="review" aria-label="Study guidance">
        <button class="vf-button vf-button--secondary vf-button--sm app-button review-toggle" type="button" :aria-expanded="reviewOpen" aria-controls="study-guidance" @click="reviewOpen = !reviewOpen">Study guidance <span aria-hidden="true">{{ reviewOpen ? '−' : '+' }}</span></button>
        <div id="study-guidance" class="review-content" :class="{open: reviewOpen}">
          <h2>Study guidance</h2><p>A little context makes research easier to discover and reuse.</p>
          <dl><div><dt>Study</dt><dd>{{ view.study?.name || 'Untitled' }}</dd></div><div><dt>Storage</dt><dd>Browser recovery</dd></div></dl>
          <p>There is no need to complete everything now. Start with what you know.</p>
          <div v-if="issues.length" role="alert"><h3>Needs attention</h3><ul><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul></div>
        </div>
      </aside>
    </div>
  </div>
</template>
