import {decodeCrateReference, fromDirectory, type CrateFiles} from '@bijux/ro-crate-core'
import {validateCrate} from '@bijux/ro-crate-validator'

declare const input: HTMLInputElement
if (input.files) {
  const files: CrateFiles = fromDirectory(input.files)
  void validateCrate(files)
}

const decoded: string = decodeCrateReference("manifest%20list.tsv")
void decoded
