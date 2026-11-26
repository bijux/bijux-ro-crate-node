import {readFileSync} from 'node:fs'
import {parseEnv} from 'node:util'
import type {Environment} from './connectivity.js'

/** Return only supported file settings that the process has not already set. */
export function developmentBssSettings(environment:Environment, file:URL):Record<string, string> {
  let settings:NodeJS.Dict<string>
  try {settings = parseEnv(readFileSync(file, 'utf8'))}
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {}
    throw error
  }
  const result:Record<string, string> = {}
  for (const key of ['BSS_MODE', 'BSS_API_BASE_URL', 'BSS_LOCAL_SERVICE_HOST']) {
    if (environment[key] === undefined && settings[key] !== undefined) result[key] = settings[key]
  }
  return result
}
