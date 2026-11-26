import {onMounted, onUnmounted, ref, shallowRef} from 'vue'
import {decodeRecovery, type RecoveryResult} from '../../../drafts/recovery-codec'
import {indexedAccountAttempts} from './attempt-store'
import {AccountRequestError, AccountSaves, type AttemptStore, type DraftBinding} from './saves'
import {localSession, listLocalDrafts, saveLocalDraft, openLocalDraft, logoutLocal, type LocalIdentity, type LocalDraft} from './api'

interface EditorRecovery {
  capture(): string
  adopt(result:RecoveryResult, backup:string): Promise<boolean>
  readOnly(message:string, backup:string): void
  download(backup:string, filename:string): void
}

export function useLocalAccount(editor:EditorRecovery) {
  const accountAvailable = ref(false)
  const accountIdentity = shallowRef<LocalIdentity | null>(null)
  const accountDrafts = shallowRef<readonly LocalDraft[]>([])
  const accountBinding = shallowRef<DraftBinding | null>(null)
  const accountStatus = ref('Checking local account availability.')
  const accountBusy = ref(false)
  const accountPending = ref(false)
  let accountOwner = '', generation = 0, documentGeneration = 0, disposed = false, savedCurrent = false
  let accountAttempts: AttemptStore | undefined
  let loginPopup: Window | null = null
  let loginTimer: ReturnType<typeof setInterval> | undefined
  const ownerKey = (identity:LocalIdentity) => JSON.stringify([identity.issuer, identity.subject])
  const active = (token:number, owner?:string) => !disposed && token === generation && (!owner || (!!accountIdentity.value && ownerKey(accountIdentity.value) === owner))
  function resetBinding() {accountBinding.value = null; documentGeneration++; savedCurrent = false}
  function clearIdentity() {accountIdentity.value = null; accountDrafts.value = []; accountPending.value = false; accountOwner = ''; resetBinding()}
  function noteEdit() {
    if (savedCurrent) {savedCurrent = false; accountStatus.value = 'Changes since the last local save remain unsaved.'}
  }
  function accountError(error:unknown) {
    if (error instanceof AccountRequestError && [401, 403].includes(error.status)) {
      clearIdentity()
      accountStatus.value = 'Your local session expired. Sign in again; your current work remains open.'
    } else if (error instanceof AccountRequestError && error.status === 409) {
      accountStatus.value = 'This saved draft changed. The pending save and your current work remain open; download or explicitly discard the pending save before opening another draft.'
    } else accountStatus.value = 'The local account request could not be completed. Your current work remains open; retry or download a backup.'
  }
  async function refreshAccount() {
    const token = ++generation
    accountBusy.value = false
    try {
      const identity = await localSession(), owner = ownerKey(identity)
      if (!active(token)) return
      if (accountOwner && accountOwner !== owner) resetBinding()
      accountOwner = owner; accountIdentity.value = identity; accountAvailable.value = true
      const drafts = await listLocalDrafts(owner)
      if (!active(token, owner)) return
      const confirmed = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(confirmed) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      accountDrafts.value = drafts
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
  function signInLocally() {
    const token = ++generation
    clearIdentity()
    loginPopup = window.open('/api/local/auth/login', 'bijux-local-login', 'popup,width=540,height=700')
    if (!loginPopup) {accountStatus.value = 'Allow the sign-in window and try again. Your current work remains open.'; return}
    clearInterval(loginTimer)
    accountStatus.value = 'Complete sign-in in the new window.'
    loginTimer = setInterval(() => {
      void localSession().then(() => {
        if (!active(token)) return
        clearInterval(loginTimer); loginPopup?.close(); loginPopup = null; void refreshAccount()
      }).catch(() => {
        if (active(token) && loginPopup?.closed) {clearInterval(loginTimer); loginPopup = null; void refreshAccount()}
      })
    }, 1000)
  }
  async function signOutLocally() {
    const token = ++generation
    clearIdentity()
    accountBusy.value = true
    accountStatus.value = 'Signing out. Your current work remains open.'
    try {await logoutLocal(); if (active(token)) accountStatus.value = 'Signed out locally. Your current work remains open.'}
    catch (error) {if (active(token)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  async function saveAccount(asNew = false) {
    const identity = accountIdentity.value
    if (!identity) return
    const token = ++generation, owner = ownerKey(identity), documentAtStart = documentGeneration
    accountBusy.value = true
    try {
      if (!accountAttempts) throw Error('Account save storage is unavailable')
      const backup = editor.capture()
      const saves = new AccountSaves(accountAttempts, attempt => saveLocalDraft(attempt, owner), () => crypto.randomUUID())
      const result = await saves.save(owner, backup, asNew ? null : accountBinding.value, !asNew)
      if (!active(token, owner)) return
      const currentIdentity = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(currentIdentity) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      if (result.matchesCurrent && documentGeneration === documentAtStart) {
        accountBinding.value = {draftId:result.saved.draftId, versionId:result.saved.versionId}
        savedCurrent = editor.capture() === backup
        accountStatus.value = savedCurrent ? 'Local draft saved. Image files are not included.' : 'An earlier snapshot was saved. Newer edits remain open and unsaved.'
      } else accountStatus.value = 'An earlier pending save was resolved. Your current work remains open; save again to store it.'
      await saves.acknowledge(owner, result.attemptKey)
      if (!active(token, owner)) return
      accountPending.value = false
      const drafts = await listLocalDrafts(owner)
      if (active(token, owner)) accountDrafts.value = drafts
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
    const token = ++generation, owner = ownerKey(identity)
    accountBusy.value = true
    try {
      if (!accountAttempts) throw Error('Account save storage is unavailable')
      if (await accountAttempts.peek(owner)) {
        if (active(token, owner)) accountStatus.value = 'A previous save needs a retry before opening another draft. Your current work remains open.'
        return
      }
      if (!active(token, owner)) return
      const saved = await openLocalDraft(id, owner)
      if (!active(token, owner)) return
      const recovered = await decodeRecovery(saved.recovery)
      if (!active(token, owner)) return
      const currentIdentity = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(currentIdentity) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      if (recovered.status === 'read-only') {
        editor.readOnly(`This backup is read-only: ${recovered.issues.join('; ')}. The current study remains open; download the read-only backup below.`, saved.recovery)
        accountStatus.value = 'The current work remains open. Download the read-only backup from Local recovery.'
        return
      }
      // The editor requests confirmation only after this response is current, so
      // edits made while the request was in flight are included in that choice.
      const adopted = await editor.adopt(recovered, saved.recovery)
      if (!active(token, owner)) return
      if (adopted) {
        accountBinding.value = {draftId:id, versionId:saved.versionId}
        accountStatus.value = 'Local draft opened. Image files need to be selected again.'
      } else accountStatus.value = 'The current work remains open.'
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  onMounted(() => {
    try {accountAttempts = indexedAccountAttempts(indexedDB)} catch {accountAttempts = undefined}
    void refreshAccount()
  })
  onUnmounted(() => {disposed = true; generation++; clearInterval(loginTimer); loginPopup?.close()})
  return {accountAvailable, accountIdentity, accountDrafts, accountBinding, accountStatus, accountBusy, accountPending,
    refreshAccount, signInLocally, signOutLocally, saveAccount, openAccountDraft, downloadPendingSave, discardPendingSave, resetBinding, noteEdit}
}
