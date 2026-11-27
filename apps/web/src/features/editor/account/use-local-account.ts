import {onMounted, onUnmounted, ref, shallowRef} from 'vue'
import {decodeRecovery, type RecoveryResult} from '../../../drafts/recovery-codec'
import {indexedAccountAttempts} from './attempt-store'
import {AccountRequestError, AccountSaves, type AttemptStore, type DraftBinding} from './saves'
import {localSession, listLocalDrafts, saveLocalDraft, openLocalDraft, logoutLocal, ownerHeader, type LocalIdentity, type LocalDraft} from './api'
import {compareAttempt, StaleComparisonError, type AttemptComparison} from './comparison'

interface EditorRecovery {
  capture(): string
  adopt(result:RecoveryResult, backup:string, options?:{message?:string; verify?:()=>Promise<boolean>}): Promise<boolean>
  readOnly(message:string, backup:string): void
  download(backup:string, filename:string): void
}

export function useLocalAccount(editor:EditorRecovery, enabled:boolean) {
  const accountAvailable = ref(false)
  const accountIdentity = shallowRef<LocalIdentity | null>(null)
  const accountDrafts = shallowRef<readonly LocalDraft[]>([])
  const accountNextCursor = ref<string | null>(null)
  const accountPreviousPage = ref(false)
  let accountPageCursors:(string | null)[] = [null], accountPage = 0
  const accountBinding = shallowRef<DraftBinding | null>(null)
  const accountStatus = ref('Checking local account availability.')
  const accountBusy = ref(false)
  const accountPending = ref(false)
  const accountComparison = shallowRef<AttemptComparison | null>(null)
  let accountOwner = '', documentOwner = '', generation = 0, documentGeneration = 0, inputGeneration = 0, disposed = false, savedCurrent = false
  let comparisonOwner = '', comparisonGeneration = -1, comparisonInput = -1
  let accountAttempts: AttemptStore | undefined
  let loginPopup: Window | null = null
  let loginTimer: ReturnType<typeof setInterval> | undefined
  let loginListener: ((event:MessageEvent) => void) | undefined
  const ownerKey = (identity:LocalIdentity) => JSON.stringify([identity.issuer, identity.subject])
  const active = (token:number, owner?:string) => !disposed && token === generation && (!owner || (!!accountIdentity.value && ownerKey(accountIdentity.value) === owner))
  function closeComparison() {accountComparison.value = null}
  function operationGeneration() {return generation}
  function bindRestored(binding:DraftBinding) {accountBinding.value = binding; documentOwner = accountIdentity.value ? ownerKey(accountIdentity.value) : ''; savedCurrent = true}
  function resetBinding(forgetOwner = true) {accountBinding.value = null; documentGeneration++; savedCurrent = false; closeComparison(); if (forgetOwner) documentOwner = ''}
  function clearIdentity() {accountIdentity.value = null; accountDrafts.value = []; accountNextCursor.value = null; accountPreviousPage.value = false; accountPageCursors = [null]; accountPage = 0; accountPending.value = false; accountOwner = ''; resetBinding(false)}
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
  async function refreshAccount(expectedOwner?:string) {
    if (!enabled) {accountStatus.value = 'Local account service is not configured or is unavailable. Your current work stays in this browser.'; return}
    const token = ++generation
    closeComparison()
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
      accountOwner = owner; accountIdentity.value = identity; accountAvailable.value = true
      const drafts = await listLocalDrafts(owner)
      if (!active(token, owner)) return
      const confirmed = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(confirmed) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
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
    closeComparison()
    accountBusy.value = true
    try {
      if (!accountAttempts) throw Error('Account save storage is unavailable')
      if (documentOwner && documentOwner !== owner) {
        if (!window.confirm('This work was loaded or saved under a different local account. Save a separate copy under the current account?')) return
        const confirmed = await localSession()
        if (!active(token, owner)) return
        if (ownerKey(confirmed) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      }
      const backup = editor.capture()
      const saves = new AccountSaves(accountAttempts, attempt => saveLocalDraft(attempt, owner), () => crypto.randomUUID())
      const result = await saves.save(owner, backup, asNew ? null : accountBinding.value, !asNew)
      if (!active(token, owner)) return
      const currentIdentity = await localSession()
      if (!active(token, owner)) return
      if (ownerKey(currentIdentity) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return}
      if (result.matchesCurrent && documentGeneration === documentAtStart) {
        accountBinding.value = {draftId:result.saved.draftId, versionId:result.saved.versionId}
        documentOwner = owner
        savedCurrent = editor.capture() === backup
        accountStatus.value = savedCurrent ? `Local draft saved. Revision ${result.saved.versionId}, saved ${result.saved.savedAt} (UTC). Image files are not included.` : `An earlier snapshot was saved as revision ${result.saved.versionId} at ${result.saved.savedAt} (UTC). Newer edits remain open and unsaved.`
      } else accountStatus.value = `An earlier pending save was resolved. Revision ${result.saved.versionId}, saved ${result.saved.savedAt} (UTC). Your current work remains open; save again to store it.`
      await saves.acknowledge(owner, result.attemptKey)
      if (!active(token, owner)) return
      accountPending.value = false
      const drafts = await listLocalDrafts(owner)
      if (active(token, owner)) {accountDrafts.value = drafts.drafts; accountNextCursor.value = drafts.nextCursor; accountPageCursors = [null]; accountPage = 0; accountPreviousPage.value = false}
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
        documentOwner = owner
        accountStatus.value = `Local draft opened. Revision ${saved.versionId}, saved ${saved.savedAt} (UTC). Image files need to be selected again.`
      } else accountStatus.value = 'The current work remains open.'
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  function currentComparison(): AttemptComparison | undefined {
    if (!accountComparison.value || !active(comparisonGeneration, comparisonOwner) || inputGeneration !== comparisonInput) {
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
    const identity = accountIdentity.value
    if (!identity || !accountAttempts) return
    const token = ++generation, owner = ownerKey(identity), inputAt = inputGeneration
    closeComparison(); accountBusy.value = true
    let ownerChanged = false
    try {
      const currentBackup = editor.capture(), attempt = await accountAttempts.peek(owner)
      if (!active(token, owner) || inputGeneration !== inputAt) throw new StaleComparisonError()
      if (!attempt) {accountPending.value = false; accountStatus.value = 'No pending account save was found.'; return}
      const comparison = await compareAttempt({attempt, currentBackup,
        fetchHead:id => openLocalDraft(id, owner),
        confirmOwner:async () => {const identityNow = await localSession(); ownerChanged = ownerKey(identityNow) !== owner; return !ownerChanged},
        isCurrent:() => active(token, owner) && inputGeneration === inputAt})
      const latest = await accountAttempts.peek(owner)
      if (!active(token, owner) || inputGeneration !== inputAt || !sameAttempt(attempt, latest)) throw new StaleComparisonError()
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
  async function verifyComparison(token:number, owner:string, inputAt:number, view:AttemptComparison, verifyHead:boolean): Promise<boolean> {
    if (!accountAttempts || !active(token, owner) || inputGeneration !== inputAt) return false
    const [identity, pending] = await Promise.all([localSession(), accountAttempts.peek(owner)])
    if (!active(token, owner) || inputGeneration !== inputAt) return false
    if (ownerKey(identity) !== owner) {clearIdentity(); accountStatus.value = 'The local account changed. Your current work remains open; sign in again.'; return false}
    if (!sameAttempt(view.attempt, pending)) return false
    if (verifyHead && view.head && view.attempt.draftId) {
      const latest = await openLocalDraft(view.attempt.draftId, owner)
      if (!active(token, owner) || inputGeneration !== inputAt || latest.versionId !== view.head.versionId) return false
    }
    return true
  }
  async function recoverRetained() {
    const view = currentComparison(), identity = accountIdentity.value
    if (!view || !identity || view.retained.status !== 'decoded') return
    const token = ++generation, owner = ownerKey(identity), inputAt = inputGeneration
    accountBusy.value = true
    try {
      const adopted = await editor.adopt(view.retained, view.attempt.recovery, {
        message:'Replace the current study with the retained save as a new local draft? The earlier request may already have succeeded. Download current work first if needed.',
        verify:() => verifyComparison(token, owner, inputAt, view, false),
      })
      if (!active(token, owner)) return
      if (adopted) documentOwner = owner
      else closeComparison()
      accountStatus.value = adopted
        ? 'Retained save recovered as a new local draft. The original pending save remains available; download or discard it before saving this copy.'
        : 'The current work remains open. Compare again if the account or work changed.'
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  async function openConfirmedHead() {
    const view = currentComparison(), identity = accountIdentity.value
    if (!view?.head || !view.attempt.draftId || !identity || view.head.decoded.status !== 'decoded') return
    const token = ++generation, owner = ownerKey(identity), inputAt = inputGeneration, head = view.head
    accountBusy.value = true
    try {
      const adopted = await editor.adopt(head.decoded, head.recovery, {
        message:`Replace the current study with confirmed revision ${head.versionId}, saved ${head.savedAt} (UTC)? The retained save will remain available.`,
        verify:() => verifyComparison(token, owner, inputAt, view, true),
      })
      if (!active(token, owner)) return
      if (adopted) {
        accountBinding.value = {draftId:view.attempt.draftId, versionId:head.versionId}
        documentOwner = owner
        accountStatus.value = `Confirmed revision ${head.versionId}, saved ${head.savedAt} (UTC), opened. The retained save remains available.`
      } else {closeComparison(); accountStatus.value = 'The current work remains open. Compare again if the server head, account or work changed.'}
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  async function saveCurrentCopy() {
    const view = currentComparison(), identity = accountIdentity.value
    if (!view || !identity || !accountAttempts) return
    const token = ++generation, owner = ownerKey(identity), inputAt = inputGeneration
    accountBusy.value = true
    try {
      if (!window.confirm('Discard the retained pending save and save current work as a new local draft? Download the retained backup first if needed. The earlier request may already have succeeded.')) {closeComparison(); return}
      if (!await verifyComparison(token, owner, inputAt, view, false)) {if (active(token)) accountStatus.value = 'The account or current work changed. Compare again; your work remains open.'; return}
      await accountAttempts.finish(owner, view.attempt.key)
      if (!active(token, owner)) return
      if (inputGeneration !== inputAt) {accountPending.value = false; closeComparison(); accountStatus.value = 'The retained save was discarded as requested. Current work changed and was not saved; save again.'; return}
      if (await accountAttempts.peek(owner)) {accountStatus.value = 'Another pending save exists. Compare again before saving a copy.'; return}
      if (!active(token, owner) || inputGeneration !== inputAt) return
      accountPending.value = false; closeComparison()
      await saveAccount(true)
    } catch (error) {if (active(token, owner)) accountError(error)}
    finally {if (active(token)) accountBusy.value = false}
  }
  function downloadCurrentComparison() {const view = currentComparison(); if (view) editor.download(view.currentBackup, 'current-work-backup.json')}
  function downloadHeadComparison() {const view = currentComparison(); if (view?.head) editor.download(view.head.recovery, 'confirmed-server-backup.json')}
  onMounted(() => {
    if (!enabled) {accountStatus.value = 'Local account service is not configured or is unavailable. Your current work stays in this browser.'; return}
    try {accountAttempts = indexedAccountAttempts(indexedDB)} catch {accountAttempts = undefined}
    void refreshAccount()
  })
  onUnmounted(() => {disposed = true; generation++; clearLogin(); loginPopup?.close()})
  return {accountAvailable, accountIdentity, accountDrafts, accountNextCursor, accountPreviousPage, accountBinding, accountStatus, accountBusy, accountPending, accountComparison, changeDraftPage,
    refreshAccount, signInLocally, signOutLocally, saveAccount, openAccountDraft, downloadPendingSave, discardPendingSave,
    comparePendingSave, recoverRetained, openConfirmedHead, saveCurrentCopy, downloadCurrentComparison, downloadHeadComparison, closeComparison, resetBinding, noteEdit, operationGeneration, bindRestored}
}
