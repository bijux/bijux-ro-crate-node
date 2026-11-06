import {executeRequest} from './worker/protocol.js'

self.onmessage = ({data}) => {
  executeRequest(data).then(result => self.postMessage(result)).catch(error => {
    // Report protocol failures through the worker's error channel, never success.
    setTimeout(() => {throw error}, 0)
  })
}
