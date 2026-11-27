import {onMounted, onUnmounted, ref, shallowRef} from 'vue'
import {decodeRecovery} from '../../../drafts/recovery-codec'
import {indexedAccountAttempts} from './attempt-store'
import {AccountRequestError, AccountSaves, type AttemptStore, type DraftBinding} from './saves'
import {localSession, listLocalDrafts, saveLocalDraft, openLocalDraft, logoutLocal, ownerHeader, type LocalIdentity, type LocalDraft} from './api'

import type {EditorRecovery} from './editor-recovery'
import {useAccountComparison} from './use-account-comparison'

export function useLocalAccount(editor:EditorRecovery, enabled:boolean) {
  const accountAvailable = ref(false)
  const accountIdentity = shallowRef<LocalIdentity | null>(null)
  const accountLabelConfirmed = ref(false)
  const accountDrafts = shallowRef<readonly LocalDraft[]>([])
  const accountNextCursor = ref<string | null>(null)
  const accountPreviousPage = ref(false)
  let accountPageCursors:(string | null)[] = [null], accountPage = 0
  const accountBinding = shallowRef<DraftBinding | null>(null)
  const accountStatus = ref('Checking local account availability.')
  const accountBusy = ref(false)
  const accountPending = ref(false)
  let accountOwner = '', documentOwner = '', generation = 0, documentGeneration = 0, inputGeneration = 0, disposed = false, savedCurrent = false
  let accountAttempts: AttemptStore | undefined
  let loginPopup: Window | null = null
  let loginTimer: ReturnType<typeof setInterval> | undefined
  let loginListener: ((event:MessageEvent) => void) | undefined
  const ownerKey = (identity:LocalIdentity) => JSON.stringify([identity.issuer, identity.subject])
  const active = (token:number, owner?:string) => !disposed && token === generation && (!owner || (!!accountIdentity.value && ownerKey(accountIdentity.value) === owner))
  function operationGeneration() {return generation}
  function bindRestored(binding:DraftBinding) {accountBinding.value = binding; documentOwner = accountIdentity.value ? ownerKey(accountIdentity.value) : ''; savedCurrent = true}
  function resetBinding(forgetOwner = true) {accountBinding.value = null; documentGeneration++; savedCurrent = false; closeComparison(); if (forgetOwner) documentOwner = ''}
  function clearIdentity() {accountLabelConfirmed.value = false; accountIdentity.value = null; accountDrafts.value = []; accountNextCursor.value = null; accountPreviousPage.value = false; accountPageCursors = [null]; accountPage = 0; accountPending.value = false; accountOwner = ''; resetBinding(false)}
  function noteEdit() {
    inputGeneration++
    closeComparison()
    if (savedCurrent) {savedCurrent = false; accountStatus.value = 'Changes since the last local save remain unsaved.'}
  }
  function accountError(error:unknown) {
    if (error instanceof AccountRequestError && [401, 403].includes(error.status)) {
      clearIdentity()
      accountStatus.value = 'Your local session expired. Sign in again; your current work remains open.'
    } else if (error instanceof AccountRequestError && error.status === 409) {
      accountStatus.value = 'This saved draft changed. The pending save and your current work remain open; compare, download or explicitly discard the pending save.'
    } else accountStatus.value = 'The local account request could not be completed. Your current work remains open; retry or download a backup.'
  }
  const {accountComparison, closeComparison, comparePendingSave, recoverRetained, openConfirmedHead,
    saveCurrentCopy, downloadCurrentComparison, downloadHeadComparison} = useAccountComparison({
    editor, accountIdentity, accountBinding, accountStatus, accountBusy, accountPending,
    attempts:() => accountAttempts, nextGeneration:() => ++generation, currentGeneration:() => generation, inputGeneration:() => inputGeneration,
    active, ownerKey, clearIdentity, accountError, saveAccount,
    setDocumentOwner:owner => {documentOwner = owner},
  })
  async function refreshAccount(expectedOwner?:string) {
    if (!enabled) {accountStatus.value = 'Local account service is not configured or is unavailable. Your current work stays in this browser.'; return}
    const token = ++generation
    closeComparison()
    accountLabelConfirmed.value = false
    accountBusy.value = false
    try {
      const identity = await localSession(), owner = ownerKey(identity)
      if (!active(token)) return
      if (expectedOwner) {
        const fingerprint = (await ownerHeader(owner))['x-bijux-owner']
        if (!active(token)) return
        if (fingerprint !== expectedOwner) {clearIdentity(); accountAvailable.value = true; accountStatus.value = 'The local account changed during sign-in. Your current work remains open; sign in again.'; return}
      }
      if (accountOwner && accountOwner !== owner) resetBinding(false)
      accountOwner = owner; accountIdentity.value = {...identity,preferredUsername:null}; accountAvailable.value = true
      const drafts = await listLocalDrafts(owner)
      if (!active(token, owner)) return
      const confirmed = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(confirmed) !== owner || confirmed.session !== identity.session) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      accountIdentity.value = confirmed
      accountLabelConfirmed.value = true
      accountDrafts.value = drafts.drafts; accountNextCursor.value = drafts.nextCursor; accountPageCursors = [null]; accountPage = 0; accountPreviousPage.value = false
      const pending = accountAttempts ? await accountAttempts.peek(owner) : undefined
      if (!active(token, owner)) return
      accountPending.value = !!pending
      accountStatus.value = pending
        ? 'A previous save is waiting. Retry it, download its backup, or explicitly discard it; your current work remains open.'
        : 'Signed in to the local reference. Save or open a local draft.'
    } catch (error) {
      if (!active(token)) return
      clearIdentity()
      if (error instanceof AccountRequestError && [401, 403].includes(error.status)) {
        accountAvailable.value = true
        accountStatus.value = 'Sign in to use the local reference. Your current work stays in this browser.'
      } else {
        accountAvailable.value = false
        accountStatus.value = 'Local account service is not configured or is unavailable. Your current work stays in this browser.'
      }
    }
  }
  async function changeDraftPage(direction:'older' | 'newer') {
    const identity = accountIdentity.value
    if (!identity || accountBusy.value) return
    const target = direction === 'older' ? accountPage + 1 : accountPage - 1
    const cursor = direction === 'older' ? accountNextCursor.value : accountPageCursors[target]
    if (target < 0 || cursor === undefined || (direction === 'older' && cursor === null)) return
    const token = ++generation, owner = ownerKey(identity)
    accountBusy.value = true
    try {
      const page = await listLocalDrafts(owner, cursor)
      const confirmed = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(confirmed) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      accountPageCursors = [...accountPageCursors.slice(0, target), cursor]
      accountPage = target; accountPreviousPage.value = target > 0
      accountDrafts.value = page.drafts; accountNextCursor.value = page.nextCursor
      accountStatus.value = 'Showing a page of saved local drafts. Refresh to see recent changes.'
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  function clearLogin() {
    clearInterval(loginTimer)
    if (loginListener) window.removeEventListener('message', loginListener)
    loginListener = undefined
  }
  function signInLocally() {
    const token = ++generation
    clearIdentity()
    clearLogin()
    loginPopup?.close()
    loginPopup = window.open('/api/local/auth/login', 'bijux-local-login', 'popup,width=540,height=700')
    if (!loginPopup) {accountStatus.value = 'Allow the sign-in window and try again. Your current work remains open.'; return}
    const popup = loginPopup
    const expires = Date.now() + 300_000
    loginListener = event => {
      const data:unknown = event.data
      if (!active(token) || Date.now() >= expires || event.origin !== window.location.origin || event.source !== popup || !data || typeof data !== 'object' ||
          !('type' in data) || data.type !== 'local-sign-in-completed' || !('owner' in data) || typeof data.owner !== 'string' || !/^[0-9a-f]{64}$/.test(data.owner)) return
      clearLogin(); popup.close(); loginPopup = null
      void refreshAccount(data.owner)
    }
    window.addEventListener('message', loginListener)
    accountStatus.value = 'Complete sign-in in the new window.'
    loginTimer = setInterval(() => {
      if (loginPopup !== popup) return
      if (!active(token)) {clearLogin(); popup.close(); loginPopup = null; return}
      if (Date.now() >= expires) {clearLogin(); popup.close(); loginPopup = null; accountStatus.value = 'Local sign-in expired. Your current work remains open; sign in again.'; return}
      if (popup.closed) {clearLogin(); loginPopup = null; accountStatus.value = 'Local sign-in was not completed. Your current work remains open.'}
    }, 250)
  }
  async function signOutLocally() {
    const session = accountIdentity.value?.session
    if (!session) return
    const token = ++generation
    clearIdentity()
    accountBusy.value = true
    accountStatus.value = 'Signing out. Your current work remains open.'
    try {await logoutLocal(session); if (active(token)) accountStatus.value = 'Signed out locally. Your current work remains open.'}
    catch (error) {if (active(token)) {
      if (error instanceof AccountRequestError && error.status === 409) accountStatus.value = 'The local session changed before sign-out. Your current work remains open; refresh the account before trying again.'
      else accountError(error)
    }}
    finally {if (active(token)) accountBusy.value = false}
  }
  async function saveAccount(asNew = false) {
    const identity = accountIdentity.value
    if (!identity) return
    const token = ++generation, owner = ownerKey(identity), documentAtStart = documentGeneration
    closeComparison()
    accountBusy.value = true
    try {
      if (!accountAttempts) throw Error('Account save storage is unavailable')
      if (documentOwner && documentOwner !== owner) {
        if (!window.confirm('This work was loaded or saved under a different local account. Save a separate copy under the current account?')) return
        const confirmed = await localSession()
        if (!active(token, owner)) return
        if (ownerKey(confirmed) !== owner || confirmed.session !== identity.session) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      }
      const backup = editor.capture(), inputAtSave = inputGeneration
      const saves = new AccountSaves(accountAttempts, attempt => saveLocalDraft(attempt, owner), () => crypto.randomUUID())
      const result = await saves.save(owner, backup, asNew ? null : accountBinding.value, !asNew)
      if (!active(token, owner)) return
      const currentIdentity = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(currentIdentity) !== owner || currentIdentity.session !== identity.session) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      if (result.matchesCurrent && documentGeneration === documentAtStart) {
        accountBinding.value = {draftId:result.saved.draftId, versionId:result.saved.versionId}
        documentOwner = owner
        savedCurrent = inputGeneration === inputAtSave
        accountStatus.value = savedCurrent ? `Local draft saved. Revision ${result.saved.versionId}, saved ${result.saved.savedAt} (UTC). Image files are not included.` : `An earlier snapshot was saved as revision ${result.saved.versionId} at ${result.saved.savedAt} (UTC). Newer edits remain open and unsaved.`
      } else accountStatus.value = `An earlier pending save was resolved. Revision ${result.saved.versionId}, saved ${result.saved.savedAt} (UTC). Your current work remains open; save again to store it.`
      try {await saves.acknowledge(owner, result.attemptKey)} catch {
        if (active(token, owner)) {accountPending.value = true; accountStatus.value = `Local draft saved, but clearing the pending save could not be confirmed. Revision ${result.saved.versionId} was confirmed. ${inputGeneration !== inputAtSave || !result.matchesCurrent || documentGeneration !== documentAtStart ? 'Newer work remains unsaved. ' : ''}Your current work remains open; check the retained save before saving again.`}
        return
      }
      if (!active(token, owner)) return
      accountPending.value = false
      try {
        const drafts = await listLocalDrafts(owner)
        if (active(token, owner)) {accountDrafts.value = drafts.drafts; accountNextCursor.value = drafts.nextCursor; accountPageCursors = [null]; accountPage = 0; accountPreviousPage.value = false}
      } catch (error) {
        if (error instanceof AccountRequestError && [401,403].includes(error.status)) {
          if (active(token, owner)) {clearIdentity(); accountStatus.value = 'A local save was confirmed, but the session could not be confirmed when refreshing drafts. Check the local session; your current work remains open.'}
          return
        }
        if (active(token, owner)) accountStatus.value += ' The saved draft list could not be refreshed; refresh it to see the latest revision.'
      }
    } catch (error) {
      if (active(token, owner)) {
        accountError(error)
        if (active(token, owner) && accountAttempts) {
          try {const pending = await accountAttempts.peek(owner); if (active(token, owner)) accountPending.value = !!pending} catch { /* current work remains open */ }
        }
      }
    } finally {if (active(token)) accountBusy.value = false}
  }
  async function downloadPendingSave() {
    const identity = accountIdentity.value
    if (!identity || !accountAttempts) return
    const token = ++generation, owner = ownerKey(identity)
    closeComparison()
    accountBusy.value = true
    try {
      const pending = await accountAttempts.peek(owner)
      if (!active(token, owner)) return
      if (!pending) {accountPending.value = false; accountStatus.value = 'No pending account save was found.'; return}
      const confirmed = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(confirmed) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      editor.download(pending.recovery, 'pending-account-save.json')
      accountStatus.value = 'Pending save backup downloaded. Your current work remains open.'
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  async function discardPendingSave() {
    const identity = accountIdentity.value
    if (!identity || !accountAttempts) return
    const token = ++generation, owner = ownerKey(identity)
    closeComparison()
    accountBusy.value = true
    try {
      const pending = await accountAttempts.peek(owner)
      if (!active(token, owner)) return
      if (!pending) {accountPending.value = false; accountStatus.value = 'No pending account save was found.'; return}
      if (!window.confirm('Discard this pending account save? Download its backup first if needed. If its outcome was unknown, saving again may create another draft.')) return
      const confirmed = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(confirmed) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      await accountAttempts.finish(owner, pending.key)
      if (!active(token, owner)) return
      accountPending.value = false
      accountStatus.value = 'Pending account save discarded. Your current work remains open.'
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  async function openAccountDraft(id:string) {
    const identity = accountIdentity.value
    if (!identity) return
    const token = ++generation, owner = ownerKey(identity), selection = editor.beginRecoverySelection()
    const currentSelection = () => {
      if (editor.currentRecoverySelection(selection)) return true
      if (active(token, owner)) accountStatus.value = 'A newer recovery selection started. Your current work remains open.'
      return false
    }
    accountBusy.value = true
    try {
      if (!accountAttempts) throw Error('Account save storage is unavailable')
      const pending = await accountAttempts.peek(owner)
      if (!active(token, owner) || !currentSelection()) return
      if (pending) {
        accountStatus.value = 'A previous save needs a retry before opening another draft. Your current work remains open.'
        return
      }
      const saved = await openLocalDraft(id, owner)
      if (!active(token, owner) || !currentSelection()) return
      const recovered = await decodeRecovery(saved.recovery)
      if (!active(token, owner) || !currentSelection()) return
      const currentIdentity = await localSession()
      if (!active(token, owner) || !currentSelection()) return
      if (ownerKey(currentIdentity) !== owner || currentIdentity.session !== identity.session) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      if (recovered.status === 'read-only') {
        editor.readOnly(`This backup is read-only: ${recovered.issues.join('; ')}. The current study remains open; download the read-only backup below.`, saved.recovery)
        accountStatus.value = 'The current work remains open. Download the read-only backup from Local recovery.'
        return
      }
      // The editor requests confirmation only after this response is current, so
      // edits made while the request was in flight are included in that choice.
      const current = () => active(token, owner) && accountIdentity.value?.session === identity.session && editor.currentRecoverySelection(selection)
      const adopted = await editor.adopt(recovered, saved.recovery, {
        selection, current,
        verify:async () => {
          let confirmed:LocalIdentity
          try {confirmed = await localSession()} catch {
            if (current()) {clearIdentity(); accountStatus.value = 'The local session could not be confirmed. Your current work remains open; check the local session.'}
            return false
          }
          if (!current()) return false
          if (ownerKey(confirmed) !== owner || confirmed.session !== identity.session) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return false}
          return true
        },
        committed:() => {accountBinding.value = {draftId:id, versionId:saved.versionId}; documentOwner = owner},
      })
      if (!current()) return
      if (adopted) accountStatus.value = `Local draft opened. Revision ${saved.versionId}, saved ${saved.savedAt} (UTC). Image files need to be selected again.`
      else accountStatus.value = 'The current work remains open.'
    } catch (error) {
      if (!active(token, owner)) return
      if (editor.currentRecoverySelection(selection)) {accountError(error); return}
      if (error instanceof AccountRequestError && [401,403].includes(error.status)) {
        try {
          const confirmed = await localSession()
          if (!active(token, owner)) return
          if (ownerKey(confirmed) !== owner || confirmed.session !== identity.session) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
        } catch (confirmationError) {
          if (!active(token, owner)) return
          if (confirmationError instanceof AccountRequestError && [401,403].includes(confirmationError.status)) accountError(confirmationError)
          else {clearIdentity(); accountStatus.value = 'The local session could not be confirmed. Your current work remains open; retry or sign in again.'}
          return
        }
      }
      currentSelection()
    }
    finally {if (active(token)) accountBusy.value = false}
  }
  onMounted(() => {
    if (!enabled) {accountStatus.value = 'Local account service is not configured or is unavailable. Your current work stays in this browser.'; return}
    try {accountAttempts = indexedAccountAttempts(indexedDB)} catch {accountAttempts = undefined}
    void refreshAccount()
  })
  onUnmounted(() => {disposed = true; generation++; clearLogin(); loginPopup?.close()})
  return {accountAvailable, accountIdentity, accountDrafts, accountNextCursor, accountPreviousPage, accountBinding, accountStatus, accountBusy, accountPending, accountComparison, changeDraftPage,
    accountLabelConfirmed, refreshAccount, signInLocally, signOutLocally, saveAccount, openAccountDraft, downloadPendingSave, discardPendingSave,
    comparePendingSave, recoverRetained, openConfirmedHead, saveCurrentCopy, downloadCurrentComparison, downloadHeadComparison, closeComparison, resetBinding, noteEdit, operationGeneration, bindRestored}
}
