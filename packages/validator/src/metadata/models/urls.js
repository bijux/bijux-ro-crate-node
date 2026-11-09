import {parseURLComponents} from './urls/parser.js';
import {checkUnicodeString} from './unicode-string.js';
import {specialSchemes as special, forbiddenHost, normalizeSpecialHost} from './urls/hostnames.js';

// Pinned URL parsing supplies normalization. On failure, inspect the host
// before its port, matching the reference URL parser's diagnostic precedence.
function failureDetail(value) {
  const trimmed = value.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
  if (!trimmed) return 'input is empty';
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(trimmed);
  if (!scheme) return 'relative URL without a base';
  const protocol = scheme[1].toLowerCase();
  let rest = trimmed.slice(scheme[0].length);
  if (protocol === 'file') rest = rest.replaceAll('\\', '/');
  if (special.has(protocol)) rest = rest.replace(/^[\/\\]+/, '');
  else if (rest.startsWith('//')) rest = rest.slice(2);
  else return 'invalid international domain name';
  const authority = rest.split(special.has(protocol) ? /[\/\\?#]/ : /[/?#]/, 1)[0];
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  if (!hostPort || hostPort.startsWith(':')) return protocol === 'file' ? 'invalid international domain name' : 'empty host';
  let host, port;
  if (hostPort.startsWith('[')) {
    const close = hostPort.indexOf(']');
    if (close === -1) return 'invalid IPv6 address';
    host = hostPort.slice(0, close + 1);
    port = hostPort.slice(close + 1);
    if (port && (!port.startsWith(':') || protocol === 'file')) return 'invalid IPv6 address';
  } else {
    const colon = hostPort.indexOf(':');
    host = colon === -1 ? hostPort : hostPort.slice(0, colon);
    port = colon === -1 ? '' : hostPort.slice(colon);
  }
  // Forbidden domain bytes fail before probing the mapped host or its port.
  const hostError = forbiddenHost(protocol, host);
  if (hostError) return hostError;
  const originalHost = normalizeSpecialHost(value);
  if (originalHost.error) return originalHost.error;
  if (protocol === 'file' && port) return 'invalid international domain name';
  const mappedHost = originalHost.host ?? host;
  try { parseURLComponents(`${protocol}://${mappedHost}/`); }
  catch {
    if (host.startsWith('[')) return 'invalid IPv6 address';
    if ((special.has(protocol) || protocol === 'file') && /(?:^|\.)(?:[0-9]+|0x[0-9a-f]*)\.?$/i.test(mappedHost)) return 'invalid IPv4 address';
    return !special.has(protocol) && protocol !== 'file' ? 'invalid domain character' : 'invalid international domain name';
  }
  if (port && protocol !== 'file') return 'invalid port number';
  return 'invalid international domain name';
}

export function parseURL(value, loc, errors) {
  if (typeof value !== 'string') {
    errors.push({loc, msg: 'URL input should be a string or URL', type: 'url_type'});
    return value;
  }
  if (!checkUnicodeString(value, loc, errors)) return value;
  try {
    const originalHost = normalizeSpecialHost(value);
    if (originalHost.error) throw new TypeError('Invalid URL host');
    const url = parseURLComponents(originalHost.value);
    const protocol = url.protocol.slice(0, -1);
    if (forbiddenHost(protocol, url.hostname)) throw new TypeError('Invalid URL host');
    // Non-special hosts preserve percent escapes. A literal forbidden byte in
    // their authority still fails before encoding, as it does in the reference.
    let raw = value.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
    if (special.has(protocol) || protocol === 'file') raw = raw.replaceAll('\\', '/');
    const authority = raw.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1];
    if (protocol === 'file' && authority && !/^[a-z][:|]$/i.test(authority) &&
        (authority.includes('@') || (authority.includes(':') && !/^\[[^\]]+\]$/.test(authority))))
      throw new TypeError('Invalid file URL authority');
    if (!special.has(protocol) && protocol !== 'file' && authority &&
        forbiddenHost(protocol, authority.slice(authority.lastIndexOf('@') + 1).split(':')[0]))
      throw new TypeError('Invalid URL host');
    return url.href;
  }
  catch {
    errors.push({loc, msg: `Input should be a valid URL, ${failureDetail(value)}`, type: 'url_parsing'});
    return value;
  }
}
