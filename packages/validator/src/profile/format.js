import {decodeCrateReference} from '@bijux/ro-crate-core'
const FILENAME = 'ro-crate-metadata.json'
const SPECIAL_KEYS = new Set(['@id', '@type', '@context', '@value', '@language'])
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function pythonRepr(x) {
  if (x === null) return 'None'
  if (typeof x === 'string') return "'" + x.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'"
  if (Array.isArray(x)) return '[' + x.map(pythonRepr).join(', ') + ']'
  if (isObject(x)) return '{' + Object.entries(x).map(([k,v]) => pythonRepr(k) + ': ' + pythonRepr(v)).join(', ') + '}'
  if (typeof x === 'boolean') return x ? 'True' : 'False'
  return String(x)
}

function entityLabel(entity) {
  const identifier = Object.hasOwn(entity,'@id') ? entity['@id'] : entity
  return typeof identifier === 'string' ? identifier : pythonRepr(identifier)
}

function flattened(value, err) {
  if (Array.isArray(value)) return value.map(v => flattened(v, err)).every(Boolean)
  if (!isObject(value)) return true
  const label = entityLabel(value)
  const message = msg => err('entity "' + label + '" ' + msg)
  let ok = true
  if ('@value' in value) {
    if ('@id' in value) {
      message('contains both @id and @value: an object with an @value represents a value object, which is a literal value such as a string, number, date, or language-tagged string. This object is not an identifiable resource, but a simple literal value.')
      ok = false
    }
    if ('@language' in value && '@type' in value) {
      message('is not a valid value object: @language and @type cannot coexist.')
      ok = false
    }
    if ('@language' in value && typeof value['@value'] !== 'string') {
      message('is not a valid value object: if @language is present, @value must be a string.')
      ok = false
    }
  } else if (!('@id' in value) || Object.keys(value).length > 1) {
    message('is not a valid node object reference: it MUST have only @id, but no other properties.')
    ok = false
  }
  return ok
}

export async function validateFormat(doc, ws, opts, err) {
  if (Array.isArray(doc)) {
    err("Unexpected error: 'list' object has no attribute 'keys'")
    err('RO-Crate file descriptor "' + FILENAME + '" does not contain a context')
    return
  }
  const names = new Set(SPECIAL_KEYS)
  async function getTerms(ctx, inArray = false) {
    if (typeof ctx === 'string') ctx = (await opts.documentLoader(ctx)).document['@context']
    if (Array.isArray(ctx)) { for (const item of ctx) await getTerms(item, true) }
    else if (isObject(ctx)) for (const k of Object.keys(ctx)) names.add(k)
    else if (inArray) throw new TypeError("'NoneType' object is not iterable")
  }
  if (!('@context' in doc)) err('RO-Crate file descriptor "' + FILENAME + '" does not contain a context')
  let contextKeysFailed = false
  if ('@context' in doc) {
    try { await getTerms(doc['@context']) }
    catch (error) { err(error.message); contextKeysFailed = true }
  }
  const entities = Array.isArray(doc['@graph']) ? doc['@graph'] : []
  const unknown = new Map()
  function countKeys(x) {
    if (Array.isArray(x)) x.forEach(countKeys)
    else if (isObject(x)) for (const [k,v] of Object.entries(x)) {
      if (!names.has(k)) unknown.set(k, (unknown.get(k) ?? 0) + 1)
      countKeys(v)
    }
  }
  if (!contextKeysFailed) {
    if (doc['@context'] == null && entities.some(e => Object.keys(e).some(k => !SPECIAL_KEYS.has(k))))
      err("Unexpected error: argument of type 'NoneType' is not iterable")
    else countKeys(entities)
  }
  for (const [key,count] of unknown) {
    const s = count > 1 ? 's' : ''
    err(key.startsWith('http') ?
      'The The ' + count + ' occurrence' + s + ' of the "' + key + '" URI cannot be used as a key' + s + ' "because the compacted format requires simple terms as keys (see https://www.w3.org/TR/json-ld-api/#compaction for more details).' :
      'The ' + count + ' occurrence' + s + ' of the JSON-LD key "' + key + '" ' + (s ? 'are' : 'is') + ' not allowed in the compacted format because it is not present in the @context of the document')
  }
  for (const entity of entities) {
    if (Array.isArray(entity)) {
      // The reference checks each nested member as a node reference. Its
      // aggregate entity label then fails, so no aggregate finding is emitted.
      flattened(entity, err)
      break
    }
    if (!isObject(entity)) continue
    if (!Object.values(entity).map(v => flattened(v, err)).every(Boolean))
      err('RO-Crate file descriptor "' + FILENAME + '" is not fully flattened at entity "' + entityLabel(entity) + '"')
  }
  // Availability and attribute checks are independent checks upstream; a
  // malformed graph member must not terminate the other checks' traversals.
  for (const entity of entities) {
    if (!isObject(entity)) continue
    const types = [entity['@type']].flat()
    const id = entity['@id']
    if (typeof id === 'string' && (types.includes('File') || types.includes('Dataset')) &&
        !/^(#|\/|https?:|ftps?:|file:)/i.test(id) && !ws.has(decodeCrateReference(id))) {
      err("The RO-Crate does not include the Data Entity '" + id + "' as part of its payload")
    }
  }
  for (const key of ['@id', '@type']) {
    for (const entity of entities) {
      if (!isObject(entity)) break
      if (!(key in entity)) {
        err('Entity "' + (entity.name || pythonRepr(entity)) + '" of RO-Crate "' + FILENAME + '" file descriptor does not contain the ' + key + ' attribute')
        break
      }
    }
  }
}
