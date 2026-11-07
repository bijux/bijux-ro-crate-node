import {File} from 'node:buffer'
import {decodeCrateReference, fromDirectory, type CrateFiles} from '@bijux/ro-crate-core'
import {validateCrate} from '@bijux/ro-crate-validator'

const file = Object.assign(new File(['{}'], 'ro-crate-metadata.json'), {
  webkitRelativePath: 'crate/ro-crate-metadata.json',
})
const files: CrateFiles = fromDirectory([file])
void validateCrate(files)

const decoded: string = decodeCrateReference("manifest%20list.tsv")
void decoded

import type {ValidationRequest} from '@bijux/ro-crate-validator/worker'
const request: ValidationRequest = {session: 'typed-consumer', revision: 1, id: 1, files}
void request
