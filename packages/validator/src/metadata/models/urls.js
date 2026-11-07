const special = new Set(['http', 'https', 'ftp', 'ws', 'wss']);

// Native URL parsing supplies normalization. On failure, inspect the host
// before its port, matching the reference URL parser's diagnostic precedence.
function failureDetail(value) {
  const trimmed = value.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
  if (!trimmed) return 'input is empty';
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(trimmed);
  if (!scheme) return 'relative URL without a base';
  const protocol = scheme[1].toLowerCase();
  let rest = trimmed.slice(scheme[0].length);
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
    const colon = hostPort.lastIndexOf(':');
    host = colon === -1 ? hostPort : hostPort.slice(0, colon);
    port = colon === -1 ? '' : hostPort.slice(colon);
  }
  try { new URL(`${protocol}://${host}/`); }
  catch {
    if (host.startsWith('[')) return 'invalid IPv6 address';
    if (special.has(protocol) && /(?:^|\.)(?:[0-9]+|0x[0-9a-f]*)\.?$/i.test(host)) return 'invalid IPv4 address';
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
  try { return new URL(value).href; }
  catch {
    errors.push({loc, msg: `Input should be a valid URL, ${failureDetail(value)}`, type: 'url_parsing'});
    return value;
  }
}
