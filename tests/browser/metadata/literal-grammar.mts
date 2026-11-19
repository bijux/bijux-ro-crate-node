import {runReferenceContracts} from '../session/reference-contracts.mjs'
import * as contracts from '../../reference/literal-grammar/checks.mjs'

await runReferenceContracts('literal-grammar', contracts)
