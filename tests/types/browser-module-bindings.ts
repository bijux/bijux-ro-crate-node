import type {Page} from 'playwright'
import {bindSessionCore} from '../browser/session/module-bindings.mjs'

declare const page: Page
if (false) {
  const bound: Promise<void> = bindSessionCore(page, 'http://localhost', '/core.js')
  // @ts-expect-error The browser page must expose Playwright routing.
  bindSessionCore({}, 'http://localhost', '/core.js')
  // @ts-expect-error The selected core path is a string.
  bindSessionCore(page, 'http://localhost', 7)
  void bound
}
