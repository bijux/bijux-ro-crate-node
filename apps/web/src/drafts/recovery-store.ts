export interface RecoveryRecord {readonly id:string; readonly revision:number; readonly savedAt:number; readonly backup:string}
export interface RecoveryStore {
  list(): Promise<readonly RecoveryRecord[]>
  save(id:string, expected:number | null, backup:string): Promise<RecoveryRecord>
  remove(id:string, expected:number): Promise<void>
}

/** Each tab writes its own record. Revision comparison and write share one transaction. */
export function indexedRecoveryStore(factory: IDBFactory): RecoveryStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('bijux-draft-recovery', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', {keyPath:'id'})
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(Error('Recovery database is blocked by another tab'))
  })
  return {
    async list() {
      const db = await database
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readonly')
        const request = transaction.objectStore('drafts').getAll()
        request.onsuccess = () => resolve(request.result as RecoveryRecord[])
        request.onerror = () => reject(request.error)
        transaction.onabort = () => reject(transaction.error)
      })
    },
    async save(id, expected, backup) {
      const db = await database
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readwrite')
        const store = transaction.objectStore('drafts')
        const request = store.get(id)
        let record: RecoveryRecord | undefined
        let problem: Error | undefined
        request.onsuccess = () => {
          const prior = request.result as RecoveryRecord | undefined
          if ((prior?.revision ?? null) !== expected) {problem = Error('This recovery copy changed in another tab'); transaction.abort(); return}
          const write = () => {record = {id, revision:(prior?.revision ?? 0) + 1, savedAt:Date.now(), backup}; store.put(record)}
          if (prior) write()
          else {
            const count = store.count()
            count.onsuccess = () => {if (count.result >= 20) {problem = Error('Recovery storage has 20 copies; delete an unneeded copy first'); transaction.abort()} else write()}
          }
        }
        transaction.oncomplete = () => resolve(record!)
        transaction.onabort = () => reject(problem ?? transaction.error ?? Error('Recovery save failed'))
        transaction.onerror = () => { /* abort reports the transaction failure */ }
      })
    },
    async remove(id, expected) {
      const db = await database
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readwrite')
        const store = transaction.objectStore('drafts')
        const request = store.get(id)
        let problem: Error | undefined
        request.onsuccess = () => {
          const prior = request.result as RecoveryRecord | undefined
          if (!prior || prior.revision !== expected) {problem = Error('This recovery copy changed in another tab'); transaction.abort(); return}
          store.delete(id)
        }
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(problem ?? transaction.error ?? Error('Recovery deletion failed'))
      })
    },
  }
}
