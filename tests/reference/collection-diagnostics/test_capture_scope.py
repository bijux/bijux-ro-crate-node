"""The corrected reference cannot be applied to another diagnostic input."""
import copy
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

folder = Path(__file__).parent
class CaptureScope(unittest.TestCase):
    def test_mutated_inputs_fail_closed(self):
        registered = json.loads((folder / 'inputs.json').read_text())
        def name(data): data['cases'][0]['name'] += '-unregistered'
        def bytes(data): data['cases'][0]['files']['ro-crate-metadata.json'] += '\n'
        def contexts(data): data['cases'][0]['contexts'] = {'urn:other': {'@context': {}}}
        def extra(data): data['cases'].append(copy.deepcopy(data['cases'][0]))
        def order(data): data['cases'].reverse()
        for mutate in [name, bytes, contexts, extra, order]:
            with self.subTest(mutation=mutate.__name__):
                request = copy.deepcopy(registered); mutate(request)
                result = subprocess.run([sys.executable, str(folder / 'capture.py'), '--corrected'],
                    input=json.dumps(request), capture_output=True, text=True,
                    env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, timeout=20)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('exact registered inputs', result.stderr)
                self.assertEqual(result.stdout, '')
if __name__ == '__main__':
    unittest.main()
