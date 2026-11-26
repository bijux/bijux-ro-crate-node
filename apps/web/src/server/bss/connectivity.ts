export type Environment = Readonly<Record<string, string | undefined>>

/** Resolve one configured API base without accepting embedded credentials. */
export function bssBase(env: Environment): URL | null {
  const mode = env.BSS_MODE ?? 'standalone'
  if (mode === 'standalone') return null
  if (mode !== 'local' && mode !== 'connected') throw new Error('Invalid BSS mode')
  if (!env.BSS_API_BASE_URL) throw new Error('BSS API base URL is required')
  const base = new URL(env.BSS_API_BASE_URL)
  if (base.username || base.password || base.search || base.hash) throw new Error('Invalid BSS API base URL')
  if (mode === 'connected' && base.protocol !== 'https:') throw new Error('BSS requires HTTPS')
  if (mode === 'local') {
    const allowed = ['localhost', '127.0.0.1', '[::1]', env.BSS_LOCAL_SERVICE_HOST].filter(Boolean)
    if (base.protocol !== 'http:' || !allowed.includes(base.hostname)) throw new Error('Invalid local BSS host')
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`
  return base
}

/** Resolve the health endpoint under the configured API prefix. */
export function healthEndpoint(env: Environment): URL | null {
  const base = bssBase(env)
  return base ? new URL('health', base) : null
}

export async function checkConnectivity(env: Environment, request: typeof fetch = fetch): Promise<'disabled' | 'reachable' | 'unavailable' | 'misconfigured'> {
  let endpoint: URL | null
  try {endpoint = healthEndpoint(env)} catch {return 'misconfigured'}
  if (!endpoint) return 'disabled'
  try {
    const response = await request(endpoint, {redirect: 'manual', signal: AbortSignal.timeout(3000), cache: 'no-store'})
    await response.body?.cancel()
    return response.ok ? 'reachable' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}
