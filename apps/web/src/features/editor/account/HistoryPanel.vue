<script setup lang="ts">
import {computed, onUnmounted, ref, shallowRef, watch} from 'vue'
import {inspectDraft} from '@bijux/ro-crate-creator'
import {decodeRecovery, type RecoveryResult} from '../../../drafts/recovery-codec'
import {indexedAccountAttempts} from './attempt-store'
import {AccountRequestError, type DraftBinding} from './saves'
import {HistoryRestores, indexedHistoryRestores, type RestoreAttempt, type RestoredDraft} from './history-restores'
import {localSession, ownerHeader, type LocalDraft, type LocalIdentity} from './api'
import {compareRecoveries} from './comparison'
const props = defineProps<{identity:LocalIdentity; drafts:readonly LocalDraft[]; capture:() => string; generation:() => number; accountGeneration:() => number; accountBusy:boolean; adopt:(result:RecoveryResult, backup:string, confirmed:boolean) => Promise<boolean>}>()
const emit = defineEmits<{binding:[binding:DraftBinding]; refresh:[]; busy:[busy:boolean]}>()
interface Version {versionId:string; savedAt:string}
interface Snapshot {backup:string; decoded:RecoveryResult; frozen: {status:string; files?:Array<{path:string; base64:string}>}}
const draftId = ref(''), selected = ref(''), comparison = ref(''), versions = shallowRef<Version[]>([])
const snapshot = shallowRef<Snapshot | null>(null), compared = shallowRef<Snapshot | null>(null), status = ref(''), busy = ref(false)
let generation = 0, restoreOperation = 0, disposed = false
const differences = computed(() => snapshot.value && compared.value ? compareRecoveries(snapshot.value.decoded, compared.value.decoded) : null)
const owner = () => JSON.stringify([props.identity.issuer, props.identity.subject])
const active = (token:number, principal:string) => !disposed && token === generation && principal === owner()
async function confirmPrincipal(principal:string) {const identity = await localSession(); return JSON.stringify([identity.issuer, identity.subject]) === principal}
const base = (draft:string) => `/api/local/drafts/${encodeURIComponent(draft)}`
async function response(url:string, init?:RequestInit, principal = owner()) {const result = await fetch(url, {...init, headers:{...await ownerHeader(principal), ...init?.headers}}); if (!result.ok) throw new AccountRequestError(result.status); return result}
async function loadSnapshot(draft:string, version:string, principal:string):Promise<Snapshot> {
  const root = `${base(draft)}/versions/${encodeURIComponent(version)}`
  const [backupResponse, filesResponse] = await Promise.all([response(`${root}/backup`, undefined, principal), response(`${root}/files`, undefined, principal)])
  const backup = await backupResponse.text(), frozen = await filesResponse.json() as Snapshot['frozen']
  return {backup, decoded:await decodeRecovery(backup), frozen}
}
async function list() {
  const token = ++generation, principal = owner(), draft = draftId.value
  versions.value = []; snapshot.value = null; compared.value = null; selected.value = ''; comparison.value = ''
  if (!draft) return
  try {
    const value = await (await response(`${base(draft)}/versions`, {cache:'no-store'}, principal)).json() as {versions:Version[]}
    const confirmed = await confirmPrincipal(principal)
    if (!confirmed && active(token, principal)) {status.value = 'The account changed. Refresh the account.'; emit('refresh'); return}
    if (active(token, principal)) versions.value = value.versions
  } catch {if (active(token, principal)) status.value = 'History could not be loaded.'}
}
async function inspect() {
  const token = ++generation, principal = owner(), draft = draftId.value, first = selected.value, second = comparison.value
  snapshot.value = null; compared.value = null
  if (!draft || !first) return
  try {
    const [one, two] = await Promise.all([loadSnapshot(draft, first, principal), second ? loadSnapshot(draft, second, principal) : Promise.resolve(null)])
    const confirmed = await confirmPrincipal(principal)
    if (!confirmed && active(token, principal)) {status.value = 'The account changed. Refresh the account.'; emit('refresh'); return}
    if (active(token, principal)) {snapshot.value = one; compared.value = two; status.value = ''}
  } catch {if (active(token, principal)) status.value = 'This revision could not be loaded.'}
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
  const token = ++generation, operation = ++restoreOperation, principal = owner(), before = props.capture(), editGeneration = props.generation(), accountAt = props.accountGeneration(); busy.value = true; emit('busy', true)
  try {
    if (await indexedAccountAttempts(indexedDB).peek(principal)) throw Error('A pending save must be retried first')
    const send = async (attempt:RestoreAttempt):Promise<RestoredDraft> => {
      const result = await response(`${base(attempt.draftId)}/restore`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({key:attempt.key, expectedHead:attempt.expectedHead, sourceVersion:attempt.sourceVersion})}, principal)
      return await result.json() as RestoredDraft
    }
    const outcome = await new HistoryRestores(indexedHistoryRestores(indexedDB), send, () => crypto.randomUUID()).restore(principal, draft, head, source)
    const confirmed = await confirmPrincipal(principal)
    if (!disposed && (!confirmed || props.accountGeneration() !== accountAt)) {status.value = 'The account changed. Your current work remains open; refresh the account.'; emit('refresh'); return}
    if (!active(token, principal)) {
      if (!disposed && principal === owner() && operation === restoreOperation) emit('refresh')
      return
    }
    if (!outcome.matchesCurrent || props.generation() !== editGeneration || props.capture() !== before) {status.value = 'An earlier restore completed. Your current edits remain open; refresh history.'; emit('refresh'); return}
    if (await props.adopt(chosen.decoded, chosen.backup, true) && active(token, principal)) {
      emit('binding', {draftId:outcome.saved.draftId, versionId:outcome.saved.versionId})
      status.value = 'Revision restored as a new saved version. Select image files again.'; emit('refresh')
    }
  } catch (error) {if (active(token, principal)) status.value = error instanceof AccountRequestError && error.status === 409 ? 'The saved draft changed. Your current work remains open.' : 'Restore could not be completed. Your current work remains open; retry.'}
  finally {if (!disposed && operation === restoreOperation) {busy.value = false; emit('busy', false)}}
}
watch(() => owner(), () => {generation++; restoreOperation++; busy.value = false; emit('busy', false); draftId.value = ''; versions.value = []; snapshot.value = null; compared.value = null})
onUnmounted(() => {disposed = true; generation++; emit('busy', false)})
</script>
<template>
  <section aria-labelledby="history-title">
    <h3 id="history-title">Saved history</h3>
    <p>Inspect saved versions and compare their study titles and files. Restoring creates a new saved version.</p>
    <p role="status">{{ status }}</p>
    <label class="vf-form__label" for="history-draft">Draft history</label>
    <select id="history-draft" v-model="draftId" class="vf-form__select" @change="list"><option value="">Choose a draft</option><option v-for="draft in drafts" :key="draft.draftId" :value="draft.draftId">{{ new Date(draft.savedAt).toLocaleString() }} — {{ draft.draftId }}</option></select>
    <template v-if="versions.length">
      <label class="vf-form__label" for="history-version">Version</label><select id="history-version" v-model="selected" class="vf-form__select" @change="inspect"><option value="">Choose a version</option><option v-for="version in versions" :key="version.versionId" :value="version.versionId">{{ new Date(version.savedAt).toLocaleString() }} — {{ version.versionId }}</option></select>
      <label class="vf-form__label" for="history-compare">Compare with</label><select id="history-compare" v-model="comparison" class="vf-form__select" @change="inspect"><option value="">No comparison</option><option v-for="version in versions" :key="version.versionId" :value="version.versionId">{{ new Date(version.savedAt).toLocaleString() }} — {{ version.versionId }}</option></select>
    </template>
    <template v-if="snapshot">
      <h4>Selected version</h4><p>Study: {{ description(snapshot)?.title }}</p><ul><li v-for="file in description(snapshot)?.files" :key="file">{{ file }}</li><li v-for="term in description(snapshot)?.terms" :key="term">Unfinished vocabulary: {{ term }}</li></ul>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="backup">Download historical backup</button>
      <p v-if="!snapshot.frozen.files?.length">Frozen files are unavailable for this version ({{ snapshot.frozen.status }}).</p>
      <button v-for="file in snapshot.frozen.files" :key="file.path" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="fileDownload(file)">Download {{ file.path }}</button>
      <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" :disabled="busy || accountBusy || snapshot.decoded.status !== 'decoded'" @click="restore">Restore selected version</button>
    </template>
    <template v-if="compared"><h4>Comparison version</h4><p>Study: {{ description(compared)?.title }}</p><ul><li v-for="file in description(compared)?.files" :key="file">{{ file }}</li><li v-for="term in description(compared)?.terms" :key="term">Unfinished vocabulary: {{ term }}</li></ul></template>
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
