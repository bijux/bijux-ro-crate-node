import {validateBssStartup} from './src/server/bss/startup.js'
import {developmentBssSettings} from './src/server/bss/development-env.js'

try {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== '--development')) throw Error('Invalid arguments')
  const development = args[0] === '--development'
  const settings = development ? {...process.env, ...developmentBssSettings(process.env, new URL('./.env', import.meta.url))} : process.env
  validateBssStartup(settings)
  console.log(development
    ? 'Development BSS settings are valid using the local file if present. Connectivity and credentials were not checked.'
    : 'BSS startup settings in the current process environment are valid. Environment files, connectivity and credentials were not checked.')
} catch {
  console.error('Invalid BSS configuration. Check the application environment settings.')
  process.exitCode = 1
}
