import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

/** Restrict a temporary apt view to the runner's Ubuntu archive and its keyring. */
export function validateUbuntuSources(text:string):void {
  const paragraphs = text.split(/\r?\n\s*\r?\n/).map(part => part.split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#'))).filter(lines => lines.length)
  const suites = new Set<string>()
  for (const lines of paragraphs) {
    const fields = new Map<string,string>()
    for (const line of lines) {
      const match = line.match(/^([A-Za-z-]+):\s*(.*?)\s*$/)
      if (!match || fields.has(match[1])) throw Error('Unsupported Ubuntu source format')
      fields.set(match[1], match[2])
    }
    for (const key of fields.keys()) if (!['Types','URIs','Suites','Components','Signed-By','Enabled','Architectures'].includes(key)) throw Error('Unsupported Ubuntu source field')
    if (fields.get('Types') !== 'deb' || fields.get('Signed-By') !== '/usr/share/keyrings/ubuntu-archive-keyring.gpg' || (fields.has('Enabled') && fields.get('Enabled') !== 'yes')) throw Error('Ubuntu source must use the archive signing key')
    const uris = (fields.get('URIs') ?? '').split(/\s+/)
    if (!uris.length || uris.some(uri => {
      if (uri === 'mirror+file:/etc/apt/apt-mirrors.txt') return false
      try {const value = new URL(uri); return !['http:','https:'].includes(value.protocol) || !!value.username || !!value.password || !!value.port || !/(^|\.)ubuntu\.com$/.test(value.hostname) || value.pathname.replace(/\/$/, '') !== '/ubuntu' || !!value.search || !!value.hash} catch {return true}
    })) throw Error('Unsupported Ubuntu repository URI')
    const entries = (fields.get('Suites') ?? '').split(/\s+/)
    if (entries.some(item => !['noble','noble-updates','noble-security','noble-backports'].includes(item))) throw Error('Unsupported Ubuntu suite')
    for (const item of entries) suites.add(item)
    const components = (fields.get('Components') ?? '').split(/\s+/)
    if (!components.includes('main') || !components.includes('universe') || components.some(item => !['main','universe','restricted','multiverse'].includes(item))) throw Error('Unsupported Ubuntu components')
    if (fields.has('Architectures') && !/^(amd64|arm64)(\s+(amd64|arm64))*$/.test(fields.get('Architectures')!)) throw Error('Unsupported Ubuntu architectures')
  }
  if (!['noble','noble-updates','noble-security'].every(suite => suites.has(suite))) throw Error('Required Ubuntu suites are missing')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2]
  if (!path) throw Error('Ubuntu source path is required')
  validateUbuntuSources(readFileSync(path, 'utf8'))
}
