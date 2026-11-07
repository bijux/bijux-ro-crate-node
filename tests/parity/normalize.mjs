export function normalizeText(text, root, rootUri) {
  let result = text;
  if (rootUri) result = result.replaceAll(`${rootUri}/`, 'crate:/').replaceAll(rootUri, 'crate:');
  if (root) {
    const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`(^|[\\s'"<(])${escaped}(?=/|$|['">)])`, 'g'), '$1crate:');
  }
  // Python's graph traversal and set iteration do not guarantee these orders.
  const prefixes = ['Found undefined references: ', 'Found objects in ro-crate-metadata.json with no inbound references: ', 'Found RO-Crate objects with no inbound references across ro-crate-metadata.json and file list references: '];
  for (const prefix of prefixes) {
    if (result.startsWith(prefix)) result = prefix + result.slice(prefix.length).split(', ').sort().join(', ');
  }
  const typeMatch = result.match(/^(@type of object does not contain exactly 1 BIA classes\. @type contains: )(.*)(, matching \d+ BIA classes\.)$/s);
  if (typeMatch) result = typeMatch[1] + typeMatch[2].split(', ').sort().join(', ') + typeMatch[3];
  return result;
}

export function normalizeReport(report, root, rootUri, options = {}) {
  const issues = {};
  for (const level of ['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG']) {
    issues[level] = (report.issues[level] ?? []).map(issue => ({
      message: normalizeText(issue.message, root, rootUri),
      severity: issue.severity,
      location_description: issue.location_description == null ? null : normalizeLocation(issue.location_description, root, rootUri, options),
    })).sort((a, b) => {
      const left = JSON.stringify(a), right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  return { highest_error_level: report.highest_error_level, issues };
}

function normalizeLocation(location, root, rootUri, options) {
  const normalized = normalizeText(location, root, rootUri);
  // The descriptor-about-empty mutation contains one anonymous root object.
  // RDFLib generates a UUID label and jsonld generates b0 for that same node.
  if (options.anonymousRoot && /^At ro-crate object with @id: (?:N[0-9a-f]{32}|b\d+)$/.test(normalized)) {
    return 'At ro-crate object with @id: _:anonymous-root';
  }
  return normalized;
}
