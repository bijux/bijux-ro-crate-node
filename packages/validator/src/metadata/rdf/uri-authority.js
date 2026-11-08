/** URI authority rejection shared by the pinned RDF and datatype boundaries. */
export function invalidURIAuthority(netloc) {
  if (netloc.includes('[') !== netloc.includes(']')) return true
  if (netloc.includes('[')) {
    const hostPort = netloc.slice(netloc.lastIndexOf('@') + 1)
    if (!hostPort.startsWith('[')) return true
    const end = hostPort.indexOf(']')
    const host = hostPort.slice(1, end), tail = hostPort.slice(end + 1)
    if (tail && !tail.startsWith(':')) return true
    if (host.startsWith('v')) {
      if (!/^v[a-f0-9]+\.[^\n]+$/i.test(host)) return true
    } else {
      const [address, ...scope] = host.split('%')
      if (!address.includes(':') || scope.length > 1 || (scope.length && !scope[0])) return true
      try {new URL('http://[' + address + ']/')} catch {return true}
    }
  }
  const text = netloc.replace(/[@:#?]/g, ''), normalized = text.normalize('NFKC')
  if (text !== normalized && /[/?#@:]/.test(normalized)) return true
  return false
}
