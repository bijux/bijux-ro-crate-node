import {assertBrowserBindings} from '../ci/browser-bindings.mjs'

if (false) {
  assertBrowserBindings({reports: null}, null)
  assertBrowserBindings({reports: [{selection: null}, {selection: {suite: null}}]})
  // @ts-expect-error Reports must be a list or null, not a scalar.
  assertBrowserBindings({reports: 1})
}
