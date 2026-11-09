"""Protect exact capture scope and restore the original pandas call boundaries."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest
import pandas as pd
from pandas.io.parsers import c_parser_wrapper as wrapper
from rules import corrected_manifest_reads

folder = Path(__file__).parent
root = folder.parents[2]
registered = json.loads((folder / 'inputs.json').read_text())


class CaptureScope(unittest.TestCase):
    def refused(self, request):
        result = subprocess.run([sys.executable, str(folder / 'capture.py'), '--corrected',
                                 '--integrity-output', str(root / 'artifacts/capture-scope/integrity.json')],
                                input=json.dumps(request), text=True, capture_output=True, timeout=30)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Manifest capture requires all exact registered inputs', result.stderr)
        self.assertEqual(result.stdout, '')

    def test_missing_and_reordered_cases_are_refused(self):
        self.refused({'cases': registered['cases'][:-1]})
        self.refused({'cases': list(reversed(registered['cases']))})

    def test_changed_bytes_contexts_and_member_order_are_refused(self):
        changed = copy.deepcopy(registered)
        changed['cases'][0]['files']['file_list.tsv'] += '\n'
        self.refused(changed)
        changed = copy.deepcopy(registered)
        changed['cases'][0]['contexts'] = {'https://example.org/context': {'@context': {}}}
        self.refused(changed)
        changed = copy.deepcopy(registered)
        changed['cases'][0] = dict(reversed(list(changed['cases'][0].items())))
        self.refused(changed)

    def test_exception_restores_both_original_functions(self):
        read_csv, concatenate = pd.read_csv, wrapper._concatenate_chunks
        with self.assertRaisesRegex(RuntimeError, 'proof interruption'):
            with corrected_manifest_reads():
                self.assertIsNot(pd.read_csv, read_csv)
                raise RuntimeError('proof interruption')
        self.assertIs(pd.read_csv, read_csv)
        self.assertIs(wrapper._concatenate_chunks, concatenate)


if __name__ == '__main__':
    unittest.main()
