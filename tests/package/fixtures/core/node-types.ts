import {createWorkspace, fromDirectory} from '@bijux/ro-crate-core'

const entry = Object.assign(new Blob(['value']), {name: 'metadata', webkitRelativePath: 'crate/metadata'})
const files = fromDirectory([entry])
const selectedPath: string | null = createWorkspace(files).resolveFile('./metadata')
void selectedPath
