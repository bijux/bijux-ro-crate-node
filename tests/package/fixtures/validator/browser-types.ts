import {validateCrate, type CrateFiles} from '@bijux/ro-crate-validator'
import {ValidationSession} from '@bijux/ro-crate-validator/browser'
import type {ValidationRequest} from '@bijux/ro-crate-validator/worker'

const files: CrateFiles = new Map([['x', 'value']])
void validateCrate(files)
const request: ValidationRequest = {session: 'consumer', revision: 1, id: 1, files}
void request
const session = new ValidationSession()
session.select(files)
session.dispose()

import {evaluateVocabularyEvidence, type VocabularyLookup} from '@bijux/ro-crate-validator/vocabulary'
const missing: VocabularyLookup = {status:'not-found',identifier:'FBbi:99999999',source:'fixture',retrievedAt:'2026-11-25T00:00:00Z'}
const assessment = evaluateVocabularyEvidence({identifier:'FBbi:99999999',label:'unknown'},missing)
void assessment.status
