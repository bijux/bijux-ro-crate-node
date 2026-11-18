import {validateCrate, fromDirectory, type CrateFiles, type ValidationOptions, type ValidationResult} from '../../packages/validator/src/index.ts'

const validate: (files: CrateFiles, options?: ValidationOptions) => Promise<ValidationResult> = validateCrate
const select: typeof fromDirectory = fromDirectory
export {validate, select}
