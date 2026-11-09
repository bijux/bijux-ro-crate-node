"""Prove that the dependency correction is bounded and always restored."""
from pathlib import Path
import json
import subprocess
import sys
import unittest
from corrected import corrected_grammar
from html5rdf.html5parser import InBodyPhase
from html5rdf.treebuilders.base import TreeBuilder
from rdflib import Literal, RDF
import logging
logging.disable(logging.CRITICAL)

root = Path(__file__).resolve().parents[3]


class GrammarCorrectionTests(unittest.TestCase):
    def identities(self):
        return (InBodyPhase.__dict__['startTagHandler'], InBodyPhase.__dict__['endTagHandler'],
                TreeBuilder.generateImpliedEndTags)

    def test_original_restored_after_success(self):
        before = self.identities()
        text = '<ruby><rb>x<rt>y</ruby>'
        self.assertIsNone(Literal(text, datatype=RDF.HTML).value)
        with corrected_grammar():
            self.assertIsNotNone(Literal(text, datatype=RDF.HTML).value)
        self.assertEqual(self.identities(), before)
        self.assertIsNone(Literal(text, datatype=RDF.HTML).value)

    def test_original_restored_after_exception(self):
        before = self.identities()
        with self.assertRaisesRegex(RuntimeError, 'explicit interruption'):
            with corrected_grammar():
                raise RuntimeError('explicit interruption')
        self.assertEqual(self.identities(), before)

    def test_strict_heading_and_formatting_controls_remain_unchanged(self):
        inputs = json.loads((root / 'tests/parity/html/tree-errors.json').read_text())['inputs']
        before = [(str(term), term.value is not None) for term in (Literal(text, datatype=RDF.HTML) for text in inputs)]
        with corrected_grammar():
            after = [(str(term), term.value is not None) for term in (Literal(text, datatype=RDF.HTML) for text in inputs)]
        self.assertEqual(before, after)

    def test_capture_refuses_unregistered_input(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('capture.py')), '--corrected'],
                                input='{"cases": []}', text=True, capture_output=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('restricted to the explicit complete-case contracts', result.stderr)


if __name__ == '__main__':
    unittest.main()
