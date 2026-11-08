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
  for (const receipt of options.generatedErrorNodes ?? []) {
    if (receipt.provenance !== 'owlrl-7.1.4/closure-created-error-message' ||
        typeof receipt.node !== 'string' || typeof receipt.message !== 'string' ||
        !/^owl-error-+\d+$/.test(receipt.comparison_node))
      throw new Error('Invalid generated OWL error-node receipt')
    if (location === 'At ro-crate object with @id: ' + receipt.node)
      return 'At ro-crate object with @id: ' + receipt.comparison_node
  }
  const normalized = normalizeText(location, root, rootUri);
  // The descriptor-about-empty mutation contains one anonymous root object.
  // RDFLib generates a UUID label and jsonld generates b0 for that same node.
  if (options.anonymousRoot && /^At ro-crate object with @id: (?:N[0-9a-f]{32}|b\d+)$/.test(normalized)) {
    return 'At ro-crate object with @id: _:anonymous-root';
  }
  return normalized;
}

/** Remove capture-machine paths and only proven closure-generated identities. */
export function portableCase(item) {
  const receipts = item.generated_error_nodes ?? [];
  const options = {anonymousRoot: item.name === 'mutation/descriptor-about-empty', generatedErrorNodes: receipts};
  const exception = JSON.parse(JSON.stringify(item.exception), (_key, value) => {
    if (typeof value !== 'string') return value;
    let text = normalizeText(value, item.root, item.root_uri);
    for (const receipt of receipts) {
      const prefix = 'At ro-crate object with @id: ' + receipt.node + ': \n   ';
      if (text.startsWith(prefix)) text = 'At ro-crate object with @id: ' + receipt.comparison_node + ': \n   ' + text.slice(prefix.length);
    }
    return text;
  });
  return {...item, root: '', root_uri: '', exception,
    ...(receipts.length ? {generated_error_nodes: receipts.map(receipt => ({...receipt,
      node: receipt.comparison_node, message: normalizeText(receipt.message, item.root, item.root_uri)}))} : {}),
    report: normalizeReport(item.report, item.root, item.root_uri, options)};
}
