import {createValidationSession} from '../src/features/editor/validation/worker.js'

const session = createValidationSession()
Object.assign(window, {
  validateFiles(files: Record<string, string>) {
    return new Promise<{state: string; eligible: boolean; files: string[]}>(resolve => {
      session.select(new Map(Object.entries(files)))
      let unsubscribe = () => {}
      unsubscribe = session.subscribe(state => {
        if (state.state !== 'valid' && state.state !== 'invalid' && state.state !== 'incomplete') return
        const snapshot = state.eligible ? session.continue() : undefined
        unsubscribe()
        resolve({state: state.state, eligible: state.eligible, files: [...(snapshot?.files.keys() ?? [])]})
      })
    })
  },
})
