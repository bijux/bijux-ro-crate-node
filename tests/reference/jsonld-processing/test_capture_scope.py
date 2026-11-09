"""Reject correction requests outside the exact whole-input registration."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

folder = Path(__file__).parent
root = folder.resolve().parents[2]
registered = json.loads((folder / 'inputs.json').read_text())

class CaptureScope(unittest.TestCase):
    def test_unregistered_requests_fail_before_oracle_execution(self):
        requests = []
        item = copy.deepcopy(registered)
        item['cases'][0]['name'] += '/other'
        requests.append(item)
        item = copy.deepcopy(registered)
        item['cases'][0]['files']['ro-crate-metadata.json'] += ' '
        requests.append(item)
        item = copy.deepcopy(registered)
        item['cases'][-1]['contexts']['https://example.org/local-context']['@context']['extra'] = 'urn:other'
        requests.append(item)
        item = copy.deepcopy(registered)
        item['cases'].reverse()
        requests.append(item)
        requests.append({'cases': registered['cases'][:-1]})
        requests.append({'cases': registered['cases'] + [registered['cases'][0]]})
        requests.append({**registered, 'stream': True})
        for request in requests:
            with self.subTest(request=request['cases'][0]['name']):
                result = subprocess.run([sys.executable, str(folder / 'capture.py'), '--corrected'],
                    input=json.dumps(request), text=True, capture_output=True, cwd=root,
                    env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Exact registered inputs and order required', result.stderr)
                self.assertEqual(result.stdout, '')

if __name__ == '__main__':
    unittest.main()
