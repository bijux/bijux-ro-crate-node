import {runReferenceStep} from '../../scripts/reference/execution.mjs'

if (false) {
  void runReferenceStep({command: 'node'})
  void runReferenceStep({command: 'node'}, {cwd: new URL('file:///work/')})
  void runReferenceStep({command: 'node', stdin: '', stdout: ''}, {cwd: new URL('file:///work/')})
  void runReferenceStep({command: 'node', stdin: 'input'}, {cwd: '/work'})
  void runReferenceStep({command: 'node', stdout: 'output'}, {cwd: '/work'})
  // @ts-expect-error Redirected files require a string working directory.
  void runReferenceStep({command: 'node', stdin: 'input'})
  // @ts-expect-error Redirected files cannot resolve a URL working directory.
  void runReferenceStep({command: 'node', stdout: 'output'}, {cwd: new URL('file:///work/')})
  // @ts-expect-error Redirected files cannot resolve an omitted working directory.
  void runReferenceStep({command: 'node', stdout: 'output'}, {})
}
