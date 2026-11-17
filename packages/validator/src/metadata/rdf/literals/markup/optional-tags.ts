export type HTMLToken =
  | {type: 'start' | 'empty'; name: string; attrs: readonly {name: string; value: string}[]}
  | {type: 'end'; name: string}
  | {type: 'space' | 'text' | 'comment'; text: string}

type HTMLTag = Extract<HTMLToken, {name: string}>

// Adapted from html5rdf 1.2.1's optional-tag filter; see LICENSES/html5rdf.txt.
const pFollowers = new Set(['address', 'article', 'aside', 'blockquote', 'datagrid', 'dialog',
  'dir', 'div', 'dl', 'fieldset', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul'])

function optionalStart(name: string, previous: HTMLToken | undefined, next: HTMLToken | undefined) {
  const type = next?.type
  // A matching tag type implies a tag token; retain the original property reads.
  // The pinned filter uses substring membership for this start-tag check.
  if ('html'.includes(name)) return !(['comment', 'space'] as (string | undefined)[]).includes(type)
  if (name === 'head') return (['start', 'empty'] as (string | undefined)[]).includes(type) || (type === 'end' && (next as HTMLTag).name === 'head')
  if (name === 'body') return !(['comment', 'space'] as (string | undefined)[]).includes(type) && !(type === 'start' && ['script', 'style'].includes((next as HTMLTag).name))
  if (name === 'colgroup') return (['start', 'empty'] as (string | undefined)[]).includes(type) && (next as HTMLTag).name === 'col'
  if (name === 'tbody') return type === 'start' && (next as HTMLTag).name === 'tr' &&
    !(previous?.type === 'end' && ['tbody', 'thead', 'tfoot'].includes(previous.name))
  return false
}

function optionalEnd(name: string, next: HTMLToken | undefined) {
  const type = next?.type
  const parentEnd = type === 'end' || !next
  if (['html', 'head', 'body'].includes(name)) return !(['comment', 'space'] as (string | undefined)[]).includes(type)
  if (['li', 'optgroup', 'tr'].includes(name)) return type === 'start' ? (next as HTMLTag).name === name : parentEnd
  if (['dt', 'dd'].includes(name)) return type === 'start' ? ['dt', 'dd'].includes((next as HTMLTag).name) : name === 'dd' && parentEnd
  if (name === 'p') return (['start', 'empty'] as (string | undefined)[]).includes(type) ? pFollowers.has((next as HTMLTag).name) : parentEnd
  if (name === 'option') return type === 'start' ? ['option', 'optgroup'].includes((next as HTMLTag).name) : parentEnd
  if (['rt', 'rp'].includes(name)) return type === 'start' ? ['rt', 'rp'].includes((next as HTMLTag).name) : parentEnd
  if (name === 'colgroup') return !(['comment', 'space'] as (string | undefined)[]).includes(type) && !(type === 'start' && (next as HTMLTag).name === 'colgroup')
  if (['thead', 'tbody'].includes(name)) return type === 'start' ? ['tbody', 'tfoot'].includes((next as HTMLTag).name) : name === 'tbody' && parentEnd
  if (name === 'tfoot') return type === 'start' ? (next as HTMLTag).name === 'tbody' : parentEnd
  if (['td', 'th'].includes(name)) return type === 'start' ? ['td', 'th'].includes((next as HTMLTag).name) : parentEnd
  return false
}

export function omitOptionalTags<T extends HTMLToken>(tokens: readonly T[]): T[] {
  return tokens.filter((token, index) => token.type === 'start'
    ? token.attrs.length > 0 || !optionalStart(token.name, tokens[index - 1], tokens[index + 1])
    : token.type !== 'end' || !optionalEnd(token.name, tokens[index + 1]))
}
