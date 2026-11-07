/** Additional pandas dialect and type-inference cases, shared by Node and browser. */
export function makeTSVCases(minimal) {
  const inputs = [
    ['bom-header', '\uFEFFfile_path\tdataset\nimage.tif\t#dataset\n'],
    ['blank-lines', '\n  \nfile_path\tdataset\n\n \nimage.tif\t#dataset\n'],
    ['quoted-tab', 'file_path\tdataset\n"image\tname.tif"\t#dataset\n'],
    ['quoted-newline', 'file_path\tdataset\n"image\nname.tif"\t#dataset\n'],
    ['escaped-double-quote', 'file_path\tdataset\n"image""name.tif"\t#dataset\n'],
    ['post-quote-characters', 'file_path\tdataset\n"image"suffix.tif\t#dataset\n'],
    ['implicit-index', 'file_path\tdataset\nrow-id\timage.tif\t#dataset\n'],
    ['ragged-overflow', 'file_path\tdataset\nimage.tif\t#dataset\nimage2.tif\t#dataset\textra\n'],
    ['unterminated-quote', 'file_path\tdataset\n"image.tif\t#dataset\n'],
    ['missing-trailing-cell', 'file_path\tdataset\nimage.tif\n'],
    ['quoted-na-reference', 'file_path\tdataset\nimage.tif\t"NA"\n'],
    ['na-spellings', 'file_path\tdataset\na\tNULL\nb\tNone\nc\t#N/A\nd\t<NA>\ne\tn/a\n'],
    ['na-whitespace-is-reference', 'file_path\tdataset\nimage.tif\t NA \n'],
    ['numeric-reference', 'file_path\tdataset\nimage.tif\t01\n'],
    ['boolean-reference', 'file_path\tdataset\nimage.tif\tTrue\n'],
    ['numeric-path-duplicate', 'file_path\tdataset\n01\t#dataset\n1\t#dataset\n'],
    ['boolean-path-duplicate', 'file_path\tdataset\ntrue\t#dataset\nTrUE\t#dataset\n'],
    ['float-path-duplicate', 'file_path\tdataset\n1e2\t#dataset\n100.0\t#dataset\n'],
    ['pandas-float-rounding-duplicate', 'file_path\tdataset\n0.30000000000000004\t#dataset\n0.3\t#dataset\n'],
    ['pandas-leading-zero-precision-duplicate', 'file_path\tdataset\n000000000000000001.2\t#dataset\n0.0\t#dataset\n'],
    ['pandas-subnormal-distinct-paths', 'file_path\tdataset\n1e-309\t#dataset\n0.0\t#dataset\n'],
    ['pandas-zero-overflow-string-path', 'file_path\tdataset\n0e309\t#dataset\n0.0\t#dataset\n'],
    ['infinity-path-duplicate', 'file_path\tdataset\ninf\t#dataset\nInfinity\t#dataset\n'],
    ['uint64-distinct-paths', 'file_path\tdataset\n18446744073709551614\t#dataset\n18446744073709551615\t#dataset\n'],
    ['beyond-uint64-lexical-duplicate', 'file_path\tdataset\n18446744073709551616\t#dataset\n018446744073709551616\t#dataset\n+18446744073709551616\t#dataset\n'],
    ['beyond-uint64-mixed-float-paths', 'file_path\tdataset\n18446744073709551616\t#dataset\n1.5\t#dataset\n'],
    ['uint64-with-missing-path', 'file_path\tdataset\n18446744073709551615\t#dataset\nNA\t#dataset\n'],
    ['float-overflow-string-path', 'file_path\tdataset\n1e309\t#dataset\ninf\t#dataset\n'],
    ['nul-truncated-path-duplicate', 'file_path\tdataset\na\u0000suffix\t#dataset\na\t#dataset\n'],
    ['duplicate-header', 'file_path\tdataset\tdataset\nimage.tif\t#dataset\t#dataset\n'],
    ['unnamed-header', 'file_path\tdataset\t\nimage.tif\t#dataset\t\n'],
    ['cr-record-terminators', 'file_path\tdataset\rimage.tif\t#dataset\r'],
  ];
  const boundaryRows = ['001\t#dataset', '1\t#dataset'];
  for (let index = 2; index < 262144; index += 1) boundaryRows.push(`${index}\t#dataset`);
  inputs.push(
    ['low-memory-before-boundary', `file_path\tdataset\n${boundaryRows.slice(0, -1).join('\n')}\nword\t#dataset\n`],
    ['low-memory-after-boundary', `file_path\tdataset\n${boundaryRows.join('\n')}\nword\t#dataset\n`],
  );
  return inputs.map(([name, text]) => {
    const files = structuredClone(minimal.files);
    const metadata = JSON.parse(files['ro-crate-metadata.json']);
    metadata['@graph'].push({'@id': '#dataset', '@type': ['Dataset', 'bia:Dataset'], name: 'TSV test dataset'});
    metadata['@graph'].find(entity => entity['@id'] === './').hasPart.push({'@id': '#dataset'});
    files['ro-crate-metadata.json'] = JSON.stringify(metadata);
    files['file_list.tsv'] = text;
    return {name: `tsv/${name}`, files, kind: 'mutation'};
  });
}
