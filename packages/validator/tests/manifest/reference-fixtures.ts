import type {OracleInput, OracleInputReceipt} from '../../../../tests/parity/inputs.mjs'
import type {compareResult} from '../../../../tests/parity/compare.mjs'

export type ManifestReferenceCase = Omit<OracleInput, 'files'> & {files: Record<string, string>}
export type ManifestReferenceExpected = OracleInputReceipt & Parameters<typeof compareResult>[1] & {name: string}
