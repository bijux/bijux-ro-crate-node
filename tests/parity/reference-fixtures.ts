import type {OracleInput, OracleInputReceipt} from './inputs.mjs'
import type {compareResult} from './compare.mjs'

export type ReferenceCase = Omit<OracleInput, 'files'> & {files: Record<string, string>}
export type ReferenceExpected = OracleInputReceipt & Parameters<typeof compareResult>[1] & {name: string}
