import {makeWorkloadCases} from './workload-cases.mjs';
import { readdir, readFile } from 'node:fs/promises';
import { makeTSVCases } from './tsv-cases.mjs';
import {makeJSONLDCases} from './corpus/jsonld.mjs';
import {makeOntologyCases} from './corpus/ontology.mjs';
import {makeIntegerCases} from './corpus/integers.mjs';
import {makeDatatypeCases} from './corpus/datatypes.mjs';
import {makeDateCases} from './corpus/dates.mjs';
import {makeURLCases} from './corpus/urls.mjs';
import {makeNonfiniteCases} from './corpus/nonfinite.mjs';
import {makePathCases} from './corpus/paths.mjs';
import {makeCollectionCases} from './corpus/collections.mjs';
import {makeRDFSemanticCases} from './corpus/rdf-semantics.mjs';
import {makeManifestRecordCases} from './corpus/manifest-records.mjs';

const metadataName = 'ro-crate-metadata.json';

export async function makeCases() {
  const fixtureRoot = new URL('./fixtures/', import.meta.url);
  const fixtureCases = [];
  for (const name of (await readdir(fixtureRoot)).sort()) {
    const directory = new URL(`${name}/`, fixtureRoot);
    const files = {};
    for (const filename of await readdir(directory)) {
      files[filename] = await readFile(new URL(filename, directory), 'utf8');
    }
    fixtureCases.push({ name: `upstream/${name}`, files, kind: 'fixture' });
  }
  const minimal = fixtureCases.find(item => item.name.endsWith('/test_minimal_valid_ro_crate'));
  const typical = fixtureCases.find(item => item.name.endsWith('/test_typical_ro_crate'));
  const inputs = new URL('./inputs/', import.meta.url);
  const explicitCases = [];
  for (const name of (await readdir(inputs)).sort()) {
    const data = JSON.parse(await readFile(new URL(name, inputs), 'utf8'));
    explicitCases.push(...data.cases);
  }
  const mutations = [];
  const add = (name, mutate, base = minimal) => {
    const files = structuredClone(base.files);
    const metadata = JSON.parse(files[metadataName]);
    mutate(metadata, files);
    if (files[metadataName] !== null) files[metadataName] = JSON.stringify(metadata);
    else delete files[metadataName];
    mutations.push({ name: `mutation/${name}`, files, kind: 'mutation' });
  };
  const entity = (metadata, id) => metadata['@graph'].find(value => value['@id'] === id);

  add('missing-metadata', (metadata, files) => { files[metadataName] = null; });
  add('missing-file-list', (metadata, files) => { delete files['file_list.tsv']; });
  add('empty-file-list', (metadata, files) => { files['file_list.tsv'] = ''; });
  add('missing-context', metadata => { delete metadata['@context']; });
  add('missing-graph', metadata => { delete metadata['@graph']; });
  add('empty-graph', metadata => { metadata['@graph'] = []; });
  add('missing-root', metadata => { metadata['@graph'] = metadata['@graph'].filter(value => value['@id'] !== './'); });
  add('missing-descriptor', metadata => { metadata['@graph'] = metadata['@graph'].filter(value => value['@id'] !== metadataName); });
  for (const field of ['name', 'description', 'license', 'datePublished', 'author', 'accessionId', 'hasPart']) {
    add(`study-missing-${field}`, metadata => { delete entity(metadata, './')[field]; });
  }
  add('study-invalid-date', metadata => { entity(metadata, './').datePublished = 'invalid-date'; });
  add('study-invalid-license', metadata => { entity(metadata, './').license = 'invalid license'; });
  add('study-name-number', metadata => { entity(metadata, './').name = 7; });
  add('study-name-null', metadata => { entity(metadata, './').name = null; });
  add('study-author-single-reference', metadata => { entity(metadata, './').author = entity(metadata, './').author[0]; });
  add('study-author-string', metadata => { entity(metadata, './').author = 'someone'; });
  add('study-empty-author', metadata => { entity(metadata, './').author = []; });
  add('unknown-field', metadata => { entity(metadata, './').surpriseField = 'value'; });
  add('contributor-missing-name', metadata => { delete metadata['@graph'][2].name; });
  add('contributor-role-string', metadata => { metadata['@graph'][2].role = 'author'; });
  add('contributor-email-number', metadata => { metadata['@graph'][2].email = 7; });
  add('duplicate-entity', metadata => { metadata['@graph'].push(structuredClone(metadata['@graph'][2])); });
  add('unknown-bia-type', metadata => { metadata['@graph'][2]['@type'] = ['bia:UnknownType']; });
  add('multiple-bia-types', metadata => { metadata['@graph'][2]['@type'].push('bia:Dataset'); });
  add('type-as-string', metadata => { metadata['@graph'][2]['@type'] = 'bia:Contributor'; });
  add('remapped-term', metadata => { metadata['@context'][1].accessionId = { '@id': 'http://example.org/changed' }; });
  add('extra-context-term', metadata => { metadata['@context'][1].customValue = 'http://example.org/customValue'; entity(metadata, './').customValue = 'allowed'; });
  add('undefined-reference', metadata => { entity(metadata, './').author[0]['@id'] = '#undefined-author'; });
  add('wrong-reference-type', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\na.tif\thttps://orcid.org/9999-0001-2222-3333\n'; });
  add('valid-file-row', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\na.tif\t./\n'; });
  add('duplicate-file-row', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\na.tif\t./\na.tif\t./\n'; });
  add('undefined-row-reference', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\na.tif\t#undefined\n'; });
  add('blank-row-reference', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\na.tif\t\n'; });
  add('missing-tsv-header', (metadata, files) => { files['file_list.tsv'] = 'dataset\n./\n'; });
  add('extra-tsv-header', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\textra\na.tif\t./\tignored\n'; });
  add('quoted-tsv-value', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\n"a\tb.tif"\t./\n'; });
  add('crlf-tsv', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\r\na.tif\t./\r\n'; });
  add('utf8-tsv', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\n细胞.tif\t./\n'; });
  add('nan-file-paths', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\nNA\t./\nNaN\t./\n'; });
  add('numeric-row-reference', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\na.tif\t12\n'; });
  add('column-missing-name', metadata => { delete entity(metadata, '#col0').columnName; });
  add('column-missing-property', metadata => { delete entity(metadata, '#col0').propertyUrl; });
  add('schema-column-reference-string', metadata => { entity(metadata, '#ts0').column = '#col0'; });
  add('file-list-missing-schema', metadata => { delete entity(metadata, 'file_list.tsv').tableSchema; });
  add('extra-unconnected-object', metadata => { metadata['@graph'].push({ '@id': '#unconnected', '@type': 'bia:Contributor', name: 'Unconnected Person' }); });
  add('typical-empty-tsv', (metadata, files) => { files['file_list.tsv'] = files['file_list.tsv'].split('\n')[0] + '\n'; }, typical);

  add('publisher-reference-person', metadata => { entity(metadata, './').publisher = { '@id': metadata['@graph'][2]['@id'] }; });
  add('publisher-literal', metadata => { entity(metadata, './').publisher = 'A publisher'; });
  add('descriptor-missing-type', metadata => { delete entity(metadata, metadataName)['@type']; });
  add('descriptor-wrong-type', metadata => { entity(metadata, metadataName)['@type'] = 'Person'; });
  add('descriptor-wrong-conformsTo', metadata => { entity(metadata, metadataName).conformsTo = { '@id': 'https://example.org/profile' }; });
  add('descriptor-literal-conformsTo', metadata => { entity(metadata, metadataName).conformsTo = 'https://w3id.org/ro/crate/1.1'; });
  add('descriptor-missing-conformsTo', metadata => { delete entity(metadata, metadataName).conformsTo; });
  add('descriptor-about-literal', metadata => { entity(metadata, metadataName).about = './'; });
  add('descriptor-about-list', metadata => { entity(metadata, metadataName).about = [{ '@id': './' }]; });
  add('descriptor-about-other-entity', metadata => { entity(metadata, metadataName).about = { '@id': metadata['@graph'][2]['@id'] }; });
  add('descriptor-about-empty', metadata => { entity(metadata, metadataName).about = {}; });
  add('nested-invalid-id', metadata => { entity(metadata, './').author = [{ '@id': 'bad ^ %ZZ' }]; });
  add('nested-numeric-id', metadata => { entity(metadata, './').author = [{ '@id': 7 }]; });
  add('entity-missing-id', metadata => { delete metadata['@graph'][2]['@id']; });
  add('entity-numeric-id', metadata => { metadata['@graph'][2]['@id'] = 7; });
  add('entity-null-id', metadata => { metadata['@graph'][2]['@id'] = null; });
  add('entity-object-id', metadata => { metadata['@graph'][2]['@id'] = {}; });
  add('entity-missing-type', metadata => { delete metadata['@graph'][2]['@type']; });
  add('entity-numeric-type', metadata => { metadata['@graph'][2]['@type'] = 7; });
  add('entity-null-type', metadata => { metadata['@graph'][2]['@type'] = null; });
  add('entity-object-type', metadata => { metadata['@graph'][2]['@type'] = {}; });
  add('literal-hasPart', metadata => { entity(metadata, './').hasPart = ['file_list.tsv']; });
  add('object-hasPart', metadata => { entity(metadata, './').hasPart = { '@id': 'file_list.tsv' }; });
  add('root-wrong-schema-type', metadata => { entity(metadata, './')['@type'] = ['Person', 'bia:Study']; });
  add('root-no-bia-type', metadata => { entity(metadata, './')['@type'] = 'Dataset'; });
  add('web-site-entity', metadata => { metadata['@graph'].push({ '@id': 'https://example.org/', '@type': 'WebSite', name: 'Web site' }); entity(metadata, './').subject = { '@id': 'https://example.org/' }; });
  add('custom-subclass-root', metadata => { metadata['@context'][1].SpecialStudy = 'http://example.org/SpecialStudy'; metadata['@context'][1].subClassOf = { '@id': 'http://www.w3.org/2000/01/rdf-schema#subClassOf', '@type': '@id' }; metadata['@graph'].push({ '@id': 'http://example.org/SpecialStudy', subClassOf: 'http://schema.org/Dataset' }); entity(metadata, './')['@type'] = ['SpecialStudy', 'bia:Study']; });
  add('extra-present-file', (metadata, files) => { files['extra.txt'] = 'present'; });
  add('unlisted-missing-data-file', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\nmissing.tif\t./\n'; });
  add('listed-present-data-file', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\npresent.tif\t./\n'; files['present.tif'] = 'present'; });
  add('nested-manifest', (metadata, files) => { entity(metadata, './').hasPart[0]['@id'] = 'metadata/list.tsv'; entity(metadata, 'file_list.tsv')['@id'] = 'metadata/list.tsv'; files['metadata/list.tsv'] = files['file_list.tsv']; delete files['file_list.tsv']; });
  add('escaped-space-manifest', (metadata, files) => { entity(metadata, './').hasPart[0]['@id'] = 'file%20list.tsv'; entity(metadata, 'file_list.tsv')['@id'] = 'file%20list.tsv'; files['file list.tsv'] = files['file_list.tsv']; delete files['file_list.tsv']; });
  add('unescaped-space-manifest', (metadata, files) => { entity(metadata, './').hasPart[0]['@id'] = 'file list.tsv'; entity(metadata, 'file_list.tsv')['@id'] = 'file list.tsv'; files['file list.tsv'] = files['file_list.tsv']; delete files['file_list.tsv']; });
  add('dot-relative-manifest', (metadata, files) => { entity(metadata, './').hasPart[0]['@id'] = './file_list.tsv'; entity(metadata, 'file_list.tsv')['@id'] = './file_list.tsv'; });
  add('root-empty-description', metadata => { entity(metadata, './').description = ''; });
  add('root-future-date', metadata => { entity(metadata, './').datePublished = '2999-01-01'; });
  add('root-missing-keywords', metadata => { delete entity(metadata, './').keywords; });
  add('tsv-quoted-newline', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\n"a\nb.tif"\t./\n'; });
  add('tsv-ragged-short', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\na.tif\n'; });
  add('tsv-ragged-long', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\na.tif\t./\textra\n'; });
  add('tsv-ragged-mixed', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\na.tif\t./\nb.tif\t./\textra\n'; });
  add('tsv-unclosed-quote', (metadata, files) => { files['file_list.tsv'] = 'file_path\tdataset\n"a.tif\t./\n'; });
  add('tsv-bom', (metadata, files) => { files['file_list.tsv'] = '\ufefffile_path\tdataset\na.tif\t./\n'; });
  add('tsv-invalid-utf8', (metadata, files) => { files['file_list.tsv'] = [255, 254, 253]; });
  add('graph-object', metadata => { metadata['@graph'] = metadata['@graph'][0]; });
  add('graph-null', metadata => { metadata['@graph'] = null; });
  add('context-null', metadata => { metadata['@context'] = null; });
  const raw = (name, content) => { const files = structuredClone(minimal.files); files[metadataName] = content; mutations.push({ name: `mutation/${name}`, files, kind: 'mutation' }); };
  raw('json-truncated', '{');
  raw('json-null', 'null');
  raw('json-array', '[]');
  raw('json-string', '"text"');
  raw('json-bom', '\ufeff' + minimal.files[metadataName]);
  raw('json-invalid-utf8', [255, 254, 253]);

  for (const [name, identifier, path] of [
    ['legacy-percent-manifest', 'file%ZZ.tsv', 'file%ZZ.tsv'],
    ['replacement-byte-manifest', 'file%FF.tsv', 'file\ufffd.tsv'],
    ['encoded-bom-manifest', '%EF%BB%BFfile.tsv', '\ufefffile.tsv'],
  ]) {
    const files = structuredClone(minimal.files);
    files[metadataName] = files[metadataName].replaceAll('file_list.tsv', identifier);
    files[path] = files['file_list.tsv'];
    delete files['file_list.tsv'];
    mutations.push({name: 'mutation/' + name, files, kind: 'mutation'});
  }
  const precision = [];
  for (const [name, token] of [
    ['integer-above-safe', '9007199254740993'],
    ['integer-below-safe', '-9007199254740993'],
    ['integer-arbitrary-precision', '1234567890123456789012345678901234567890'],
    ['integer-string-above-safe', '"9007199254740993"'],
    ['integer-string-arbitrary-precision', '"1234567890123456789012345678901234567890"'],
    ['infinite-publication-year', '1e400'],
  ]) {
    const files = structuredClone(minimal.files);
    const metadata = JSON.parse(files[metadataName]);
    metadata['@graph'].find(item => item['@id'] === './').relatedPublication = [{'@id': '#precision-publication'}];
    metadata['@graph'].push({'@id': '#precision-publication', '@type': 'bia:Publication', yearPublished: '__BIJUX_INTEGER__'});
    files[metadataName] = JSON.stringify(metadata).replace('"__BIJUX_INTEGER__"', token);
    precision.push({name: 'precision/' + name, files, kind: 'mutation'});
  }
  add('inert-owl-version-info', metadata => {
    metadata['@context'].push({versionInfo: 'http://www.w3.org/2002/07/owl#versionInfo'});
    entity(metadata, './').versionInfo = 'release annotation';
  });
  add('non-list-owl-property-chain', metadata => {
    metadata['@context'].push({inference: {'@id': 'http://www.w3.org/2002/07/owl#propertyChainAxiom', '@type': '@id'}});
    metadata['@graph'][0].inference = 'http://example.org/property';
  });
  for (const property of ['subPropertyOf', 'domain']) {
    add('inert-rdfs-' + property, metadata => {
      metadata['@context'].push({declaration: {'@id': 'http://www.w3.org/2000/01/rdf-schema#' + property, '@type': '@id'}});
      entity(metadata, './').declaration = 'file_list.tsv';
    });
  }
  return [...fixtureCases, ...mutations, ...makeTSVCases(minimal), ...makeManifestRecordCases(minimal), ...precision, ...makeWorkloadCases(minimal),
    ...makeJSONLDCases(minimal), ...makeOntologyCases(minimal), ...makeIntegerCases(minimal),
    ...makeDateCases(minimal), ...makeDatatypeCases(minimal), ...makeURLCases(minimal), ...makeNonfiniteCases(minimal), ...makePathCases(minimal), ...makeCollectionCases(minimal), ...makeRDFSemanticCases(minimal), ...explicitCases];
}
