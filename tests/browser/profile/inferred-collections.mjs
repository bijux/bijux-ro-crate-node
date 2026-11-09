import {runReferenceContracts} from '../session/reference-contracts.mjs'
import * as contracts from '../../reference/inferred-collections/checks.mjs'

await runReferenceContracts('inferred-collections', contracts)
