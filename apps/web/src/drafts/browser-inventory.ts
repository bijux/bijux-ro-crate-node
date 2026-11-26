export interface BrowserStorageInventory {
  readonly recovery:number | null
  readonly pendingSaves:number | null
  readonly pendingRestores:number | null
}

/** Count existing stores without creating databases or reading their contents. */
export async function inventoryBrowserStorage(factory:IDBFactory):Promise<BrowserStorageInventory> {
  if (typeof factory.databases !== 'function') throw Error('This browser cannot list its local databases')
  const existing = new Set((await factory.databases()).map(database => database.name))
  async function count(name:string, store:string):Promise<number | null> {
    if (!existing.has(name)) return null
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name)
      let abandoned = false
      request.onupgradeneeded = () => {abandoned = true; request.transaction?.abort()}
      request.onblocked = () => {abandoned = true; reject(Error('Browser storage is blocked by another tab'))}
      request.onerror = () => reject(request.error ?? Error('Browser storage could not be opened'))
      request.onsuccess = () => {if (abandoned) request.result.close(); else resolve(request.result)}
    })
    try {
      if (!db.objectStoreNames.contains(store)) throw Error('Browser storage has an unexpected format')
      return await new Promise<number>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const request = tx.objectStore(store).count()
        let result:number | undefined
        request.onsuccess = () => {result = request.result}
        tx.oncomplete = () => result === undefined ? reject(Error('Browser storage could not be counted')) : resolve(result)
        tx.onabort = () => reject(tx.error ?? Error('Browser storage could not be counted'))
        tx.onerror = () => { /* abort reports the error */ }
      })
    } finally {db.close()}
  }
  const [recovery, pendingSaves, pendingRestores] = await Promise.all([
    count('bijux-draft-recovery', 'drafts'),
    count('bijux-account-attempts', 'attempts'),
    count('bijux-history-restores', 'attempts'),
  ])
  return {recovery, pendingSaves, pendingRestores}
}
