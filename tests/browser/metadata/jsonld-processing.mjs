import {runReferenceContracts} from '../session/reference-contracts.mjs'
import * as contract from '../../reference/jsonld-processing/checks.mjs'

await runReferenceContracts('jsonld-processing', contract)
