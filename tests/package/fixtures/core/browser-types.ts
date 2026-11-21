import {createWorkspace, type CrateFiles} from '@bijux/ro-crate-core'

const files: CrateFiles = new Map([['x', 'value']])
const selectedPath: string | null = createWorkspace(files).resolveFile('./x')
void selectedPath
