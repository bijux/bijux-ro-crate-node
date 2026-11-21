import type {createInstaller} from '../harness/install.mjs'

export interface QualificationContext {
  root: string
  core: {name: string}
  validator: {name: string}
  run: (command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) => string
  verifyPrepared: ReturnType<typeof createInstaller>['verifyPrepared']
  installedCorePath: string
  installedPaths: Record<string, string>
  mode: string | undefined
  reports: Array<Record<string, unknown>>
}
