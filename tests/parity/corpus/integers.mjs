export function makeIntegerCases(minimal) {
  const cases = []
  const large = '9'.repeat(4300)
  const strings = [
    ['leading-bom', '\ufeff2'], ['leading-next-line', '\u00852'], ['leading-separator', '\u001c2'],
    ['trailing-bom', '2\ufeff'], ['leading-nonbreaking-space', '\u00a02'],
    ['decimal-zero', '1_0.00'], ['repeated-leading-zero-separator', '0__1'],
    ['negative-after-leading-zero', '0-1'], ['nested-negative-sign', '-0-1'],
    ['maximum-digits', large], ['excess-digits', large + '9'],
    ['maximum-negative-digits', '-' + '9'.repeat(4299)], ['excess-negative-digits', '-' + large],
    ['maximum-digits-plus', '+' + large], ['maximum-digits-decimal', large + '.0'],
    ['excess-digits-plus', '+' + large + '9'], ['excess-digits-space', ' ' + large + '9'],
    ['long-leading-zeros', '0'.repeat(5000) + '1'],
  ]
  for (const [name, value] of strings) {
    const files = structuredClone(minimal.files)
    const doc = JSON.parse(files['ro-crate-metadata.json'])
    doc['@graph'].find(e => e['@id'] === './').relatedPublication = [{'@id': '#numeric-publication'}]
    doc['@graph'].push({'@id': '#numeric-publication', '@type': 'bia:Publication', yearPublished: value})
    files['ro-crate-metadata.json'] = JSON.stringify(doc)
    cases.push({name: 'integer/' + name, files, kind: 'mutation'})
  }
  const tokens = [
    ['float-upper-limit', '9223372036854775808.0'],
    ['float-lower-limit', '-9223372036854775808.0'],
    ['float-below-lower-limit', '-9223372036854777856.0'],
    ['float-upper-neighbor', '9223372036854774784.0'],
    ['float-lower-neighbor', '-9223372036854774784.0'],
    ['float-positive-overflow', '1e19'], ['float-negative-overflow', '-1e19'],
    ['float-exponent-overflow', '1e30'],
    ['integer-large-positive-control', '10000000000000000000'],
    ['integer-large-negative-control', '-10000000000000000000'],
  ]
  for (const [name, token] of tokens) {
    const files = structuredClone(minimal.files)
    const doc = JSON.parse(files['ro-crate-metadata.json'])
    doc['@graph'].find(e => e['@id'] === './').relatedPublication = [{'@id': '#numeric-publication'}]
    doc['@graph'].push({'@id': '#numeric-publication', '@type': 'bia:Publication', yearPublished: '__integer_token__'})
    // Keep the raw token: stringify would erase an integral float's .0.
    files['ro-crate-metadata.json'] = JSON.stringify(doc).replace('"__integer_token__"', token)
    cases.push({name: 'integer/' + name, files, kind: 'mutation'})
  }
  return cases
}
