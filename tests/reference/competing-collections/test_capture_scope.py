"""Only exact registered subsets can reach the collection correction."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest
from qualification import collection_qualification
from bia_ro_crate.core.parser.jsonld_metadata_parser import JSONLDMetadataParser

folder = Path(__file__).resolve().parent
registered = json.loads((folder / 'inputs.json').read_text())


def run_case(case):
    return case


class CollectionScope(unittest.TestCase):
    def test_single_registered_case_does_not_execute_other_registrations(self):
        request = {'cases': [registered['cases'][0]]}
        result = subprocess.run([sys.executable, str(folder / 'capture.py')], input=json.dumps(request),
            text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        capture = json.loads(result.stdout)
        self.assertEqual([row['name'] for row in capture['cases']], [request['cases'][0]['name']])
        self.assertEqual(capture['collection_correction']['observations'],
            [{'name': request['cases'][0]['name'], 'role': 'metadata reference validation'}])

    def test_supplemental_scope_and_restoration(self):
        registration = folder.parent / 'temporal-literals/inputs.json'
        request = json.loads(registration.read_text())
        original = JSONLDMetadataParser._id_reference_validation
        previous = run_case.__globals__.get('run_case')
        with self.assertRaisesRegex(RuntimeError, 'bounded observation failure'):
            with collection_qualification({'run_case': run_case}, request, registration):
                with self.assertRaises(LookupError):
                    JSONLDMetadataParser._id_reference_validation(None, None)
                raise RuntimeError('bounded observation failure')
        self.assertIs(JSONLDMetadataParser._id_reference_validation, original)
        self.assertIs(run_case.__globals__.get('run_case'), previous)
        changed = copy.deepcopy(request)
        changed['cases'][0]['files']['ro-crate-metadata.json'] += '\n'
        with self.assertRaisesRegex(AssertionError, 'Exact supplemental'):
            with collection_qualification({'run_case': run_case}, changed, registration):
                self.fail('Mutated supplemental input reached qualification')

    def test_mutated_requests_fail_before_capture(self):
        requests = []
        for mutation in ['name', 'bytes', 'contexts', 'order', 'duplicate', 'mode', 'empty']:
            request = {'cases': copy.deepcopy(registered['cases'][:2])}
            if mutation == 'name': request['cases'][0]['name'] += '/unregistered'
            if mutation == 'bytes': request['cases'][0]['files']['ro-crate-metadata.json'] += '\n'
            if mutation == 'contexts': request['cases'][0]['contexts'] = {'https://example.test/context': {'@context': {}}}
            if mutation == 'order': request['cases'].reverse()
            if mutation == 'duplicate': request['cases'].append(copy.deepcopy(request['cases'][0]))
            if mutation == 'mode': request['stream'] = True
            if mutation == 'empty': request['cases'] = []
            requests.append(request)
        for request in requests:
            with self.subTest(request=request):
                result = subprocess.run([sys.executable, str(folder / 'capture.py')], input=json.dumps(request),
                    text=True, capture_output=True, timeout=20)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, '')
                self.assertIn('Exact registered collection subset required', result.stderr)


if __name__ == '__main__': unittest.main()
