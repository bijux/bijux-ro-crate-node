import {indexedRecoveryStore} from '../../src/drafts/recovery-store.js'
Object.assign(window, {recoveryStore: indexedRecoveryStore(indexedDB)})
