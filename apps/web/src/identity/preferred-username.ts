/** A display hint is not an account identity or an authorization input. */
export function preferredUsername(value:unknown):string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) || new TextEncoder().encode(value).length > 256) return null
  return value
}
