<script setup lang="ts">
import {computed, onUnmounted, ref, shallowRef, watch} from 'vue'
import {inspectDraft} from '@bijux/ro-crate-creator'
import {decodeRecovery, type RecoveryResult} from '../../../drafts/recovery-codec'
import {indexedAccountAttempts} from './attempt-store'
import {AccountRequestError, type DraftBinding} from './saves'
import {HistoryRestores, indexedHistoryRestores, type RestoreAttempt, type RestoredDraft} from './history-restores'
import {localSession, ownerHeader, type LocalDraft, type LocalIdentity} from './api'
import {compareRecoveries} from './comparison'
import {frozenDigest, type QualificationResult} from './qualification'
const props = defineProps<{identity:LocalIdentity; drafts:readonly LocalDraft[]; capture:() => string; generation:() => number; accountGeneration:() => number; accountBusy:boolean; adopt:(result:RecoveryResult, backup:string, confirmed:boolean) => Promise<boolean>}>()
const emit = defineEmits<{binding:[binding:DraftBinding]; refresh:[]; busy:[busy:boolean]}>()
interface Version {versionId:string; savedAt:string}
interface Snapshot {versionId:string; contentHash:string; backup:string; decoded:RecoveryResult; frozen: {status:string; files?:Array<{path:string; base64:string}>}}
const draftId = ref(''), selected = ref(''), comparison = ref(''), versions = shallowRef<Version[]>([])
const snapshot = shallowRef<Snapshot | null>(null), compared = shallowRef<Snapshot | null>(null), status = ref(''), busy = ref(false)
const qualification = shallowRef<QualificationResult | null>(null), qualificationBusy = ref(false)
let qualificationRequest:AbortController | undefined
function clearQualification() {qualificationRequest?.abort(); qualificationRequest = undefined; qualification.value = null; qualificationBusy.value = false}
let generation = 0, pageRequest = 0, inspectionRequest = 0, restoreOperation = 0, disposed = false
const differences = computed(() => snapshot.value && compared.value ? compareRecoveries(snapshot.value.decoded, compared.value.decoded) : null)
const historyCursors = ref<Array<string | null>>([null]), historyPage = ref(0), nextCursor = ref<string | null>(null)
const pinnedSelected = shallowRef<Version | null>(null), pinnedComparison = shallowRef<Version | null>(null)
const selectedPage = ref(0), comparisonPage = ref(0), frozenPage = ref(0)
const pageSize = 50
const selectedDescription = computed(() => description(snapshot.value)), comparisonDescription = computed(() => description(compared.value))
const selectedRows = computed(() => [...(selectedDescription.value?.files ?? []), ...(selectedDescription.value?.terms ?? []).map(term => `Unfinished vocabulary: ${term}`)])
const comparisonRows = computed(() => [...(comparisonDescription.value?.files ?? []), ...(comparisonDescription.value?.terms ?? []).map(term => `Unfinished vocabulary: ${term}`)])
const pageCount = (length:number) => Math.max(1, Math.ceil(length / pageSize))
const pageRows = <T,>(rows:readonly T[], page:number) => rows.slice(page * pageSize, (page + 1) * pageSize)
const owner = () => JSON.stringify([props.identity.issuer, props.identity.subject])
const active = (token:number, principal:string) => !disposed && token === generation && principal === owner()
async function confirmPrincipal(principal:string) {const identity = await localSession(); return JSON.stringify([identity.issuer, identity.subject]) === principal}
const base = (draft:string) => `/api/local/drafts/${encodeURIComponent(draft)}`
async function response(url:string, init?:RequestInit, principal = owner()) {const result = await fetch(url, {...init, headers:{...await ownerHeader(principal), ...init?.headers}}); if (!result.ok) throw new AccountRequestError(result.status); return result}
async function loadSnapshot(draft:string, version:string, principal:string):Promise<Snapshot> {
  const root = `${base(draft)}/versions/${encodeURIComponent(version)}`
  const [backupResponse, detailResponse] = await Promise.all([response(`${root}/backup`, undefined, principal), response(root, undefined, principal)])
  const backup = await backupResponse.text(), detail = await detailResponse.json() as {versionId:string; contentHash:string; frozen:Snapshot['frozen']}
  return {backup, decoded:await decodeRecovery(backup), versionId:detail.versionId, contentHash:detail.contentHash, frozen:detail.frozen}
}
async function list(page = 0) {
  const token = generation, request = ++pageRequest, principal = owner(), draft = draftId.value
  const current = () => active(token, principal) && request === pageRequest
  versions.value = []; nextCursor.value = null
  if (!draft) return
  const cursor = historyCursors.value[page] ?? null
  try {
    const value = await (await response(`${base(draft)}/versions${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`, {cache:'no-store'}, principal)).json() as {versions:Version[]; nextCursor:string | null}
    const confirmed = await confirmPrincipal(principal)
    if (!confirmed && current()) {clearHistory(); status.value = 'The account changed. Refresh the account.'; emit('refresh'); return}
    if (current()) {versions.value = value.versions; nextCursor.value = value.nextCursor; historyPage.value = page}
  } catch (error) {if (current()) {if (error instanceof AccountRequestError && [401,403].includes(error.status)) {clearHistory(); status.value = 'The account changed. Refresh the account.'; emit('refresh')} else status.value = 'History could not be loaded.'}}
}
function clearHistory() {clearQualification(); generation++; historyCursors.value = [null]; historyPage.value = 0; nextCursor.value = null; versions.value = []; selected.value = ''; comparison.value = ''; snapshot.value = null; compared.value = null; pinnedSelected.value = null; pinnedComparison.value = null}
function changeDraft() {clearHistory(); void list()}
function olderVersions() {if (!nextCursor.value) return; historyCursors.value = [...historyCursors.value.slice(0, historyPage.value + 1), nextCursor.value]; void list(historyPage.value + 1)}
function newerVersions() {if (historyPage.value > 0) void list(historyPage.value - 1)}
async function inspect() {
  clearQualification()
  const token = generation, request = ++inspectionRequest, principal = owner(), draft = draftId.value, first = selected.value, second = comparison.value
  const current = () => active(token, principal) && request === inspectionRequest
  pinnedSelected.value = versions.value.find(version => version.versionId === first) ?? (pinnedSelected.value?.versionId === first ? pinnedSelected.value : null)
  pinnedComparison.value = versions.value.find(version => version.versionId === second) ?? (pinnedComparison.value?.versionId === second ? pinnedComparison.value : null)
  snapshot.value = null; compared.value = null; selectedPage.value = 0; comparisonPage.value = 0; frozenPage.value = 0
  if (!draft || !first) return
  try {
    const [one, two] = await Promise.all([loadSnapshot(draft, first, principal), second ? loadSnapshot(draft, second, principal) : Promise.resolve(null)])
    const confirmed = await confirmPrincipal(principal)
    if (!confirmed && current()) {clearHistory(); status.value = 'The account changed. Refresh the account.'; emit('refresh'); return}
    if (current()) {snapshot.value = one; compared.value = two; status.value = ''}
  } catch (error) {if (current()) {if (error instanceof AccountRequestError && [401,403].includes(error.status)) {clearHistory(); status.value = 'The account changed. Refresh the account.'; emit('refresh')} else status.value = 'This revision could not be loaded.'}}
}
async function qualifySaved() {
  const chosen = snapshot.value, draft = draftId.value, version = selected.value, token = generation, principal = owner()
  if (props.accountBusy || !chosen || !draft || !version) return
  clearQualification()
  const controller = new AbortController(); qualificationRequest = controller; qualificationBusy.value = true
  const editGeneration = props.generation(), accountAt = props.accountGeneration()
  let before:string | undefined
  const current = () => active(token, principal) && snapshot.value === chosen && qualificationRequest === controller && props.generation() === editGeneration && before !== undefined && props.capture() === before && props.accountGeneration() === accountAt
  try {
    before = props.capture()
    const result = await (await response(`${base(draft)}/versions/${encodeURIComponent(version)}/qualification`, {method:'POST', signal:controller.signal}, principal)).json() as QualificationResult
    if (!current()) return
    if (result.policy !== 'local-reference/default-validation' || result.version?.versionId !== chosen.versionId || result.version?.contentHash !== chosen.contentHash) throw Error('Saved version identity mismatch')
    if (result.status !== 'incomplete') {
      if (!['valid','invalid'].includes(result.status) || !chosen.frozen.files || result.digest !== await frozenDigest(chosen.frozen.files)) throw Error('Frozen file identity mismatch')
    }
    const confirmed = await confirmPrincipal(principal)
    if (!confirmed && current()) {clearQualification(); status.value = 'The account changed. Refresh the account.'; emit('refresh'); return}
    if (confirmed && current()) qualification.value = result
  } catch {if (current()) qualification.value = {policy:'local-reference/default-validation', version:{versionId:version, contentHash:chosen.contentHash}, digest:'', status:'incomplete', reason:'Qualification is unavailable or the saved version changed.'}}
  finally {if (qualificationRequest === controller) {qualificationRequest = undefined; qualificationBusy.value = false}}
}
function description(value:Snapshot | null) {
  if (!value) return null
  if (value.decoded.status !== 'decoded') return {title:'Read-only or unsupported backup', files:[] as string[], terms:[] as string[]}
  const view = inspectDraft(value.decoded.draft)
  return {title:view.study?.name || 'Untitled study', files:[...view.files.map(file => file.path), ...value.decoded.pending.map(file => file.path)], terms:value.decoded.pendingTerms.map(term => `${term.kind}: ${term.label || term.identifier}`)}
}
function download(bytes:Uint8Array, name:string, type:string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], {type})), link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0)
}
function backup() {if (snapshot.value) download(new TextEncoder().encode(snapshot.value.backup), 'draft-backup.json', 'application/json')}
function comparisonBackup() {if (compared.value) download(new TextEncoder().encode(compared.value.backup), 'comparison-draft-backup.json', 'application/json')}
function fileDownload(file:{path:string; base64:string}) {
  const bytes = Uint8Array.from(atob(file.base64), char => char.charCodeAt(0))
  download(bytes, file.path.split('/').at(-1) || 'file', 'application/octet-stream')
}
async function restore() {
  const draft = draftId.value, source = selected.value, chosen = snapshot.value, head = props.drafts.find(item => item.draftId === draft)?.versionId
  if (props.accountBusy || !chosen || !head || chosen.decoded.status !== 'decoded' || !window.confirm('Restore this revision as a new saved version and replace the current study? Download your current backup first if needed.')) return
  clearQualification()
  const token = ++generation, operation = ++restoreOperation, principal = owner(), before = props.capture(), editGeneration = props.generation(), accountAt = props.accountGeneration(), pageAt = pageRequest, inspectionAt = inspectionRequest; busy.value = true; emit('busy', true)
  try {
    if (await indexedAccountAttempts(indexedDB).peek(principal)) throw Error('A pending save must be retried first')
    const send = async (attempt:RestoreAttempt):Promise<RestoredDraft> => {
      const result = await response(`${base(attempt.draftId)}/restore`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({key:attempt.key, expectedHead:attempt.expectedHead, sourceVersion:attempt.sourceVersion})}, principal)
      return await result.json() as RestoredDraft
    }
    const outcome = await new HistoryRestores(indexedHistoryRestores(indexedDB), send, () => crypto.randomUUID()).restore(principal, draft, head, source)
    const confirmed = await confirmPrincipal(principal)
    if (!disposed && (!confirmed || props.accountGeneration() !== accountAt)) {status.value = 'The account changed. Your current work remains open; refresh the account.'; emit('refresh'); return}
    if (!active(token, principal) || pageAt !== pageRequest || inspectionAt !== inspectionRequest) {
      if (!disposed && principal === owner() && operation === restoreOperation) emit('refresh')
      return
    }
    if (!outcome.matchesCurrent || props.generation() !== editGeneration || props.capture() !== before) {status.value = 'An earlier restore completed. Your current edits remain open; refresh history.'; emit('refresh'); return}
    if (await props.adopt(chosen.decoded, chosen.backup, true) && active(token, principal)) {
      emit('binding', {draftId:outcome.saved.draftId, versionId:outcome.saved.versionId})
      status.value = 'Revision restored as a new saved version. Select image files again.'; emit('refresh')
    }
  } catch (error) {if (active(token, principal) && pageAt === pageRequest && inspectionAt === inspectionRequest) status.value = error instanceof AccountRequestError && error.status === 409 ? 'The saved draft changed. Your current work remains open.' : 'Restore could not be completed. Your current work remains open; retry.'}
  finally {if (!disposed && operation === restoreOperation) {busy.value = false; emit('busy', false)}}
}
watch(() => owner(), () => {clearHistory(); restoreOperation++; busy.value = false; emit('busy', false); draftId.value = ''})
watch(() => props.generation(), clearQualification, {flush:'sync'})
onUnmounted(() => {clearQualification(); disposed = true; generation++; emit('busy', false)})
</script>
<template>
  <section aria-labelledby="history-title">
    <h3 id="history-title">Saved history</h3>
    <p>Inspect saved versions and compare their study titles and files. Restoring creates a new saved version.</p>
    <p role="status">{{ status }}</p>
    <label class="vf-form__label" for="history-draft">Draft history</label>
    <select id="history-draft" v-model="draftId" class="vf-form__select" @change="changeDraft"><option value="">Choose a draft</option><option v-for="draft in drafts" :key="draft.draftId" :value="draft.draftId">{{ new Date(draft.savedAt).toLocaleString() }} — {{ draft.draftId }}</option></select>
    <div v-if="versions.length || historyPage > 0" class="record-actions"><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="historyPage === 0" @click="newerVersions">Newer versions</button><span>Version page {{ historyPage + 1 }}</span><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="!nextCursor" @click="olderVersions">Older versions</button></div>
    <template v-if="versions.length">
      <label class="vf-form__label" for="history-version">Version</label><select id="history-version" v-model="selected" class="vf-form__select" @change="inspect"><option value="">Choose a version</option><option v-if="pinnedSelected && !versions.some(version => version.versionId === pinnedSelected?.versionId)" :value="pinnedSelected.versionId">{{ new Date(pinnedSelected.savedAt).toLocaleString() }} — {{ pinnedSelected.versionId }}</option><option v-for="version in versions" :key="version.versionId" :value="version.versionId">{{ new Date(version.savedAt).toLocaleString() }} — {{ version.versionId }}</option></select>
      <label class="vf-form__label" for="history-compare">Compare with</label><select id="history-compare" v-model="comparison" class="vf-form__select" @change="inspect"><option value="">No comparison</option><option v-if="pinnedComparison && !versions.some(version => version.versionId === pinnedComparison?.versionId)" :value="pinnedComparison.versionId">{{ new Date(pinnedComparison.savedAt).toLocaleString() }} — {{ pinnedComparison.versionId }}</option><option v-for="version in versions" :key="version.versionId" :value="version.versionId">{{ new Date(version.savedAt).toLocaleString() }} — {{ version.versionId }}</option></select>
    </template>
    <template v-if="snapshot">
      <h4>Selected version</h4><p>Study: {{ selectedDescription?.title }}</p><ul><li v-for="(row,index) in pageRows(selectedRows, selectedPage)" :key="index">{{ row }}</li></ul>
      <div v-if="selectedRows.length" class="record-actions"><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="selectedPage === 0" @click="selectedPage--">Previous selected items</button><span>{{ selectedRows.length }} items; page {{ selectedPage + 1 }} of {{ pageCount(selectedRows.length) }}</span><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="selectedPage + 1 >= pageCount(selectedRows.length)" @click="selectedPage++">Next selected items</button></div>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="backup">Download historical backup</button>
      <p v-if="!snapshot.frozen.files?.length">Frozen files are unavailable for this version ({{ snapshot.frozen.status }}).</p>
      <button v-for="file in pageRows(snapshot.frozen.files ?? [], frozenPage)" :key="file.path" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="fileDownload(file)">Download {{ file.path }}</button>
      <div v-if="snapshot.frozen.files?.length" class="record-actions"><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="frozenPage === 0" @click="frozenPage--">Previous frozen files</button><span>{{ snapshot.frozen.files.length }} frozen files; page {{ frozenPage + 1 }} of {{ pageCount(snapshot.frozen.files.length) }}</span><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="frozenPage + 1 >= pageCount(snapshot.frozen.files.length)" @click="frozenPage++">Next frozen files</button></div>
      <p>Validate this saved version with the local reference default validator. The result applies to the saved metadata, not the current study, and does not establish image availability or submission readiness.</p>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="qualificationBusy || accountBusy || busy" @click="qualifySaved">Validate saved version</button>
      <p v-if="qualificationBusy" role="status">Validating the saved version…</p>
      <p v-if="qualification" role="status">Local reference default validation: {{ qualification.status }}<span v-if="qualification.reason"> — {{ qualification.reason }}</span>.</p>
      <ul v-if="qualification?.result"><li v-for="(issue, index) in [...qualification.result.report.issues.CRITICAL, ...qualification.result.report.issues.ERROR]" :key="index">{{ issue.message }}</li></ul>
      <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" :disabled="busy || accountBusy || snapshot.decoded.status !== 'decoded'" @click="restore">Restore selected version</button>
    </template>
    <template v-if="compared"><h4>Comparison version</h4><p>Study: {{ comparisonDescription?.title }}</p><ul><li v-for="(row,index) in pageRows(comparisonRows, comparisonPage)" :key="index">{{ row }}</li></ul><div v-if="comparisonRows.length" class="record-actions"><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="comparisonPage === 0" @click="comparisonPage--">Previous comparison items</button><span>{{ comparisonRows.length }} items; page {{ comparisonPage + 1 }} of {{ pageCount(comparisonRows.length) }}</span><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="comparisonPage + 1 >= pageCount(comparisonRows.length)" @click="comparisonPage++">Next comparison items</button></div></template>
    <section v-if="differences" aria-label="Revision changes">
      <h4>Changes from selected to comparison version</h4>
      <p v-if="differences.status === 'unavailable'">{{ differences.reason }}</p>
      <template v-else>
        <ul v-if="differences.study.length || differences.records.length || differences.files.length || differences.pending.length"><li v-for="(line, index) in [...differences.study, ...differences.records, ...differences.files, ...differences.pending]" :key="index">{{ line }}</li></ul>
        <p v-else>No changes in the displayed fields.</p>
        <p v-if="differences.recordsOmitted + differences.filesOmitted + differences.pendingOmitted">{{ differences.recordsOmitted + differences.filesOmitted + differences.pendingOmitted }} more changes are not displayed.</p>
        <p v-if="differences.additionalPending">Other pending input is included in the full backups.</p>
      </template>
      <p>This is a bounded summary. Download both full backups to inspect opaque metadata and every change.</p>
      <button v-if="compared" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="comparisonBackup">Download comparison backup</button>
    </section>
  </section>
</template>
