export function makeWorkloadCases(base) {
  const descriptor = 'ro-crate-metadata.json'
  const document = JSON.parse(base.files[descriptor])
  document['@graph'].push({'@id': '#dataset', '@type': 'bia:Dataset', name: 'Measured images'})
  document['@graph'].find(item => item['@id'] === './').hasPart.push({'@id': '#dataset'})
  const metadata = JSON.stringify(document)
  const table = 'file_path\tdataset\n' + Array.from({length: 100000}, (_, index) => `image-${index}.tif\t#dataset\n`).join('')
  const wide = structuredClone(document)
  const schema = wide['@graph'].find(item => item['@id'] === '#ts0')
  const names = ['file_path', 'dataset']
  for (let column = 2; column < 32; column++) {
    const id = '#wide-column-' + column
    names.push('note_' + column)
    schema.column.push({'@id': id})
    wide['@graph'].push({'@id': id, '@type': 'csvw:Column', columnName: 'note_' + column})
  }
  const wideTable = names.join('\t') + '\n' + Array.from({length: 2000}, (_, index) =>
    [`wide-${index}.tif`, '#dataset', ...Array(30).fill('"quoted\tvalue"')].join('\t') + '\n').join('')
  return [
    {name: 'workload/manifest-100000', kind: 'mutation', files: {[descriptor]: metadata, 'file_list.tsv': table}},
    {name: 'workload/invalid-tail', kind: 'mutation', files: {[descriptor]: metadata, 'file_list.tsv': table + 'last.tif\t#missing-dataset\n'}},
    {name: 'workload/quoted-wide-2000', kind: 'mutation', files: {[descriptor]: JSON.stringify(wide), 'file_list.tsv': wideTable}},
  ]
}
