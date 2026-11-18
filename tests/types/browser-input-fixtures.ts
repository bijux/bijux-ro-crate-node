import {makeFilePathCases} from '../inputs/file-paths.mjs'

if (false) {
  const files = new Map([['ro-crate-metadata.json', '{}']])
  const cases = makeFilePathCases(files)
  const selected: string | undefined = cases[3].files['\ufffd.tsv']
  // @ts-expect-error A file-list value may be absent from the input map.
  const required: string = cases[3].files['\ufffd.tsv']
  void [selected, required]
}
