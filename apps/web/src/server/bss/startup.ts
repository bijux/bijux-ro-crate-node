import {bssBase, type Environment} from './connectivity.js'

/** Validate runtime settings without exposing a URL or credentials in diagnostics. */
export function validateBssStartup(env: Environment): void {
  try {bssBase(env)} catch {throw new Error('Invalid BSS configuration')}
}
