import type {APIRoute} from 'astro'
import {createOlsProvider} from '../../server/vocabulary/ols.js'

const provider = createOlsProvider()
export const GET: APIRoute = async ({url}) => {
  const kind = url.searchParams.get('kind')
  const mode = url.searchParams.get('mode')
  const value = url.searchParams.get('value')
  if ((kind !== 'taxonomy' && kind !== 'imaging') || (mode !== 'search' && mode !== 'exact') || value === null || value.length > 100 || [...url.searchParams].length !== 3) return new Response('Invalid vocabulary request', {status:400})
  const result = mode === 'search' ? await provider.search(kind,value) : await provider.exact(kind,value)
  return new Response(JSON.stringify(result), {headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})
}
