type Vocabulary = 'taxonomy' | 'imaging'
type Term = {source:string; identifier:string; label:string; synonyms?:string[]; obsolete:boolean; retrievedAt:string; replacement?:string}
type Exact = {status:'found'; term:Term} | {status:'not-found'; identifier:string; source:string; retrievedAt:string} | {status:'unavailable'}
type Search = {status:'ok'; suggestions:Array<{identifier:string; label:string}>} | {status:'unavailable'}
const ontologies: Record<Vocabulary,string> = {taxonomy:'ncbitaxon', imaging:'FBbi'}
const validIdentifier = (kind:Vocabulary, id:string) => (kind === 'taxonomy' ? /^NCBITaxon:\d{1,12}$/ : /^FBbi:\d{1,12}$/).test(id)
const object = (value:unknown): value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Fixed OLS destinations and bounded responses keep user input out of network authority. */
export function createOlsProvider(options: {fetch?: typeof fetch; timeoutMs?:number} = {}) {
  const request = options.fetch ?? fetch
  const cache = new Map<string,{expires:number; result:Exact}>()
  async function get(url:URL):Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000)
    try {
      const response = await request(url, {signal:controller.signal, redirect:'error', headers:{accept:'application/json'}})
      if (response.status === 404) return null
      if (!response.ok || !response.body) throw Error('OLS unavailable')
      const reader = response.body.getReader(); const chunks:Uint8Array[] = []; let size = 0
      while (true) {
        const part = await reader.read(); if (part.done) break
        size += part.value.length; if (size > 256 * 1024) {await reader.cancel(); throw Error('OLS response too large')}
        chunks.push(part.value)
      }
      const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) {bytes.set(chunk,offset); offset += chunk.length}
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown
    } finally {clearTimeout(timeout)}
  }
  async function exact(kind:Vocabulary, identifier:string):Promise<Exact> {
    if (!Object.hasOwn(ontologies,kind) || !validIdentifier(kind,identifier)) return {status:'unavailable'}
    const key = `${kind}:${identifier}`; const prior = cache.get(key)
    if (prior && prior.expires > Date.now()) return structuredClone(prior.result)
    try {
      const iri = `http://purl.obolibrary.org/obo/${identifier.replace(':','_')}`
      const url = new URL(`https://www.ebi.ac.uk/ols4/api/ontologies/${ontologies[kind]}/terms/${encodeURIComponent(encodeURIComponent(iri))}`)
      const data = await get(url)
      let result:Exact
      if (data === null) {
        const ontology = await get(new URL(`https://www.ebi.ac.uk/ols4/api/ontologies/${ontologies[kind]}`))
        if (!object(ontology) || typeof ontology.ontologyId !== 'string' || ontology.ontologyId.toLowerCase() !== ontologies[kind].toLowerCase()) throw Error('Ontology unavailable')
        result = {status:'not-found',identifier,source:'EMBL-EBI OLS',retrievedAt:new Date().toISOString()}
      }
      else {
        if (!object(data) || data.obo_id !== identifier || typeof data.label !== 'string' || typeof data.is_obsolete !== 'boolean') throw Error('Unexpected OLS term')
        if (data.synonyms !== undefined && (!Array.isArray(data.synonyms) || data.synonyms.some(value => typeof value !== 'string'))) throw Error('Unexpected OLS synonyms')
        result = {status:'found',term:{source:'EMBL-EBI OLS', identifier, label:data.label, ...(Array.isArray(data.synonyms) ? {synonyms:[...data.synonyms] as string[]} : {}), obsolete:data.is_obsolete, retrievedAt:new Date().toISOString(), ...(typeof data.term_replaced_by === 'string' && data.term_replaced_by ? {replacement:data.term_replaced_by} : {})}}
      }
      if (cache.size >= 100) cache.delete(cache.keys().next().value!)
      cache.set(key,{expires:Date.now() + 300000,result})
      return structuredClone(result)
    } catch {return {status:'unavailable'}}
  }
  async function search(kind:Vocabulary, query:string):Promise<Search> {
    if (!Object.hasOwn(ontologies,kind) || query.trim().length < 2 || query.length > 100) return {status:'unavailable'}
    try {
      const url = new URL('https://www.ebi.ac.uk/ols4/api/search')
      url.searchParams.set('q',query); url.searchParams.set('ontology',ontologies[kind]); url.searchParams.set('rows','10')
      const data = await get(url)
      if (!object(data) || !object(data.response) || !Array.isArray(data.response.docs)) throw Error('Unexpected OLS search')
      const suggestions = data.response.docs.filter(object).flatMap(item => typeof item.obo_id === 'string' && validIdentifier(kind,item.obo_id) && typeof item.label === 'string' ? [{identifier:item.obo_id,label:item.label}] : []).slice(0,10)
      return {status:'ok',suggestions}
    } catch {return {status:'unavailable'}}
  }
  return {exact,search}
}
