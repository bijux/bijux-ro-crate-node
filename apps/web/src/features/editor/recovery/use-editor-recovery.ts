import {computed, onMounted, onUnmounted, ref, shallowRef, watch, type Ref} from 'vue'
import {importCrate, type DraftDocument, type ImportResult} from '@bijux/ro-crate-creator'
import {encodeRecovery, decodeRecovery, RECOVERY_MAX_BYTES, type RecoveryResult} from '../../../drafts/recovery-codec'
import {indexedRecoveryStore, type RecoveryStore, type RecoverySummary} from '../../../drafts/recovery-store'
import {RecoveryProgress, commitVerifiedReplacement, recoveryWaitNotice, type ReplacementPermit} from '../../../drafts/recovery-progress'
import {RecoveryWriter} from '../../../drafts/recovery-writer'
import type {PendingFile, PendingTerm} from '../../../drafts/pending'

type EditableRecovery = Extract<RecoveryResult,{status:'decoded'}>
interface EditorRecoveryContext {
  draft:Ref<DraftDocument>
  pendingFiles:Ref<readonly PendingFile[]>
  pendingTerms:Ref<readonly PendingTerm[]>
  hasProvisionalText:Readonly<Ref<boolean>>
  editGeneration:() => number
  isRecoveryActive:() => boolean
  provisionalOpenNotice:string
  provisionalBackupNotice:string
  saveText:(text:string,name:string) => void
  commitReplacement:(result:EditableRecovery, committed?:()=>void) => void
}

