const metadataName = 'ro-crate-metadata.json'

function readRows(width) {
  let rows = 1
  while (rows * 2 < Math.floor(2 ** 20 / width)) rows *= 2
  return rows
}

/** Place unique paths around pandas' width-derived low-memory read boundary. */
export function makeManifestRecordCases(minimal) {
  const cases = []
  for (const shape of ['standard', 'implicit-index', 'wide']) {
    const width = shape === 'wide' ? 4 : shape === 'implicit-index' ? 3 : 2
    const files = structuredClone(minimal.files)
    if (shape === 'wide') {
      const document = JSON.parse(files[metadataName])
      const schema = document['@graph'].find(node => node['@id'] === '#ts0')
      for (let column = 2; column < 4; column++) {
        document['@graph'].push({'@id': '#col' + column, '@type': ['csvw:Column'],
          columnName: 'extra' + column, propertyUrl: 'http://schema.org/description'})
        schema.column.push({'@id': '#col' + column})
      }
      files[metadataName] = JSON.stringify(document)
    }
    for (const [offset, position] of [[-1, 'before'], [0, 'at'], [1, 'after']]) {
      const count = readRows(width) + offset
      const rows = Array.from({length: count}, (_, index) => shape === 'wide'
        ? `file${index}\t\talpha\tbeta\n` : shape === 'implicit-index'
          ? `index${index}\tfile${index}\t\n` : `file${index}\t\n`).join('')
      const header = shape === 'wide' ? 'file_path\tdataset\textra2\textra3\n' : 'file_path\tdataset\n'
      const overwide = shape === 'wide' ? 'oversized\t\talpha\tbeta\tignored\n' : shape === 'implicit-index'
        ? 'bad-index\toversized\t\tignored\n' : 'oversized\t\tignored\n'
      const tail = shape === 'implicit-index' ? 'tail-index\ttail\n' : 'tail\t\n'
      cases.push({name: `manifest/row-buffer/${shape}/overwide-${position}`,
        files: {...files, 'file_list.tsv': header + rows + overwide + tail}, kind: 'boundary'})
      if (shape === 'standard') cases.push({name: `manifest/row-buffer/standard/short-${position}`,
        files: {...files, 'file_list.tsv': header + rows + 'short\n' + tail}, kind: 'boundary'})
    }
  }
  return cases
}
