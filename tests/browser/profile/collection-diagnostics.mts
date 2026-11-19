import {runReferenceContracts} from '../session/reference-contracts.mjs'
import * as contracts from '../../reference/collection-diagnostics/checks.mjs'

await runReferenceContracts('collection-diagnostics', contracts)
