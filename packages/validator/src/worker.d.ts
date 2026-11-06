import type {CrateFiles, ValidationOptions, ValidationResult} from './index.js'
export interface ValidationRequest {
  session: string
  revision: number
  id: number
  files: CrateFiles
  options?: ValidationOptions
}
export interface ValidationResponse {
  session: string
  revision: number
  id: number
  result: ValidationResult
}
