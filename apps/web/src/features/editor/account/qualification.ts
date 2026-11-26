export interface QualificationResult {
  policy:string
  version:{versionId:string; contentHash:string}
  digest:string
  status:'valid' | 'invalid' | 'incomplete'
  reason?:string
  result?:{report:{issues:Record<'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG', Array<{message:string}>>}}
}
/** Match the server's sorted, length-framed frozen file digest. */
export async function frozenDigest(files:readonly {path:string; base64:string}[]):Promise<string> {
  const encoder = new TextEncoder(), chunks:Uint8Array[] = []
  let size = 0
  for (const file of [...files].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    if (file.base64.length > Math.ceil(16 * 1024 * 1024 / 3) * 4) throw Error('Frozen files exceed the local limit')
    const path = encoder.encode(file.path), bytes = Uint8Array.from(atob(file.base64), char => char.charCodeAt(0))
    size += 8 + path.byteLength + bytes.byteLength
    if (size > 17 * 1024 * 1024) throw Error('Frozen files exceed the local limit')
    const header = new Uint8Array(8), view = new DataView(header.buffer)
    view.setUint32(0, path.byteLength); view.setUint32(4, bytes.byteLength)
    chunks.push(header,path,bytes)
  }
  const framed = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {framed.set(chunk, offset); offset += chunk.length}
  const hash = await crypto.subtle.digest('SHA-256', framed)
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,'0')).join('')
}
