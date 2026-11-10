"""A graph correction cannot authorize altered files, resources or member order."""
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
        for mutate in [
            lambda value: value['cases'][0].update(name='unregistered'),
            lambda value: value['cases'][0]['files'].update({'ro-crate-metadata.json': '{}'}),
            lambda value: value['cases'][0].update(contexts={'https://example.org/other': {'@context': {}}}),
            lambda value: value['cases'].reverse(),
            lambda value: value['cases'].pop(),
            lambda value: value['cases'].append(value['cases'][0]),
            lambda value: value.update(stream=True),
        ]:
            request = copy.deepcopy(registered)
            mutate(request)
            requests.append(request)
        for request in requests:
            with self.subTest(request=request['cases'][0]['name']):
                result = subprocess.run([sys.executable, str(folder / 'capture.py'), '--corrected'],
                    input=json.dumps(request), text=True, capture_output=True, cwd=root,
                    env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('complete registered inputs and order', result.stderr)
                self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
