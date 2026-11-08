// Adapted from html5rdf 1.2.1's optional-tag filter; see LICENSES/html5rdf.txt.
const pFollowers = new Set(['address', 'article', 'aside', 'blockquote', 'datagrid', 'dialog',
  'dir', 'div', 'dl', 'fieldset', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul'])

function optionalStart(name, previous, next) {
  const type = next?.type
  // The pinned filter uses substring membership for this start-tag check.
  if ('html'.includes(name)) return !['comment', 'space'].includes(type)
  if (name === 'head') return ['start', 'empty'].includes(type) || (type === 'end' && next.name === 'head')
  if (name === 'body') return !['comment', 'space'].includes(type) && !(type === 'start' && ['script', 'style'].includes(next.name))
  if (name === 'colgroup') return ['start', 'empty'].includes(type) && next.name === 'col'
  if (name === 'tbody') return type === 'start' && next.name === 'tr' &&
    !(previous?.type === 'end' && ['tbody', 'thead', 'tfoot'].includes(previous.name))
  return false
}

function optionalEnd(name, next) {
  const type = next?.type
  const parentEnd = type === 'end' || !next
  if (['html', 'head', 'body'].includes(name)) return !['comment', 'space'].includes(type)
  if (['li', 'optgroup', 'tr'].includes(name)) return type === 'start' ? next.name === name : parentEnd
  if (['dt', 'dd'].includes(name)) return type === 'start' ? ['dt', 'dd'].includes(next.name) : name === 'dd' && parentEnd
  if (name === 'p') return ['start', 'empty'].includes(type) ? pFollowers.has(next.name) : parentEnd
  if (name === 'option') return type === 'start' ? ['option', 'optgroup'].includes(next.name) : parentEnd
  if (['rt', 'rp'].includes(name)) return type === 'start' ? ['rt', 'rp'].includes(next.name) : parentEnd
  if (name === 'colgroup') return !['comment', 'space'].includes(type) && !(type === 'start' && next.name === 'colgroup')
  if (['thead', 'tbody'].includes(name)) return type === 'start' ? ['tbody', 'tfoot'].includes(next.name) : name === 'tbody' && parentEnd
  if (name === 'tfoot') return type === 'start' ? next.name === 'tbody' : parentEnd
  if (['td', 'th'].includes(name)) return type === 'start' ? ['td', 'th'].includes(next.name) : parentEnd
  return false
}

export function omitOptionalTags(tokens) {
  return tokens.filter((token, index) => token.type === 'start'
    ? token.attrs.length > 0 || !optionalStart(token.name, tokens[index - 1], tokens[index + 1])
    : token.type !== 'end' || !optionalEnd(token.name, tokens[index + 1]))
}
