import {makeTextFileCases} from './text-files.mjs'

/** Selected file names must survive native File name conversion unchanged. */
export function makeFilePathCases(files) {
  const metadata = files.get('ro-crate-metadata.json'), manifest = files.get('file_list.tsv')
  const select = (name, document = metadata) => ({'ro-crate-metadata.json': document.replaceAll('file_list.tsv', name), [name]: manifest})
  const malformed = ['\ud800.tsv', '\udfff.tsv', '\udc00\ud800.tsv'].map((name, index) => ({
    name: ['high-surrogate-collision', 'low-surrogate-collision', 'reversed-surrogate-collision'][index],
    status: 'incomplete', uploadedStatus: 'invalid',
    files: {...select(name.toWellFormed()), [name]: 'file_path\tdataset\nx\t\nx\t\n'},
  }))
  const escaped = makeTextFileCases(files).find(item => item.name === 'escaped-surrogate').text
  return [...malformed,
    ...[['replacement-name', '\ufffd.tsv'], ['astral-name', '\ud800\udc00.tsv'], ['emoji-name', '\ud83d\ude00.tsv']]
      .map(([name, path]) => ({name, status: 'valid', uploadedStatus: 'valid', files: select(path)})),
    {name: 'escaped-rdf-value', status: 'valid', uploadedStatus: 'valid', files: select('escaped-values.tsv', escaped)},
  ]
}
