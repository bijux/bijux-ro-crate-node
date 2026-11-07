export function makeURLCases(minimal) {
  const values = [
    ['hostname-port', 'http://host:bad/path'], ['ipv6-port', 'http://[::1]:bad'],
    ['ftp-port', 'ftp://host:bad'], ['websocket-port', 'ws://host:bad/path'],
    ['ipv6-host-before-port', 'http://[foo]:bad/path'], ['domain-before-port', 'http://exa mple:bad/path'],
    ['ipv4-before-port', 'http://999.999.999.999:bad/path'], ['opaque-scheme-port', 'custom://host:bad/path'],
    ['file-port', 'file://host:bad/path'], ['credentials-bracket', 'http://user[abc]@host:bad/path'],
    ['hostname-port-control', 'http://host:80/path'], ['ipv6-port-control', 'http://[::1]:80/path'],
    ['path-bracket-control', 'http://host/path[bracket]'],
  ]
  return values.map(([name, value]) => {
    const files = structuredClone(minimal.files)
    const doc = JSON.parse(files['ro-crate-metadata.json'])
    const author = doc['@graph'].find(entity => entity['@type']?.includes('bia:Contributor'))
    author.website = value
    files['ro-crate-metadata.json'] = JSON.stringify(doc)
    return {name: 'url/' + name, files, kind: 'mutation'}
  })
}
