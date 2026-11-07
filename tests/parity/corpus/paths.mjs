export function makePathCases(minimal) {
  const cases = []
  const variants = [
    ['selected-parent', 'manifests/../file_list.tsv', ['manifests/placeholder']],
    ['missing-parent', 'manifests/../file_list.tsv', []],
    ['file-as-parent', 'manifests/../file_list.tsv', ['manifests']],
    ['nested-parent', 'manifests/nested/../../file_list.tsv', ['manifests/nested/placeholder']],
    ['multiple-dots', '././file_list.tsv', []],
    ['missing-file', 'manifests/../absent.tsv', ['manifests/placeholder']],
  ]
  for (const [name, identifier, present] of variants) {
    const files = structuredClone(minimal.files)
    const doc = JSON.parse(files['ro-crate-metadata.json'])
    doc['@graph'].find(e => e['@id'] === 'file_list.tsv')['@id'] = identifier
    doc['@graph'].find(e => e['@id'] === './').hasPart[0]['@id'] = identifier
    files['ro-crate-metadata.json'] = JSON.stringify(doc)
    for (const path of present) files[path] = 'present'
    cases.push({name: 'path/' + name, files, kind: 'mutation'})
  }
  return cases
}
