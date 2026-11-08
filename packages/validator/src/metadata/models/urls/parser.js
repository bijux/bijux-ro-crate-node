import parser from 'whatwg-url/lib/url-state-machine.js';

/** Keep URL normalization independent of the host platform's native parser. */
export function parseURLComponents(value) {
  const record = parser.basicURLParse(value, {rustFileURLs: true});
  if (!record) throw new TypeError('Invalid URL');
  return {protocol: record.scheme + ':',
    hostname: record.host === null ? '' : parser.serializeHost(record.host),
    href: parser.serializeURL(record)};
}
