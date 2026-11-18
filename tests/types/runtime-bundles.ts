import {verifyManifest} from '../../scripts/ci/runtime-bundles.mjs'

if (false) {
  const input = {receipt: 'owned'}
  void verifyManifest('.', 'assets', input).then(result => {
    const receipt: string = result.receipt
    void receipt
  })
  const untrusted: unknown = input
  void verifyManifest('.', 'assets', untrusted).then(result => {
    // @ts-expect-error Untrusted input remains unknown after verification.
    void result.receipt
  })
}
