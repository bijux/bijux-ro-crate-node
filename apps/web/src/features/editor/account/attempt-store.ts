import type { AttemptStore, SaveAttempt } from './saves'

interface AttemptRecord { owner: string; attempt: SaveAttempt }
function valid(value: unknown): value is SaveAttempt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.key === 'string' && typeof record.recovery === 'string' &&
    (record.draftId === undefined || typeof record.draftId === 'string') &&
    (record.expectedHead === undefined || typeof record.expectedHead === 'string')
}

/** Pending saves survive reloads; concurrent tabs share the same unresolved key. */
export function indexedAccountAttempts(factory: IDBFactory): AttemptStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('bijux-account-attempts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('attempts', {keyPath:'owner'})
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(Error('Account save storage is blocked by another tab'))
  })
  return {
    async peek(owner) {
      const db = await database
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('attempts', 'readonly')
        const request = transaction.objectStore('attempts').get(owner)
        request.onsuccess = () => {
          const prior = request.result as AttemptRecord | undefined
          if (prior && !valid(prior.attempt)) {reject(Error('Stored account save is invalid')); return}
          resolve(prior?.attempt)
        }
        request.onerror = () => reject(request.error)
        transaction.onabort = () => reject(transaction.error ?? Error('Account save storage failed'))
      })
    },
    async claim(owner, proposed) {
      const db = await database
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('attempts', 'readwrite'), store = transaction.objectStore('attempts')
        const request = store.get(owner)
        let result: SaveAttempt | undefined, problem: Error | undefined
        request.onsuccess = () => {
          const prior = request.result as AttemptRecord | undefined
          if (prior) {
            if (!valid(prior.attempt)) {problem = Error('Stored account save is invalid'); transaction.abort(); return}
            result = prior.attempt
          } else {
            result = proposed
            try {store.put({owner, attempt:proposed} satisfies AttemptRecord)}
            catch (error) {problem = error instanceof Error ? error : Error('Account save storage failed'); transaction.abort()}
          }
        }
        transaction.oncomplete = () => resolve(result!)
        transaction.onabort = () => reject(problem ?? transaction.error ?? Error('Account save storage failed'))
        transaction.onerror = () => { /* abort carries the error */ }
      })
    },
    async finish(owner, key) {
      const db = await database
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('attempts', 'readwrite'), store = transaction.objectStore('attempts')
        const request = store.get(owner)
        request.onsuccess = () => {const prior = request.result as AttemptRecord | undefined; if (prior?.attempt?.key === key) store.delete(owner)}
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error ?? Error('Account save storage failed'))
        transaction.onerror = () => { /* abort carries the error */ }
      })
    },
  }
}
