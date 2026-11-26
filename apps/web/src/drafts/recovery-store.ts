export interface RecoverySummary {readonly id:string; readonly revision:number; readonly savedAt:number}
export interface RecoveryRecord extends RecoverySummary {readonly backup:string}
export interface RecoveryStore {
  list(): Promise<readonly RecoverySummary[]>
  read(id:string, expected:number): Promise<RecoveryRecord>
  save(id:string, expected:number | null, backup:string): Promise<RecoveryRecord>
  remove(id:string, expected:number): Promise<void>
}

/** Each tab writes its own record. Revision comparison and write share one transaction. */
export function indexedRecoveryStore(factory: IDBFactory): RecoveryStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('bijux-draft-recovery', 2)
    let abandoned = false
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains('drafts')
        ? request.transaction!.objectStore('drafts') : request.result.createObjectStore('drafts', {keyPath:'id'})
      if (!store.indexNames.contains('bySaved')) store.createIndex('bySaved', ['savedAt','revision'])
    }
    request.onsuccess = () => {
      if (abandoned) {request.result.close(); return}
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {abandoned = true; reject(Error('Recovery database is blocked by another tab'))}
  })
  return {
    async list() {
      const db = await database
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readonly')
        const records: RecoverySummary[] = []
        const request = transaction.objectStore('drafts').index('bySaved').openKeyCursor(null, 'prev')
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {resolve(records); return}
          const key = cursor.key
          if (!Array.isArray(key) || typeof key[0] !== 'number' || typeof key[1] !== 'number' || typeof cursor.primaryKey !== 'string') {reject(Error('Invalid recovery metadata')); return}
          records.push({id:cursor.primaryKey, savedAt:key[0], revision:key[1]})
          cursor.continue()
        }
        request.onerror = () => reject(request.error)
        transaction.onabort = () => reject(transaction.error)
      })
    },
    async read(id, expected) {
      const db = await database
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readonly')
        const request = transaction.objectStore('drafts').get(id)
        request.onsuccess = () => {
          const record = request.result as RecoveryRecord | undefined
          if (!record || record.id !== id || record.revision !== expected || typeof record.backup !== 'string') {reject(Error('This recovery copy changed in another tab')); return}
          resolve(record)
        }
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
