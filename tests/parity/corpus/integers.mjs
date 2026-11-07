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
  return cases
}
