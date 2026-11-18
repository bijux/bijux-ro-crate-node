import {runReferenceContracts} from '../browser/session/reference-contracts.mjs'

declare const contract: Parameters<typeof runReferenceContracts>[1]
if (false) {
  const completion: Promise<void> = runReferenceContracts('reference-suite', contract)
  // @ts-expect-error A suite name is a string.
  runReferenceContracts(42, contract)
  // @ts-expect-error A contract must provide reference cases and an assertion owner.
  runReferenceContracts('reference-suite', {})
  void completion
}
