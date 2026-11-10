"""Capture complete crates with an isolated, role-bounded default-graph correction."""
import argparse
import contextlib
import copy
import hashlib
import inspect
import io
import json
from pathlib import Path
import runpy
import sys
from contextvars import ContextVar
from importlib.metadata import version
from pyld import jsonld
from rdflib import Graph, URIRef, BNode, Literal
from rocrate_validator.models import ValidationContext
import bia_ro_crate.core.parser.jsonld_metadata_parser as metadata

folder = Path(__file__).parent
root = folder.parents[2]
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def source_identity():
    functions = {
        'Graph.parse': Graph.parse,
        'metadata_reference': metadata.JSONLDMetadataParser._id_reference_validation,
        'profile_graph': ValidationContext.__load_data_graph__,
        'PyLD.expand': jsonld.JsonLdProcessor._expand,
        'PyLD.to_rdf': jsonld.JsonLdProcessor.to_rdf,
        'PyLD.index_map': jsonld.JsonLdProcessor._expand_index_map,
    }
    return {'versions': {name: version(name) for name in ['bia-ro-crate-validator', 'PyLD', 'rdflib', 'roc-validator']},
            'functions': {name: hashlib.sha256(inspect.getsource(value).encode()).hexdigest()
                          for name, value in functions.items()}}


@contextlib.contextmanager
def corrected_graphs(oracle, request):
    contract = json.loads((folder / 'correction.json').read_text())
    assert source_identity() == contract['reference'], 'Pinned graph constructor source changed'
    assert digest(folder / 'inputs.json') == contract['inputs_sha256'], 'Registered graph inputs changed'
    registered = {item['name']: item for item in request['cases']}
    current = ContextVar('graph_context_case')
    observations = []
    parse = Graph.parse
    run_case = oracle['run_case']
    namespace = run_case.__globals__
    roles = {'metadata_reference': metadata.JSONLDMetadataParser._id_reference_validation.__code__,
             'profile_graph': ValidationContext.__load_data_graph__.__code__}

    def graph_parse(self, source=None, *args, **kwargs):
        caller = sys._getframe(1).f_code
        role = next((name for name, code in roles.items() if caller is code), None)
        if role is None:
            return parse(self, source, *args, **kwargs)
        assert not args and kwargs.get('format') == 'json-ld'
        case = current.get()
        assert encode(case) == encode(registered[case['name']]), 'Unregistered graph correction request'
        expected = case['files']['ro-crate-metadata.json']
        if role == 'metadata_reference':
            assert set(kwargs) == {'format'}
            path = Path(source)
            assert path.name == 'ro-crate-metadata.json' and path.read_bytes() == expected.encode('utf-8')
            document, base = json.loads(expected), path.resolve().as_uri()
        else:
            assert source is None and set(kwargs) == {'data', 'format', 'publicID'}
            raw = kwargs['data']
            document = json.loads(raw) if isinstance(raw, str) else copy.deepcopy(raw)
            assert document == json.loads(expected), 'Profile graph document changed'
            base = kwargs['publicID']
        assert len(self) == 0, 'Graph correction requires an empty destination'
        dataset = jsonld.to_rdf(copy.deepcopy(document), {'base': base})

        def term(value):
            kind, text = value['type'], value['value']
            if kind == 'IRI':
                return URIRef(text)
            if kind == 'blank node':
                return BNode(text.removeprefix('_:'))
            language = value.get('language')
            return Literal(text, lang=language, datatype=URIRef(value['datatype']) if not language else None,
                           normalize=False)

        for quad in dataset.get('@default', []):
            self.add(tuple(term(quad[key]) for key in ['subject', 'predicate', 'object']))
        observations.append({'name': case['name'], 'role': role, 'triples': len(self),
                             'named_graphs': sum(key != '@default' for key in dataset)})
        return self

    def registered_case(case):
        assert encode(case) == encode(registered[case['name']]), 'Unregistered corrected crate'
        token = current.set(copy.deepcopy(case))
        try:
            return run_case(case)
        finally:
            current.reset(token)

    try:
        Graph.parse = graph_parse
        namespace['run_case'] = registered_case
        yield {**contract, 'capture_sha256': digest(Path(__file__)), 'observations': observations}
        assert [(row['name'], row['role']) for row in observations] == [
            (case['name'], role) for case in request['cases'] for role in roles
        ], 'Every registered input requires both graph-construction roles'
    finally:
        Graph.parse = parse
        namespace['run_case'] = run_case


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--corrected', action='store_true')
    args = parser.parse_args()
    request = json.load(sys.stdin)
    assert encode(request) == encode(json.loads((folder / 'inputs.json').read_text())), \
        'Graph correction requires the complete registered inputs and order'
    sys.path.insert(0, str(root / 'tests/parity'))
    oracle = runpy.run_path(str(root / 'tests/parity/oracle.py'))
    mode = corrected_graphs(oracle, request) if args.corrected else contextlib.nullcontext(None)
    sys.stdin = io.StringIO(encode(request))
    output = io.StringIO()
    with mode as stamp, contextlib.redirect_stdout(output):
        oracle['main']()
    capture = json.loads(output.getvalue())
    if stamp:
        capture['graph_context_correction'] = stamp
    print(json.dumps(capture))


if __name__ == '__main__':
    main()
