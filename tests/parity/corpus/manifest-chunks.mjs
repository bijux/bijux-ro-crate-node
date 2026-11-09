/** Exercise signed/unsigned inference on both sides of physical row boundaries. */
export function makeManifestChunkCases(minimal) {
  const metadata = JSON.parse(minimal.files['ro-crate-metadata.json'])
  metadata['@graph'].find(node => node['@type']?.includes('bia:Contributor')).website = 'https://example.org/'
  const cases = []
  const add = (shape, width, count) => {
    const paths = Array.from({length: count}, (_, index) =>
      index === count - 1 ? '9223372036854775808' : ['0', '00', '-1'][index] ?? String(index))
    // Standard-header controls also retain undeclared-column interruptions.
    const names = shape === 'implicit-index' ? ['file_path', 'dataset']
      : Array.from({length: width}, (_, index) => ['file_path', 'dataset'][index] ?? 'extra_' + index)
    const padding = '\t'.repeat(width - 2)
    const rows = paths.map(path => shape === 'implicit-index'
      ? padding + path + '\t\n' : path + '\t' + padding + '\n').join('')
    cases.push({name: `manifest/inference-chunks/${shape}/width-${width}/rows-${count}`,
      files: {...minimal.files, 'ro-crate-metadata.json': JSON.stringify(metadata),
        'file_list.tsv': names.join('\t') + '\n' + rows}, kind: 'boundary'})
  }
  for (const width of [2046, 2047, 2048, 2049])
    for (const count of [255, 256, 257]) add('implicit-index', width, count)
  for (const width of [2047, 2048])
    for (const count of [256, 257]) add('standard', width, count)
  for (const count of [511, 512, 513]) add('implicit-index', 2047, count)
  return cases
}
