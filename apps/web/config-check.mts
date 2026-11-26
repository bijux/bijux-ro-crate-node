import {validateBssStartup} from './src/server/bss/startup.js'

try {
  validateBssStartup(process.env)
  console.log('BSS startup settings are valid. Connectivity and credentials were not checked.')
} catch {
  console.error('Invalid BSS configuration. Check the application environment settings.')
  process.exitCode = 1
}
