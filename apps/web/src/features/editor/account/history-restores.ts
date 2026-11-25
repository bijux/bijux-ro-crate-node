import { AccountRequestError, type SavedDraft } from './saves.js'
export interface RestoreAttempt { readonly key:string; readonly draftId:string; readonly expectedHead:string; readonly sourceVersion:string }
export interface RestoreAttemptStore {
  claim(owner:string, proposed:RestoreAttempt):Promise<RestoreAttempt>
  finish(owner:string, key:string):Promise<void>
}
export class HistoryRestores {
  constructor(private readonly store:RestoreAttemptStore, private readonly send:(attempt:RestoreAttempt) => Promise<SavedDraft>, private readonly key:() => string) {}
  async restore(owner:string, draftId:string, expectedHead:string, sourceVersion:string) {
    const attempt = await this.store.claim(owner, {key:this.key(), draftId, expectedHead, sourceVersion})
    let saved:SavedDraft
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
