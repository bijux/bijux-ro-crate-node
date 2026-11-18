import type {CrateFiles, ValidationOptions, ValidationResult} from '../../packages/validator/src/index.js'
import {runNodeContracts} from '../reference/runtime/node-contract.mjs'

if (false) {
  const validate: (files: CrateFiles, options?: ValidationOptions) => Promise<ValidationResult> = async () => {
    throw new Error('type probe')
  }
  void validate
  void runNodeContracts({
    cases: [{name: 'mixed', files: {text: 'value', bytes: [0, 255], view: new Uint8Array(2), buffer: new ArrayBuffer(2), blob: new Blob(['x'])}}],
    reference: {reference: 'commit', suite_sha256: 'digest'}, approvedDifferences: new Set<string>(),
    assertResult(item, result) {
      const name: string = item.name
      const issues = result.report.issues
      if (result.status === 'incomplete') {
        const reason: string = result.reason
        const stage: 'input' | 'preflight' | 'metadata' | 'file-list' = result.stage
        void [reason, stage]
      }
      void [name, issues]
    },
  })
}
