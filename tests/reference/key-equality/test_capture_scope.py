"""Keep the in-memory key correction bounded to the exact complete corpus."""
import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path
from owlrl import OWLRL_Semantics
from rules import corrected_key_rule

folder = Path(__file__).parent
registered = json.loads((folder / 'inputs.json').read_text())


class CaptureScope(unittest.TestCase):
    def refused(self, request):
        result = subprocess.run([sys.executable, str(folder / 'capture.py'), '--corrected'],
                                input=json.dumps(request), text=True, capture_output=True, timeout=30)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Key correction requires the complete registered inputs', result.stderr)
        self.assertEqual(result.stdout, '')

    def test_correction_rejects_missing_or_reordered_inputs(self):
        self.refused({'cases': registered['cases'][:-1]})
        self.refused({'cases': list(reversed(registered['cases']))})

    def test_correction_rejects_changed_bytes_contexts_and_member_order(self):
        changed = copy.deepcopy(registered)
        changed['cases'][0]['files']['ro-crate-metadata.json'] += ' '
        self.refused(changed)
        changed = copy.deepcopy(registered)
        changed['cases'][0]['contexts'] = {'https://example.org/context': {'@context': {}}}
        self.refused(changed)
        changed = copy.deepcopy(registered)
        changed['cases'][0] = dict(reversed(list(changed['cases'][0].items())))
        self.refused(changed)

    def test_correction_restores_original_method_on_exception(self):
        original = OWLRL_Semantics._properties
        with self.assertRaisesRegex(RuntimeError, 'proof interruption'):
            with corrected_key_rule():
                self.assertIsNot(OWLRL_Semantics._properties, original)
                raise RuntimeError('proof interruption')
        self.assertIs(OWLRL_Semantics._properties, original)


if __name__ == '__main__':
    unittest.main()
