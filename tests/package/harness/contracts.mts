export type PackageRecord = {name: string; directory: string; version: string; dependencies: Record<string, string>; archive: string; sha256: string; integrity: string; files: string[]}
export type Scenario = {entry?: string; fixture: ConsumerFixture; prepareFiles?: string[]; prepare?: (directory: string) => Promise<void>}

export type ConsumerFixture = {
  files: Array<{source: string; target: string}>
  nodeRoots: string[]
  browserRoots: string[]
  runtimeEntry: {source: string; output: string}
  browserEntry?: {source: string; output: string}
  required: Array<{packageName: string; export: string; environment: 'node' | 'browser'}>
}
