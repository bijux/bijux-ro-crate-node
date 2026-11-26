import { AccountRequestError, type SavedDraft } from './saves.js'
export type RestoredDraft = Pick<SavedDraft, 'draftId' | 'versionId' | 'contentHash'>
export interface RestoreAttempt { readonly key:string; readonly draftId:string; readonly expectedHead:string; readonly sourceVersion:string }
export interface RestoreAttemptStore {
  claim(owner:string, proposed:RestoreAttempt):Promise<RestoreAttempt>
  finish(owner:string, key:string):Promise<void>
}

/** Read an existing attempt without creating or changing browser storage. */
export async function readPendingHistoryRestore(factory:IDBFactory, owner:string):Promise<RestoreAttempt | null> {
  if (typeof factory.databases !== 'function') throw Error('Browser cannot list local databases')
  if (!(await factory.databases()).some(database => database.name === 'bijux-history-restores')) return null
  const db = await new Promise<IDBDatabase>((resolve,reject) => {
    const request = factory.open('bijux-history-restores')
    let abandoned = false
    request.onupgradeneeded = () => {abandoned = true; request.transaction?.abort()}
    request.onblocked = () => {abandoned = true; reject(Error('Restore storage is blocked'))}
    request.onerror = () => reject(request.error ?? Error('Restore storage could not be opened'))
    request.onsuccess = () => {if (abandoned) request.result.close(); else resolve(request.result)}
  })
  try {
    if (db.version !== 1 || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains('attempts')) throw Error('Restore storage has an unexpected format')
    return await new Promise((resolve,reject) => {
      const tx = db.transaction('attempts','readonly'), store = tx.objectStore('attempts')
      if (store.keyPath !== 'owner') {tx.abort(); reject(Error('Restore storage has an unexpected format')); return}
      const request = store.get(owner)
      let result:RestoreAttempt | null = null, invalid = false
      request.onsuccess = () => {
        const record:unknown = request.result
        if (record === undefined) return
        if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).some(key => !['owner','attempt'].includes(key))) {invalid = true; return}
        const item = record as {owner?:unknown; attempt?:unknown}, value = item.attempt
        if (item.owner !== owner || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'draftId,expectedHead,key,sourceVersion') {invalid = true; return}
        const fields = value as Record<string,unknown>
        if (!['key','draftId','expectedHead','sourceVersion'].every(key => typeof fields[key] === 'string')) {invalid = true; return}
        result = {key:fields.key as string, draftId:fields.draftId as string, expectedHead:fields.expectedHead as string, sourceVersion:fields.sourceVersion as string}
      }
      tx.oncomplete = () => invalid ? reject(Error('Stored restore attempt has an unexpected format')) : resolve(result)
      tx.onabort = () => reject(tx.error ?? Error('Restore storage could not be read'))
      tx.onerror = () => { /* abort reports the error */ }
    })
  } finally {db.close()}
}
export class HistoryRestores {
  constructor(private readonly store:RestoreAttemptStore, private readonly send:(attempt:RestoreAttempt) => Promise<RestoredDraft>, private readonly key:() => string) {}
  async restore(owner:string, draftId:string, expectedHead:string, sourceVersion:string) {
    const attempt = await this.store.claim(owner, {key:this.key(), draftId, expectedHead, sourceVersion})
    let saved:RestoredDraft
    try { saved = await this.send(attempt) }
    catch (error) {
      if (error instanceof AccountRequestError && [400,404,409,413,415].includes(error.status)) await this.store.finish(owner, attempt.key)
      throw error
    }
    await this.store.finish(owner, attempt.key)
    return {saved, matchesCurrent:attempt.draftId === draftId && attempt.expectedHead === expectedHead && attempt.sourceVersion === sourceVersion}
  }
}
export function indexedHistoryRestores(factory:IDBFactory):RestoreAttemptStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('bijux-history-restores', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('attempts', {keyPath:'owner'})
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(Error('Restore storage is blocked'))
  })
  return {
    async claim(owner, proposed) {
      const db = await database
      return new Promise((resolve, reject) => {
        const tx = db.transaction('attempts', 'readwrite'), store = tx.objectStore('attempts'), request = store.get(owner)
        let attempt:RestoreAttempt | undefined
        request.onsuccess = () => {
          if (request.result) {
            const value:unknown = request.result.attempt
            if (!value || typeof value !== 'object' || !['key','draftId','expectedHead','sourceVersion'].every(key => typeof (value as Record<string, unknown>)[key] === 'string')) {tx.abort(); return}
            attempt = value as RestoreAttempt
          } else {attempt = proposed; store.put({owner, attempt})}
        }
        tx.oncomplete = () => resolve(attempt!)
        tx.onabort = () => reject(tx.error ?? Error('Restore storage failed'))
      })
    },
    async finish(owner, key) {
      const db = await database
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('attempts', 'readwrite'), store = tx.objectStore('attempts'), request = store.get(owner)
        request.onsuccess = () => {if (request.result?.attempt?.key === key) store.delete(owner)}
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error ?? Error('Restore storage failed'))
      })
    },
  }
}
