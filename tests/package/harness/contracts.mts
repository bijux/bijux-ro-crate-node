export type PackageRecord = {name: string; directory: string; version: string; dependencies: Record<string, string>; archive: string; sha256: string; integrity: string; files: string[]}
export type Scenario = {entry?: string; code: string; nodeTypes: string; browserTypes: string; prepareFiles?: string[]; prepare?: (directory: string) => Promise<void>}
