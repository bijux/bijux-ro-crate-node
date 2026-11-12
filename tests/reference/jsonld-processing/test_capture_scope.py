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
    def test_corrected_capture_retains_every_original_jsonld_error(self):
        result = subprocess.run([sys.executable, str(folder / 'capture.py'), '--corrected'],
            input=json.dumps(registered), text=True, capture_output=True, cwd=root,
            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONHASHSEED': '0'})
        self.assertEqual(result.returncode, 0, result.stderr)
        captured = json.loads(result.stdout)
        specifications = json.loads((folder / 'contract.json').read_text())['cases']
        expected = {item['name']: item for item in specifications if 'reason' in item}
        direct = {item['name']: item for item in json.loads((folder / 'direct.json').read_text())['cases']}
        observations = captured['jsonld_graph_correction']['observations']
        self.assertEqual([item['name'] for item in observations], [item['name'] for item in captured['cases']])
        self.assertEqual(len(captured['cases']), 72)
        self.assertEqual(len(expected), 39)
        for case, observation in zip(captured['cases'], observations):
            with self.subTest(name=case['name']):
                self.assertEqual(observation['role'], 'metadata reference graph')
                if case['name'] not in expected:
                    self.assertEqual(observation['stage'], 'default graph populated')
                    self.assertNotIn('error', observation)
                    continue
                self.assertEqual(case['status'], 'incomplete')
                self.assertEqual(case['exception']['type'], 'JsonLdError')
                error = direct[case['name']]['error']
                message = ('Invalid JSON-LD syntax; Attempt to add illegal key to value object: @id.'
                           if error['code'] == 'invalid value object' else expected[case['name']]['reason'])
                self.assertEqual(observation['error'], {**error, 'message': message})
                stage = 'expanded value validation' if error['code'] == 'invalid typed value' else 'expansion'
                self.assertEqual(observation['stage'], stage)
                self.assertIn('\nType: ' + error['type'] + '\nCode: ' + error['code'], case['exception']['message'])

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
