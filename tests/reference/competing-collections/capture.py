"""Capture a registered subset with a separately identified collection correction."""
import contextlib
import copy
from contextvars import ContextVar
import hashlib
import inspect
import io
import json
from pathlib import Path
import runpy
import sys
import textwrap
from bia_ro_crate.core.parser.jsonld_metadata_parser import JSONLDMetadataParser
from guard import reject_competing_arcs

folder = Path(__file__).resolve().parent
root = folder.parents[2]
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def registered_request(request):
    contract = json.loads((folder / 'correction.json').read_text())
    assert digest(folder / 'inputs.json') == contract['inputs_sha256'], 'Collection registration changed'
    registered = json.loads((folder / 'inputs.json').read_text())['cases']
    assert set(request) == {'cases'} and request['cases'], 'Exact registered collection subset required'
    names = [case['name'] for case in request['cases']]
    selected = [case for case in registered if case['name'] in names]
    assert encode(request['cases']) == encode(selected), 'Exact registered collection subset required'
    return {case['name']: case for case in selected}


def main():
    request = json.load(sys.stdin)
    registered = registered_request(request)
    contract = json.loads((folder / 'correction.json').read_text())
    pin = json.loads((root / 'docs/compatibility/reference.json').read_text())
    assert pin['commit'] == contract['reference'] and pin['kind'] == 'merged-main'
    original = JSONLDMetadataParser._id_reference_validation
    assert hashlib.sha256(inspect.getsource(original).encode()).hexdigest() == contract['metadata_reference_sha256']
    assert digest(folder / 'guard.py') == contract['guard_sha256'], 'Collection guard changed'
    source = textwrap.dedent(inspect.getsource(original)).rstrip() + '\n    reject_competing_arcs(self, graph)\n'
    namespace = {**original.__globals__, 'reject_competing_arcs': reject_competing_arcs}
    exec(compile(source, '<registered-metadata-collection-cardinality>', 'exec'), namespace)
    corrected = namespace[original.__name__]
    sys.path.insert(0, str(root / 'tests/parity'))
    oracle = runpy.run_path(str(root / 'tests/parity/oracle.py'))
    original_case = oracle['run_case']
    case_namespace = original_case.__globals__
    current = ContextVar('competing_collection_case')
    observations = []

    def observed(self, path):
        case = current.get()
        assert sys._getframe(1).f_code is JSONLDMetadataParser._pre_parse_validation.__code__, 'Wrong collection correction role'
        assert encode(case) == encode(registered[case['name']]), 'Unregistered corrected collection'
        assert Path(path) == self._ro_crate_root / 'ro-crate-metadata.json'
        assert Path(path).read_bytes() == case['files']['ro-crate-metadata.json'].encode('utf-8')
        observations.append({'name': case['name'], 'role': 'metadata reference validation'})
        return corrected(self, path)

    def run_case(case):
        assert encode(case) == encode(registered[case['name']]), 'Unregistered corrected collection'
        token = current.set(copy.deepcopy(case))
        try:
            return original_case(case)
        finally:
            current.reset(token)

    output = io.StringIO()
    try:
        JSONLDMetadataParser._id_reference_validation = observed
        case_namespace['run_case'] = run_case
        sys.stdin = io.StringIO(encode(request))
        with contextlib.redirect_stdout(output):
            oracle['main']()
    finally:
        JSONLDMetadataParser._id_reference_validation = original
        case_namespace['run_case'] = original_case
    assert observations == [{'name': case['name'], 'role': 'metadata reference validation'} for case in request['cases']]
    result = json.loads(output.getvalue())
    for row in result['cases']:
        assert row['status'] == 'invalid', 'Collection correction must finish as a rule rejection'
        assert row['exception']['type'] == 'ExceptionGroup'
        assert all(child['type'] == 'Exception' for child in row['exception']['children']), 'Instrumentation failure in collection capture'
        assert any(issue['message'].startswith('Ambiguous RDF collection: multiple values for ') for issue in row['report']['issues']['ERROR'])
    result['collection_correction'] = {**contract, 'capture_sha256': digest(Path(__file__)), 'observations': observations}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
