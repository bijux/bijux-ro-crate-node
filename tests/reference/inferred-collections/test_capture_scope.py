"""The corrected reference cannot classify unregistered input or byte changes."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

directory = Path(__file__).resolve().parent
registered = json.loads((directory / 'inputs.json').read_text())


class CollectionCaptureScope(unittest.TestCase):
    def assert_rejected(self, request):
        result = subprocess.run(
            [sys.executable, str(directory / 'capture.py'), '--corrected'],
            input=json.dumps(request), text=True, capture_output=True, timeout=20,
            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONHASHSEED': '0'},
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')
        self.assertIn('exact registered collection inputs', result.stderr)

    def test_missing_or_additional_cases(self):
        for count in [-1, 1]:
            request = copy.deepcopy(registered)
            if count < 0:
                request['cases'].pop()
            else:
                extra = copy.deepcopy(request['cases'][0])
                extra['name'] = 'unregistered-collection'
                request['cases'].append(extra)
            with self.subTest(count=count):
                self.assert_rejected(request)

    def test_reordered_cases(self):
        request = copy.deepcopy(registered)
        request['cases'].reverse()
        self.assert_rejected(request)

    def test_file_bytes_changed_without_changing_the_json_graph(self):
        request = copy.deepcopy(registered)
        request['cases'][0]['files']['ro-crate-metadata.json'] += '\n'
        self.assert_rejected(request)

    def test_new_context_bindings(self):
        request = copy.deepcopy(registered)
        request['cases'][0]['contexts'] = {'https://example.test/context': {'@context': {}}}
        self.assert_rejected(request)

    def test_extra_request_modes(self):
        request = copy.deepcopy(registered)
        request['stream'] = True
        self.assert_rejected(request)


if __name__ == '__main__':
    unittest.main()
