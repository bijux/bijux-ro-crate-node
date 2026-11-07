export function makeDateCases(minimal) {
  const values = [
    ['short-minute', '2024-01-01T00:0'], ['short-hour', '2024-01-01T0:00'],
    ['short-second', '2024-01-01T00:00:0'], ['short-timezone-hour', '2024-01-01T00:00+0:00'],
    ['short-timezone-minute', '2024-01-01T00:00+00:0'], ['short-compact-timezone', '2024-01-01T00:00+000'],
    ['timezone-without-minutes', '2024-01-01T00:00+01'], ['named-timezone', '2024-01-01T00:00UTC'],
    ['trailing-timezone-data', '2024-01-01T00:00Ztail'], ['unicode-timezone-minus', '2024-01-01T00:00−01:00'],
    ['truncated-microseconds', '2024-01-01T00:00:00.0000009'], ['nonzero-microsecond', '2024-01-01T00:00:00.000001'],
    ['missing-fraction', '2024-01-01T00:00:00.'], ['non-midnight', '2024-01-01T01:00'],
    ['large-positive-epoch', 1e20], ['large-negative-epoch', -1e20],
    ['year-zero-epoch', -62167219200000], ['first-date-epoch', -62135596800000],
    ['numeric-leading-dot', '.0'], ['numeric-trailing-dot', '0.'],
    ['numeric-day-trailing-dot', '86400.'], ['numeric-day-exponent', '86400.e0'],
    ['exponent-without-dot-control', '86400e0'], ['numeric-overflow-exponent', '1.e22'],
    ['numeric-zero-overflow-exponent', '0.0e999'], ['numeric-component-overflow', '9223372036854775808.'],
    ['year-zero-short-time', '0000-01-01T'], ['year-zero-invalid-hour', '0000-01-01T24:00:00'],
    ['year-zero-non-midnight', '0000-01-01T01:00:00'], ['year-zero-midnight', '0000-01-01T00:00:00'],
    ['last-second-milliseconds', '253402300799999'], ['past-last-second-milliseconds', '253402300800000'],
    ['last-date-epoch', 253402214400000], ['excess-date-epoch', 253402300800000],
  ]
  return values.map(([name, value]) => {
    const files = structuredClone(minimal.files)
    const doc = JSON.parse(files['ro-crate-metadata.json'])
    doc['@graph'].find(e => e['@id'] === './').dateModified = value
    files['ro-crate-metadata.json'] = JSON.stringify(doc)
    return {name: 'date/' + name, files, kind: 'mutation'}
  })
}
