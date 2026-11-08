const descriptor = 'ro-crate-metadata.json';
const setFindings = [
  'Found undefined references: ',
  'Found objects in ro-crate-metadata.json with no inbound references: ',
  'Found RO-Crate objects with no inbound references across ro-crate-metadata.json and file list references: ',
];

/** Keep selected-crate identities separate from absolute IRIs supplied as data. */
export function createCrateIdentity() {
  if (typeof globalThis.crypto?.getRandomValues !== 'function')
    throw new Error('Validation requires native cryptographic randomness.');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const parentURL = `file:///bijux-ro-crate-${token.slice(0, 32)}/`;
  const rootURL = parentURL + token.slice(32) + '/';
  const rootPath = new URL(rootURL).pathname;
  const parentPath = new URL(parentURL).pathname;
  function text(value) {
    let result = value.replaceAll(rootURL, 'crate:/').replaceAll(rootURL.slice(0, -1), 'crate:')
      .replaceAll(parentURL, 'crate:/../').replaceAll(parentURL.slice(0, -1), 'crate:/..')
      .replaceAll(rootPath, 'crate:/').replaceAll(rootPath.slice(0, -1), 'crate:')
      .replaceAll(parentPath, 'crate:/../').replaceAll(parentPath.slice(0, -1), 'crate:/..');
    // Sets must be ordered after private identifiers have their public form.
    // Otherwise an absolute input IRI can change position with each nonce.
    for (const prefix of setFindings) {
      if (result.startsWith(prefix)) result = prefix + result.slice(prefix.length).split(', ').sort().join(', ');
    }
    return result;
  }
  return {
    baseURL: rootURL + descriptor,
    render(result) {
      return {...result, ...(typeof result.reason === 'string' ? {reason: text(result.reason)} : {}),
        report: {...result.report, issues: Object.fromEntries(Object.entries(result.report.issues)
          .map(([level, issues]) => [level, issues.map(issue => ({...issue,
            message: text(issue.message),
            location_description: typeof issue.location_description === 'string' ? text(issue.location_description) : null,
          }))]))}};
    },
  };
}
