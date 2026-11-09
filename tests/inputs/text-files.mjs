/** Complete crates distinguishing JavaScript text from its UTF-8 upload bytes. */
export function makeTextFileCases(files) {
  const document = JSON.parse(files.get('ro-crate-metadata.json'))
  document['@context'].push({first: {'@id': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'}})
  document['@graph'].find(node => node['@type']?.includes('bia:Contributor')).first = [
    {'@value': 'FIRST_TEXT_VALUE'}, {'@value': 'SECOND_TEXT_VALUE'},
  ]
  const template = JSON.stringify(document)
  return [
    ['raw-high-surrogate', '"\ud800"', '"\\ud800"', 'incomplete', 'invalid'],
    ['raw-low-surrogate', '"\udc00"', '"\\udc00"', 'incomplete', 'invalid'],
    ['raw-surrogate-and-replacement', '"\ud800"', '"\ufffd"', 'incomplete', 'valid'],
    ['escaped-surrogate', '"\\ud800"', '"\\ud800"', 'valid', 'valid'],
    ['astral-pair', '"\ud800\udc00"', '"\\ud800\\udc00"', 'valid', 'valid'],
    ['replacement-character', '"\ufffd"', '"\ufffd"', 'valid', 'valid'],
    ['ordinary-ascii', '"stable"', '"stable"', 'valid', 'valid'],
    ['distinct-escaped-surrogates', '"\\ud800"', '"\\ud801"', 'invalid', 'invalid'],
  ].map(([name, first, second, status, encodedStatus]) => ({name, status, encodedStatus,
    text: template.replace('"FIRST_TEXT_VALUE"', () => first).replace('"SECOND_TEXT_VALUE"', () => second),
  }))
}
