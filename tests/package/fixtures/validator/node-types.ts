import {validateCrate, type CrateFiles} from '@bijux/ro-crate-validator'
import type {ValidationRequest} from '@bijux/ro-crate-validator/worker'

const files: CrateFiles = new Map([['x', 'value']])
void validateCrate(files)
const request: ValidationRequest = {session: 'node', revision: 1, id: 1, files}
void request
