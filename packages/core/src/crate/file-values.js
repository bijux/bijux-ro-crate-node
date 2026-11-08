const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size').get
const blobType = Object.getOwnPropertyDescriptor(Blob.prototype, 'type').get
const blobSlice = Blob.prototype.slice
const blobBytes = Blob.prototype.arrayBuffer
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get
const typedArrayKind = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get

function hasBrand(getter, value) {
  try {getter.call(value); return true} catch {return false}
}

export function cloneFileValue(value) {
  if (typeof value === 'string') return value
  // Intrinsic brand checks accept native objects from other realms and reject
  // objects which only imitate a prototype or Symbol.toStringTag.
  if (typedArrayKind.call(value) === 'Uint8Array') return new Uint8Array(value)
  if (hasBrand(bufferSize, value)) return new Uint8Array(new Uint8Array(value)).buffer
  // Native slicing uses immutable storage, avoiding constructor-internal calls
  // to a subclass's size accessor while leaving payload bytes unread.
  if (hasBrand(blobSize, value))
    return Object.setPrototypeOf(blobSlice.call(value, 0, blobSize.call(value), blobType.call(value)), Blob.prototype)
  throw new TypeError('Crate files must contain text, Blob, Uint8Array or ArrayBuffer values.')
}

export async function fileText(value) {
  if (typeof value === 'string') return value
  const bytes = hasBrand(blobSize, value) ? await blobBytes.call(value) : value
  return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes)
}
