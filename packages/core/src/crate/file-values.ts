import type {CrateValue} from '../index.js'

const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!
const blobType = Object.getOwnPropertyDescriptor(Blob.prototype, 'type')!.get!
const blobSlice = Blob.prototype.slice
const blobBytes = Blob.prototype.arrayBuffer
const stringWellFormed = String.prototype.isWellFormed
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!
const typedArrayKind = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag)!.get!

function hasBrand(getter: (this: unknown) => unknown, value: unknown) {
  try {getter.call(value); return true} catch {return false}
}

export function cloneFileValue(value: CrateValue): CrateValue {
  if (typeof value === 'string') {
    // UTF-8 uploads replace lone surrogates; validation must not approve text
    // whose encoded bytes describe a different crate.
    if (!stringWellFormed.call(value)) throw new TypeError('Crate text contains an unpaired Unicode surrogate.')
    return value
  }
  // Intrinsic brand checks accept native objects from other realms and reject
  // objects which only imitate a prototype or Symbol.toStringTag.
  // The captured intrinsic getters establish the native brands across realms.
  if (typedArrayKind.call(value) === 'Uint8Array') return new Uint8Array(value as Uint8Array)
  if (hasBrand(bufferSize, value)) return new Uint8Array(new Uint8Array(value as ArrayBuffer)).buffer
  // Native slicing uses immutable storage, avoiding constructor-internal calls
  // to a subclass's size accessor while leaving payload bytes unread.
  if (hasBrand(blobSize, value))
    return Object.setPrototypeOf(blobSlice.call(value as Blob, 0, blobSize.call(value), blobType.call(value)), Blob.prototype)
  throw new TypeError('Crate files must contain text, Blob, Uint8Array or ArrayBuffer values.')
}

export async function fileText(value: CrateValue) {
  if (typeof value === 'string') return value
  // Workspace values have already passed cloneFileValue's native brand checks.
  const bytes = hasBrand(blobSize, value) ? await blobBytes.call(value as Blob) : value
  return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes as BufferSource)
}
