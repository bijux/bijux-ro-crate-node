import {parseMetadata} from '../metadata/json/parse.js'
import {createWorkspace as workspaceFor, reportOf} from '@bijux/ro-crate-core'
import {validateMetadata} from '../metadata/validation.js'
import {checkReferences} from '../metadata/rdf/references.js'
import {checkCollections} from '../metadata/rdf/collections.js'
import {validateFileList, FileListValidationError} from '../manifest/validation.js'
import {validateBaseProfile} from '../profile/validation.js'
import {localLoader} from '../profile/loader.js'
import {checkConnectivity} from './connectivity.js'
import {createCrateIdentity} from './crate-identity.js'

const descriptor = 'ro-crate-metadata.json'

export async function validateCrate(files, options = {}) {
  const issues = []
  let stage = 'input'
  let identity
  const finish = result => identity ? identity.render(result) : result
  try {
    const documentLoader = localLoader(options.contexts)
    const workspace = workspaceFor(files)
    const text = await workspace.readText(descriptor)
    const document = parseMetadata(text)
    identity = createCrateIdentity()
    const opts = {baseURL: identity.baseURL, documentLoader}
    stage = 'preflight'
    const dataset = await checkReferences(document, issues, opts)
    if (checkCollections(dataset, issues)) return finish({status: 'invalid', report: reportOf(issues)})
    await validateBaseProfile(document, workspace, issues, opts)
    if (!issues.some(i => i.severity >= 40)) {
      stage = 'metadata'
      const metadata = await validateMetadata(document, issues, opts)
      if (!issues.some(i => i.severity >= 40)) {
        stage = 'file-list'
        const refs = await validateFileList(metadata, workspace, issues)
        if (!issues.some(i => i.severity >= 40)) checkConnectivity(metadata, refs, issues)
      }
    }
  } catch (error) {
    if (!(error instanceof FileListValidationError)) {
      const reason = error instanceof Error ? error.message : String(error)
      return finish({status: 'incomplete', stage, reason, report: reportOf(issues)})
    }
  }
  return finish({status: issues.some(i => i.severity >= 40) ? 'invalid' : 'valid', report: reportOf(issues)})
}
