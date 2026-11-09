"""Capture default-graph primitives and explicit value-construction invariants."""
import copy
import hashlib
import json
from pathlib import Path
from pyld import jsonld
from rdflib.term import _is_valid_langtag
from language import well_formed
from corrected import source_identity, validate_expanded_values

folder = Path(__file__).parent
source = folder / 'documents.json'
assert hashlib.sha256(source.read_bytes()).hexdigest() == json.loads((folder / 'contract.json').read_text())['documents_sha256']
registered = json.loads(source.read_text())['cases']
assert len(registered) == len({item['name'] for item in registered}) == 72
assert source_identity() == json.loads((folder / 'correction.json').read_text())['reference']
assert hashlib.sha256((folder / 'language.py').read_bytes()).hexdigest() == json.loads((folder / 'correction.json').read_text())['language_grammar_sha256']
rows = []
for item in registered:
    jsonld._resolved_context_cache.clear()
    jsonld._inverse_context_cache.clear()
    document = copy.deepcopy(item['document'])
    try:
        expanded = jsonld.expand(copy.deepcopy(document), {'base': 'file:///crate/ro-crate-metadata.json'})
        validate_expanded_values(expanded)
        def no_explicit_string_type(value):
            if isinstance(value, list):
                for child in value:
                    no_explicit_string_type(child)
            elif isinstance(value, dict):
                assert not ('@value' in value and value.get('@type') == 'http://www.w3.org/2001/XMLSchema#string'), 'Untyped projection outside registered scope'
                for child in value.values():
                    no_explicit_string_type(child)
        no_explicit_string_type(expanded)
        dataset = jsonld.to_rdf(document, {'base': 'file:///crate/ro-crate-metadata.json'})
    except jsonld.JsonLdError as error:
        rows.append({'name': item['name'], 'error': {'type': error.type, 'code': error.code}})
        continue

    def term(value):
        kind, text = value['type'], value['value']
        if kind == 'IRI':
            return ['NamedNode', text]
        if kind == 'blank node':
            return ['BlankNode', text.removeprefix('_:')]
        # The registered primitives have no explicit xsd:string coercion.
        # Preserve the validator's untyped-string term distinction, not a report waiver.
        datatype = value.get('datatype', '')
        if datatype == 'http://www.w3.org/2001/XMLSchema#string':
            datatype = ''
        return ['Literal', text, datatype, value.get('language', '')]

    triples = []
    for quad in dataset.get('@default', []):
        language = quad['object'].get('language')
        if language is not None and not well_formed(language):
            continue
        triples.append([term(quad[key]) for key in ['subject', 'predicate', 'object']])
    triples.sort(key=lambda row: json.dumps(row, ensure_ascii=False, separators=(',', ':')))
    rows.append({'name': item['name'], 'triples': triples})
print(json.dumps({'reference': source_identity(), 'inputs_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                  'graph_scope': 'default graph', 'cases': rows}, ensure_ascii=False, indent=2))