/** Owns recovery state and the final synchronous replacement boundary for the editor. */
export function useEditorRecovery({
  draft, pendingFiles, pendingTerms, hasProvisionalText, editGeneration, isRecoveryActive,
  provisionalOpenNotice, provisionalBackupNotice, saveText, commitReplacement,
}:EditorRecoveryContext) {
  const recoveryRecords = shallowRef<readonly RecoverySummary[]>([])
  const recoveryListIssue = ref('')
  let recoveryListRequest = 0
  const recoveryStatus = ref('Recovery is starting.')
  const visibleRecoveryStatus = computed(() => hasProvisionalText.value ? 'Unsaved text is not included in browser recovery. Earlier admitted work may still be saved.' : recoveryStatus.value)
  const recoveryActionStatus = ref('')
  function reportRecoveryAction(action:number, message:string) {if (currentRecoverySelection(action)) recoveryActionStatus.value = message}
  const recoveryDeleteStatus = ref('')
  const recoveryBackupIssue = ref('')
  const recoveryDeleteBusy = ref(false)
  const recoveryProgress = new RecoveryProgress(status => {recoveryStatus.value = status})
  const recoveryPendingNotice = 'Wait for browser recovery to finish before replacing the current study.'
  function failRecovery(generation:number, error:unknown) {
    recoveryProgress.failed(generation,error)
    if (recoveryProgress.current() === generation && !recoveryDeleteBusy.value && recoveryActionStatus.value === recoveryPendingNotice) recoveryActionStatus.value = ''
  }
  async function replacementStillAllowed(permit:ReplacementPermit):Promise<boolean> {
    if (hasProvisionalText.value || recoveryDeleteBusy.value || editGeneration() !== permit.editGeneration || !recoveryProgress.matches(permit.recovery)) return false
    if (permit.recovery.state !== 'saved') return true
    const version = recoveryWriter?.version()
    if (!version || !recoveryStore) return false
    try {
      const records = await recoveryStore.list()
      if (hasProvisionalText.value || recoveryDeleteBusy.value || editGeneration() !== permit.editGeneration || !recoveryProgress.matches(permit.recovery) || !recoveryWriter?.matches(version)) return false
      if (!records.some(record => record.id === version.id && record.revision === version.revision)) {
        recoveryProgress.failed(permit.recovery.generation,Error('The last confirmed recovery copy is no longer available'))
        return false
      }
      return true
    } catch {
      if (editGeneration() === permit.editGeneration && recoveryProgress.matches(permit.recovery)) recoveryProgress.failed(permit.recovery.generation,Error('The last recovery copy could not be verified'))
      return false
    }
  }
  async function confirmReplacement(message:string):Promise<ReplacementPermit | null> {
    if (hasProvisionalText.value) {recoveryActionStatus.value = provisionalOpenNotice; return null}
    let permit:ReplacementPermit = {recovery:recoveryProgress.snapshot(),editGeneration:editGeneration()}
    if (permit.recovery.state === 'pending' || recoveryDeleteBusy.value) {recoveryActionStatus.value = recoveryPendingNotice; return null}
    if (!await replacementStillAllowed(permit)) {
      if (editGeneration() !== permit.editGeneration || hasProvisionalText.value) {recoveryActionStatus.value = 'The current work changed. Your current work remains open.'; return null}
      permit = {recovery:recoveryProgress.snapshot(),editGeneration:editGeneration()}
      if (permit.recovery.state !== 'failed' && permit.recovery.state !== 'removed') {recoveryActionStatus.value = 'Browser recovery could not be verified. Your current work remains open.'; return null}
    }
    const warning = ' The latest changes are not confirmed in browser recovery. Replacing the current study will discard them. An editable backup or metadata export may be available. Select OK to discard the current changes, or Cancel to keep working.'
    const verified = ' The last browser recovery copy was verified just now, but another tab may change or delete it.'
    if (!window.confirm(message + (permit.recovery.state === 'failed' || permit.recovery.state === 'removed' ? warning : permit.recovery.state === 'saved' ? verified : ''))) return null
    return permit
  }
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
  function onRecoveryFocus() {if (isRecoveryActive()) void refreshRecoveryRecords()}
  watch(isRecoveryActive, active => {if (active) void refreshRecoveryRecords()})
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
      catch (error) {failRecovery(generation,error); return}
      if (!recoveryStore || !recoveryWriter) {failRecovery(generation, Error('Browser storage is unavailable')); return}
      void recoveryWriter.save(recoveryStore, backup).then(() => {
        recoveryProgress.saved(generation)
        if (recoveryProgress.current() === generation && !recoveryDeleteBusy.value && recoveryActionStatus.value === recoveryPendingNotice) recoveryActionStatus.value = ''
        void refreshRecoveryRecords()
      }).catch(error => {failRecovery(generation,error); void refreshRecoveryRecords()})
    }, 500)
  }
  watch([draft, pendingFiles, pendingTerms], scheduleRecovery, {flush:'sync'})
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
  async function adoptRecovery(result:RecoveryResult, original:string, options?:{message?:string; verify?:()=>Promise<boolean>; current?:()=>boolean; committed?:()=>void; selection?:number; permit?:ReplacementPermit}, action = options?.selection ?? beginRecoverySelection()) {
    if (!currentRecoverySelection(action)) return false
    if (hasProvisionalText.value) {reportRecoveryAction(action, provisionalOpenNotice); return false}
    if (result.status === 'rejected') {reportRecoveryAction(action, `Recovery rejected: ${result.issues.join('; ')}`); return false}
    if (result.status === 'read-only') {
      readOnlyBackup.value = original
      readOnlyMessage.value = `This backup is read-only: ${result.issues.join('; ')}. The current study remains open; download the read-only backup below.`
      return false
    }
    const permit = options?.permit ?? await confirmReplacement(options?.message ?? 'Replace the current study with this recovery copy? Download the current backup first if needed.')
    if (!permit || !await replacementStillAllowed(permit)) return false
    if (options?.verify && !await options.verify()) {reportRecoveryAction(action, 'The account or draft changed. Your current work remains open.'); return false}
    const current = () => currentRecoverySelection(action) && (!options?.current || options.current()) && !hasProvisionalText.value && !recoveryDeleteBusy.value && editGeneration() === permit.editGeneration && recoveryProgress.matches(permit.recovery)
    let attempted = false
    const adopted = await commitVerifiedReplacement(() => replacementStillAllowed(permit), current, () => {
      attempted = true
      try {recoveryWriter?.fork()} catch {reportRecoveryAction(action, 'Browser recovery is still busy. Your current work remains open.'); return false}
      commitReplacement(result,options?.committed)
      readOnlyMessage.value = ''; readOnlyBackup.value = ''
      reportRecoveryAction(action, 'Recovery opened. Image files need to be selected again.')
      return true
    })
    if (!adopted && !attempted) reportRecoveryAction(action, 'The current work or recovery state changed. Your current work remains open.')
    return adopted
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
    finally {recoveryDeleteBusy.value = false; recoveryActionStatus.value = recoveryWaitNotice(recoveryActionStatus.value,recoveryPendingNotice,recoveryProgress.snapshot().state === 'pending',false)}
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

  return {
    recoveryRecords, recoveryListIssue, visibleRecoveryStatus, recoveryActionStatus, recoveryDeleteStatus,
    recoveryBackupIssue, recoveryDeleteBusy, readOnlyMessage, readOnlyBackup,
    beginRecoverySelection, currentRecoverySelection, replacementStillAllowed, confirmReplacement, adoptRecovery,
    downloadBackup, downloadReadOnly, downloadRecord, restoreRecord, removeRecord, reopenBackup, importMetadata,
  }
}
