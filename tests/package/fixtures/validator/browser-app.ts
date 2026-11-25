import {evaluateVocabularyEvidence} from '@bijux/ro-crate-validator/vocabulary'
import {ValidationSession} from '@bijux/ro-crate-validator/browser'
import {validateCrate, type CrateFiles, type ValidationOptions, type ValidationResult} from '@bijux/ro-crate-validator'

type BrowserFiles = Array<[string, CrateFiles extends ReadonlyMap<string, infer V> ? V : never]>
declare global {
  interface Window {
    vocabularyStatus(): string
    inline(files: BrowserFiles, options?: ValidationOptions): Promise<ValidationResult>
    validate(files: BrowserFiles, options?: ValidationOptions): Promise<{state: string; eligible: boolean; handed: BrowserFiles | null}>
  }
}
window.inline = (files, options = {}) => validateCrate(new Map(files), options)
window.validate = (files, validationOptions = {}) => new Promise((resolve, reject) => {
  const workerOptions = location.pathname.includes('bundled') ? {workerFactory: () => new Worker(new URL('./worker.js', import.meta.url), {type: 'module'})} : {}
  const session = new ValidationSession({...workerOptions, debounceMs: 0, options: validationOptions})
  const timeout = setTimeout(() => {session.dispose(); reject(new Error('Installed worker timed out'))}, 60000)
  session.subscribe(state => {
    if (['valid', 'invalid', 'incomplete'].includes(state.state)) {
      const result = {state: state.state, eligible: state.eligible, handed: state.eligible ? [...session.continue().files] : null}
      clearTimeout(timeout)
      session.dispose()
      resolve(result)
    }
  })
  session.select(new Map(files))
})

window.vocabularyStatus = () => evaluateVocabularyEvidence({identifier:'FBbi:99999999',label:'unknown'}, {status:'not-found',identifier:'FBbi:99999999',source:'fixture',retrievedAt:'2026-11-25T00:00:00Z'}).status
