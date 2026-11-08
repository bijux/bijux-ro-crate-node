import tr46 from 'tr46';

export const specialSchemes = new Set(['http', 'https', 'ftp', 'ws', 'wss']);

export function forbiddenHost(protocol, host) {
  if (host.startsWith('[')) return null;
  const special = specialSchemes.has(protocol) || protocol === 'file';
  let decoded = host;
  if (special) {
    try { decoded = decodeURIComponent(host); }
    catch { return 'invalid international domain name'; }
  }
  const forbidden = special ? /[\x00-\x20#/:<>?@[\]\\^|]/ : /[\x00\t\n\r #/:<>?@[\]\\^|]/;
  return (special && decoded.includes('%')) || forbidden.test(decoded)
    ? special ? 'invalid international domain name' : 'invalid domain character' : null;
}

/** Validate the original host before runtime IDNA mapping loses its spelling. */
export function normalizeSpecialHost(value) {
  const raw = value.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(raw);
  if (!scheme) return {value};
  const protocol = scheme[1].toLowerCase();
  if (!specialSchemes.has(protocol) && protocol !== 'file') return {value};
  const normalized = raw.replaceAll('\\', '/');
  let start = scheme[0].length;
  if (protocol === 'file') {
    if (normalized.slice(start, start + 2) !== '//') return {value};
    start += 2;
  } else {
    while (normalized[start] === '/') start++;
  }
  const suffix = normalized.slice(start).search(/[/?#]/);
  const end = suffix < 0 ? normalized.length : start + suffix;
  const authority = normalized.slice(start, end);
  if (protocol === 'file' && /^[a-z][:|]$/i.test(authority)) return {value};
  start += authority.lastIndexOf('@') + 1;
  const hostPort = normalized.slice(start, end);
  if (!hostPort || hostPort.startsWith('[')) return {value};
  const colon = hostPort.indexOf(':');
  // File authority syntax fails before domain mapping or port parsing.
  if (protocol === 'file' && (authority.includes('@') || colon >= 0)) return {value};
  const hostEnd = colon < 0 ? end : start + colon;
  const host = normalized.slice(start, hostEnd);
  if (!host) return {value};
  const forbidden = forbiddenHost(protocol, host);
  if (forbidden) return {value, error: forbidden};
  const ascii = tr46.toASCII(decodeURIComponent(host), {
    checkHyphens: false, checkBidi: true, checkJoiners: true,
    useSTD3ASCIIRules: false, verifyDNSLength: false,
    transitionalProcessing: false, ignoreInvalidPunycode: false,
  });
  if (ascii === '') return {value, error: 'empty host'};
  if (ascii === null || forbiddenHost(protocol, ascii))
    return {value, error: 'invalid international domain name'};
  return {value: raw.slice(0, start) + ascii + raw.slice(hostEnd), host: ascii};
}
