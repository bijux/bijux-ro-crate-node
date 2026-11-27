import {shallowRef, type Ref} from 'vue'
import type {EditorRecovery} from './editor-recovery'
import {localSession, openLocalDraft, type LocalIdentity} from './api'
import type {AttemptStore, DraftBinding} from './saves'
import {compareAttempt, StaleComparisonError, type AttemptComparison} from './comparison'

interface ComparisonContext {
  editor:EditorRecovery
  accountIdentity:Ref<LocalIdentity | null>
  accountBinding:Ref<DraftBinding | null>
  accountStatus:Ref<string>
  accountBusy:Ref<boolean>
  accountPending:Ref<boolean>
  attempts():AttemptStore | undefined
  nextGeneration():number
  currentGeneration():number
  inputGeneration():number
  active(token:number, owner?:string):boolean
  ownerKey(identity:LocalIdentity):string
  clearIdentity():void
  accountError(error:unknown):void
  saveAccount(asNew?:boolean):Promise<void>
  setDocumentOwner(owner:string):void
}

/** Comparison uses the account owner's existing session and operation generation. */
export function useAccountComparison(context:ComparisonContext) {
  const {editor, accountIdentity, accountBinding, accountStatus, accountBusy, accountPending,
    attempts:getAttempts, nextGeneration, currentGeneration, inputGeneration, active, ownerKey, clearIdentity,
    accountError, saveAccount, setDocumentOwner} = context
  const accountComparison = shallowRef<AttemptComparison | null>(null)
  let comparisonOwner = '', comparisonGeneration = -1, comparisonInput = -1
  function closeComparison() {accountComparison.value = null}
  function currentComparison(): AttemptComparison | undefined {
    if (!accountComparison.value || !active(comparisonGeneration, comparisonOwner) || inputGeneration() !== comparisonInput) {
      closeComparison()
      accountStatus.value = 'The account or current work changed. Compare again; your work remains open.'
      return undefined
    }
    return accountComparison.value
  }
  function sameAttempt(first: import('./saves').SaveAttempt, second: import('./saves').SaveAttempt | undefined) {
    return !!second && first.key === second.key && first.recovery === second.recovery && first.draftId === second.draftId && first.expectedHead === second.expectedHead
  }
  async function comparePendingSave() {
    const identity = accountIdentity.value, attempts = getAttempts()
    if (!identity || !attempts) return
    const token = nextGeneration(), owner = ownerKey(identity), inputAt = inputGeneration()
    closeComparison(); accountBusy.value = true
    let ownerChanged = false
    try {
      const currentBackup = editor.capture(), attempt = await attempts.peek(owner)
      if (!active(token, owner) || inputGeneration() !== inputAt) throw new StaleComparisonError()
      if (!attempt) {accountPending.value = false; accountStatus.value = 'No pending account save was found.'; return}
      const comparison = await compareAttempt({attempt, currentBackup,
        fetchHead:id => openLocalDraft(id, owner),
        confirmOwner:async () => {const identityNow = await localSession(); ownerChanged = ownerKey(identityNow) !== owner || identityNow.session !== identity.session; return !ownerChanged},
        isCurrent:() => active(token, owner) && inputGeneration() === inputAt})
      const latest = await attempts.peek(owner)
      if (!active(token, owner) || inputGeneration() !== inputAt || !sameAttempt(attempt, latest)) throw new StaleComparisonError()
      comparisonOwner = owner; comparisonGeneration = token; comparisonInput = inputAt
      accountComparison.value = comparison
      accountStatus.value = 'Comparison ready. No draft or retained save has been changed.'
    } catch (error) {
      if (active(token, owner)) {
        if (ownerChanged) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'}
        else if (error instanceof StaleComparisonError) accountStatus.value = 'The account or current work changed. Compare again; your work remains open.'
        else accountError(error)
      }
    } finally {if (active(token)) accountBusy.value = false}
  }
  async function verifyComparison(token:number, owner:string, session:string, inputAt:number, view:AttemptComparison, verifyHead:boolean, isCurrent:()=>boolean = () => true): Promise<boolean> {
    const attempts = getAttempts()
    if (!attempts || !active(token, owner) || inputGeneration() !== inputAt || !isCurrent()) return false
    const [identity, pending] = await Promise.all([localSession(), attempts.peek(owner)])
    if (!active(token, owner) || inputGeneration() !== inputAt || !isCurrent()) return false
    if (ownerKey(identity) !== owner || identity.session !== session) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return false}
    if (!sameAttempt(view.attempt, pending)) return false
    if (verifyHead && view.head && view.attempt.draftId) {
      const latest = await openLocalDraft(view.attempt.draftId, owner)
      if (!active(token, owner) || inputGeneration() !== inputAt || !isCurrent() || latest.versionId !== view.head.versionId) return false
      const confirmed = await localSession()
      if (!active(token, owner) || inputGeneration() !== inputAt || !isCurrent()) return false
      if (ownerKey(confirmed) !== owner || confirmed.session !== session) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return false}
    }
    return true
  }
  async function recoverRetained() {
    const view = currentComparison(), identity = accountIdentity.value
    if (!view || !identity || view.retained.status !== 'decoded') return
    const token = nextGeneration(), owner = ownerKey(identity), inputAt = inputGeneration()
    accountBusy.value = true
    try {
      const adopted = await editor.adopt(view.retained, view.attempt.recovery, {
        message:'Replace the current study with the retained save as a new local draft? The earlier request may already have succeeded. Download current work first if needed.',
        verify:() => verifyComparison(token, owner, identity.session, inputAt, view, false),
        current:() => active(token, owner) && accountIdentity.value?.session === identity.session && inputGeneration() === inputAt,
        committed:() => {setDocumentOwner(owner)},
      })
      if (!active(token, owner)) return
      if (!adopted) closeComparison()
      accountStatus.value = adopted
        ? 'Retained save recovered as a new local draft. The original pending save remains available; download or discard it before saving this copy.'
        : 'The current work remains open. Compare again if the account or work changed.'
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  async function openConfirmedHead() {
    const view = currentComparison(), identity = accountIdentity.value
    if (!view?.head || !view.attempt.draftId || !identity || view.head.decoded.status !== 'decoded') return
    const token = nextGeneration(), owner = ownerKey(identity), inputAt = inputGeneration(), head = view.head
    accountBusy.value = true
    try {
      const adopted = await editor.adopt(head.decoded, head.recovery, {
        message:`Replace the current study with confirmed revision ${head.versionId}, saved ${head.savedAt} (UTC)? The retained save will remain available.`,
        verify:() => verifyComparison(token, owner, identity.session, inputAt, view, true),
        current:() => active(token, owner) && accountIdentity.value?.session === identity.session && inputGeneration() === inputAt,
        committed:() => {accountBinding.value = {draftId:view.attempt.draftId!, versionId:head.versionId}; setDocumentOwner(owner)},
      })
      if (!active(token, owner)) return
      if (adopted) {
        accountStatus.value = `Confirmed revision ${head.versionId}, saved ${head.savedAt} (UTC), opened. The retained save remains available.`
      } else {closeComparison(); accountStatus.value = 'The current work remains open. Compare again if the server head, account or work changed.'}
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  async function saveCurrentCopy() {
    const view = currentComparison(), identity = accountIdentity.value, attempts = getAttempts()
    if (!view || !identity || !attempts) return
    const token = nextGeneration(), owner = ownerKey(identity), inputAt = inputGeneration()
    accountBusy.value = true
    try {
      if (!window.confirm('Discard the retained pending save and save current work as a new local draft? Download the retained backup first if needed. The earlier request may already have succeeded.')) {closeComparison(); return}
      if (!await verifyComparison(token, owner, identity.session, inputAt, view, false)) {if (active(token)) accountStatus.value = 'The account or current work changed. Compare again; your work remains open.'; return}
      await attempts.finish(owner, view.attempt.key)
      if (!active(token, owner)) return
      if (inputGeneration() !== inputAt) {accountPending.value = false; closeComparison(); accountStatus.value = 'The retained save was discarded as requested. Current work changed and was not saved; save again.'; return}
      if (await attempts.peek(owner)) {accountStatus.value = 'Another pending save exists. Compare again before saving a copy.'; return}
      if (!active(token, owner) || inputGeneration() !== inputAt) return
      accountPending.value = false; closeComparison()
      await saveAccount(true)
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  function downloadCurrentComparison() {const view = currentComparison(); if (view) editor.download(view.currentBackup, 'current-work-backup.json')}
  async function downloadHeadComparison() {
    const view = currentComparison(), identity = accountIdentity.value
    if (!view?.head || !identity) return
    const token = currentGeneration(), owner = ownerKey(identity), inputAt = inputGeneration()
    accountBusy.value = true
    try {
      const verified = await verifyComparison(token, owner, identity.session, inputAt, view, false, () => accountComparison.value === view && accountIdentity.value?.session === identity.session)
      if (!active(token, owner) || inputGeneration() !== inputAt || accountComparison.value !== view || accountIdentity.value?.session !== identity.session) return
      if (!verified) {closeComparison(); accountStatus.value = 'The account or current work changed. Compare again; your work remains open.'; return}
      editor.download(view.head.recovery, 'confirmed-server-backup.json')
    } catch (error) {
      if (active(token, owner) && inputGeneration() === inputAt && accountComparison.value === view && accountIdentity.value?.session === identity.session) accountError(error)
    }
    finally {if (active(token)) accountBusy.value = false}
  }
  return {accountComparison, closeComparison, comparePendingSave, recoverRetained, openConfirmedHead,
    saveCurrentCopy, downloadCurrentComparison, downloadHeadComparison}
}
