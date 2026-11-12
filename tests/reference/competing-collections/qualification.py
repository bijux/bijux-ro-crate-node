"""Compose the cardinality correction with exact registered dependency qualifications."""
import contextlib
import copy
from contextvars import ContextVar
import hashlib
import inspect
import json
from pathlib import Path
import sys
import textwrap
from bia_ro_crate.core.parser.jsonld_metadata_parser import JSONLDMetadataParser
from guard import reject_competing_arcs

folder = Path(__file__).resolve().parent
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


@contextlib.contextmanager
def collection_qualification(oracle, request, registration):
    contract = json.loads((folder / 'correction.json').read_text())
    relative = registration.resolve().relative_to(folder.parents[2]).as_posix()
    assert relative in contract['supplemental_inputs'], 'Unregistered supplemental qualification'
    assert digest(registration) == contract['supplemental_inputs'][relative]
    assert encode(request) == encode(json.loads(registration.read_text())), 'Exact supplemental collection registration required'
    assert digest(folder / 'guard.py') == contract['guard_sha256']
    pin = json.loads((folder.parents[2] / 'docs/compatibility/reference.json').read_text())
    assert pin['commit'] == contract['reference'] and pin['kind'] == 'merged-main'
    original = JSONLDMetadataParser._id_reference_validation
    assert hashlib.sha256(inspect.getsource(original).encode()).hexdigest() == contract['metadata_reference_sha256']
    source = textwrap.dedent(inspect.getsource(original)).rstrip() + '\n    reject_competing_arcs(self, graph)\n'
    namespace = {**original.__globals__, 'reject_competing_arcs': reject_competing_arcs}
    exec(compile(source, '<registered-supplemental-collection-cardinality>', 'exec'), namespace)
    corrected = namespace[original.__name__]
    current = ContextVar('supplemental_collection_case')
    registered = {case['name']: case for case in request['cases']}
    observations = []
    original_case = oracle['run_case']
    case_namespace = original_case.__globals__

    def observed(self, path):
        case = current.get()
        assert sys._getframe(1).f_code is JSONLDMetadataParser._pre_parse_validation.__code__, 'Wrong supplemental collection role'
        assert encode(case) == encode(registered[case['name']])
        assert Path(path) == self._ro_crate_root / 'ro-crate-metadata.json'
        assert Path(path).read_bytes() == case['files']['ro-crate-metadata.json'].encode('utf-8')
        observations.append({'name': case['name'], 'role': contract['role']})
        return corrected(self, path)

    def run_case(case):
        assert encode(case) == encode(registered[case['name']])
        token = current.set(copy.deepcopy(case))
        try:
            return original_case(case)
        finally:
            current.reset(token)

    try:
        JSONLDMetadataParser._id_reference_validation = observed
        case_namespace['run_case'] = run_case
        yield {'reference': contract['reference'], 'metadata_reference_sha256': contract['metadata_reference_sha256'],
            'guard_sha256': contract['guard_sha256'], 'registration': relative,
            'inputs_sha256': digest(registration), 'helper_sha256': digest(Path(__file__)), 'observations': observations}
        assert observations == [{'name': case['name'], 'role': contract['role']} for case in request['cases']]
    finally:
        JSONLDMetadataParser._id_reference_validation = original
        case_namespace['run_case'] = original_case
