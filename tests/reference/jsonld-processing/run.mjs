import {runNodeContracts} from '../runtime/node-contract.mjs'
import * as contract from './checks.mjs'

await runNodeContracts(contract)
