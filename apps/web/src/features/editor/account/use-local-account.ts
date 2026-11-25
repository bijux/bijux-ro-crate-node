import {onMounted, onUnmounted, ref, shallowRef} from 'vue'
import {decodeRecovery, type RecoveryResult} from '../../../drafts/recovery-codec'
import {indexedAccountAttempts} from './attempt-store'
import {AccountRequestError, AccountSaves, type AttemptStore, type DraftBinding} from './saves'
import {localSession, listLocalDrafts, saveLocalDraft, openLocalDraft, logoutLocal, type LocalIdentity, type LocalDraft} from './api'

interface EditorRecovery {
  capture(): string
  adopt(result:RecoveryResult, backup:string): Promise<boolean>
  readOnly(message:string, backup:string): void
}

export function useLocalAccount(editor:EditorRecovery) {
  const accountAvailable = ref(false)
  const accountIdentity = shallowRef<LocalIdentity | null>(null)
  const accountDrafts = shallowRef<readonly LocalDraft[]>([])
  const accountBinding = shallowRef<DraftBinding | null>(null)
  const accountStatus = ref('Checking local account availability.')
  const accountBusy = ref(false)
  let accountOwner = ''
  let accountAttempts: AttemptStore | undefined
  let loginPopup: Window | null = null
  let loginTimer: ReturnType<typeof setInterval> | undefined
  const ownerKey = (identity:LocalIdentity) => JSON.stringify([identity.issuer, identity.subject])
  function accountError(error:unknown) {
    if (error instanceof AccountRequestError && error.status === 401) {
      accountIdentity.value = null
      accountStatus.value = 'Your local session expired. Sign in again; your current work remains open.'
    } else if (error instanceof AccountRequestError && error.status === 409) {
      accountStatus.value = 'This saved draft changed. Your current work remains open; open the saved draft or save your work as a new draft.'
    } else accountStatus.value = 'The local account request could not be completed. Your current work remains open; retry or download a backup.'
  }
  async function refreshAccount() {
    try {
      const identity = await localSession(), owner = ownerKey(identity)
      if (accountOwner && accountOwner !== owner) accountBinding.value = null
      accountOwner = owner
      accountIdentity.value = identity
      accountAvailable.value = true
      accountDrafts.value = await listLocalDrafts()
      accountStatus.value = 'Signed in to the local reference. Save or open a local draft.'
    } catch (error) {
      accountIdentity.value = null
      accountDrafts.value = []
      if (error instanceof AccountRequestError && error.status === 401) {
        accountAvailable.value = true
        accountStatus.value = 'Sign in to use the local reference. Your current work stays in this browser.'
      } else {
        accountAvailable.value = false
        accountStatus.value = 'Local account service is not configured or is unavailable. Your current work stays in this browser.'
      }
    }
  }
  function signInLocally() {
    loginPopup = window.open('/api/local/auth/login', 'bijux-local-login', 'popup,width=540,height=700')
    if (!loginPopup) {accountStatus.value = 'Allow the sign-in window and try again. Your current work remains open.'; return}
    clearInterval(loginTimer)
    accountStatus.value = 'Complete sign-in in the new window.'
    loginTimer = setInterval(() => {
      void localSession().then(() => {clearInterval(loginTimer); loginPopup?.close(); loginPopup = null; void refreshAccount()}).catch(() => {
        if (loginPopup?.closed) {clearInterval(loginTimer); loginPopup = null; void refreshAccount()}
      })
    }, 1000)
  }
  async function signOutLocally() {
    accountBusy.value = true
    try {await logoutLocal(); accountIdentity.value = null; accountDrafts.value = []; accountStatus.value = 'Signed out locally. Your current work remains open.'}
    catch (error) {accountError(error)}
    finally {accountBusy.value = false}
  }
  async function saveAccount(asNew = false) {
    const identity = accountIdentity.value
    if (!identity) return
    accountBusy.value = true
    try {
      if (!accountAttempts) throw Error('Account save storage is unavailable')
      const backup = editor.capture()
      const saves = new AccountSaves(accountAttempts, saveLocalDraft, () => crypto.randomUUID())
      const result = await saves.save(ownerKey(identity), backup, asNew ? null : accountBinding.value)
      if (accountIdentity.value && ownerKey(accountIdentity.value) === ownerKey(identity) && result.matchesCurrent) {
        accountBinding.value = {draftId:result.saved.draftId, versionId:result.saved.versionId}
        accountStatus.value = editor.capture() === backup
          ? 'Local draft saved. Image files are not included.'
          : 'An earlier snapshot was saved. Newer edits remain open and unsaved.'
      } else accountStatus.value = 'An earlier pending save was resolved. Your current work remains open; save again to store it.'
      accountDrafts.value = await listLocalDrafts()
    } catch (error) {accountError(error)}
    finally {accountBusy.value = false}
  }
  async function openAccountDraft(id:string) {
    const identity = accountIdentity.value
    if (!identity) return
    accountBusy.value = true
    try {
      if (!accountAttempts) throw Error('Account save storage is unavailable')
      if (await accountAttempts.peek(ownerKey(identity))) {accountStatus.value = 'A previous save needs a retry before opening another draft. Your current work remains open.'; return}
      const saved = await openLocalDraft(id), recovered = await decodeRecovery(saved.recovery)
      if (recovered.status === 'read-only') {
        editor.readOnly(`This backup is read-only: ${recovered.issues.join('; ')}. The current study remains open; download the read-only backup below.`, saved.recovery)
        accountStatus.value = 'The current work remains open. Download the read-only backup from Local recovery.'
        return
      }
      if (await editor.adopt(recovered, saved.recovery)) {
        accountBinding.value = {draftId:id, versionId:saved.versionId}
        accountStatus.value = 'Local draft opened. Image files need to be selected again.'
      } else accountStatus.value = 'The current work remains open. Read-only recoveries can be downloaded from Local recovery.'
    } catch (error) {accountError(error)}
    finally {accountBusy.value = false}
  }
  function resetBinding() {accountBinding.value = null}
  onMounted(() => {
    try {accountAttempts = indexedAccountAttempts(indexedDB)} catch {accountAttempts = undefined}
    void refreshAccount()
  })
  onUnmounted(() => {clearInterval(loginTimer); loginPopup?.close()})
  return {accountAvailable, accountIdentity, accountDrafts, accountBinding, accountStatus, accountBusy,
    refreshAccount, signInLocally, signOutLocally, saveAccount, openAccountDraft, resetBinding}
}
