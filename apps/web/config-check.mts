import {validateBssStartup} from './src/server/bss/startup.js'

try {
  validateBssStartup(process.env)
  console.log('BSS startup settings in the current process environment are valid. Environment files, connectivity and credentials were not checked.')
} catch {
  console.error('Invalid BSS configuration. Check the application environment settings.')
  process.exitCode = 1
}
