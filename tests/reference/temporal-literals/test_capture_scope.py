"""Keep temporal corrections confined to the registered bytes and converters."""
import copy
import datetime
import json
import subprocess
import sys
import unittest
from pathlib import Path

import rdflib.term
from rdflib import Graph, Literal
from rdflib.namespace import XSD
from owlrl import DatatypeHandling, DeductiveClosure, OWLRL_Semantics
from rules import corrected_temporal_converters, SPELLINGS

folder = Path(__file__).parent
registered = json.loads((folder / 'inputs.json').read_text())


class CaptureScope(unittest.TestCase):
    def refused(self, request):
        result = subprocess.run([sys.executable, str(folder / 'capture.py'), '--corrected'],
                                input=json.dumps(request), text=True, capture_output=True, timeout=30)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Temporal correction requires the complete registered inputs', result.stderr)
        self.assertEqual(result.stdout, '')

    def test_missing_reordered_and_changed_inputs_are_refused(self):
        self.refused({'cases': registered['cases'][:-1]})
        self.refused({'cases': list(reversed(registered['cases']))})
        for change in ('bytes', 'contexts', 'members'):
            request = copy.deepcopy(registered)
            item = request['cases'][0]
            if change == 'bytes':
                item['files']['ro-crate-metadata.json'] += ' '
            elif change == 'contexts':
                item['contexts'] = {'https://example.org/context': {'@context': {}}}
            else:
                request['cases'][0] = dict(reversed(list(item.items())))
            self.refused(request)

    def test_only_exact_spellings_change_and_maps_restore_after_failure(self):
        maps = (rdflib.term.XSDToPython, rdflib.term._toPythonMapping)
        before = [dict(mapping) for mapping in maps]
        with self.assertRaisesRegex(RuntimeError, 'proof interruption'):
            with corrected_temporal_converters():
                for datatype, spellings in SPELLINGS.items():
                    for value in spellings:
                        original = Literal(value, datatype=datatype)
                        self.assertEqual(str(original), value)
                        self.assertTrue(original.ill_typed)
                        self.assertIsNone(original.value)
                    for mapping, saved in zip(maps, before):
                        self.assertEqual(set(mapping), set(saved))
                        for key in saved:
                            if key not in SPELLINGS:
                                self.assertIs(mapping[key], saved[key])
                # OWL's between-case restoration must retain the correction.
                DatatypeHandling.use_RDFLib_lexical_conversions()
                for datatype, spellings in SPELLINGS.items():
                    for value in spellings:
                        with self.assertRaises(ValueError):
                            rdflib.term._toPythonMapping[datatype](value)
                controls = [(XSD.time, '03:04:05'), (XSD.time, '03:04:05.02Z'),
                            (XSD.dateTime, '2025-01-02T03:04:05'),
                            (XSD.dateTime, '2025-01-02T03:04:05+01:00')]
                for datatype, value in controls:
                    self.assertEqual(rdflib.term._toPythonMapping[datatype](value), before[1][datatype](value))
                # Unregistered broader ISO spellings are deliberately delegated.
                self.assertEqual(rdflib.term._toPythonMapping[XSD.time]('030405'), datetime.time(3, 4, 5))
                raise RuntimeError('proof interruption')
        for mapping, saved in zip(maps, before):
            self.assertEqual(mapping, saved)

    def test_original_converter_accepts_the_three_non_xsd_spellings(self):
        self.assertEqual(rdflib.term._toPythonMapping[XSD.time]('03:04:05\x00'), datetime.time(3, 4, 5))
        self.assertEqual(rdflib.term._toPythonMapping[XSD.time]('20250102'), datetime.time(20, 25, 1, 20000))
        self.assertEqual(rdflib.term._toPythonMapping[XSD.dateTime]('2025-01-02T03:04:05\x00'),
                         datetime.datetime(2025, 1, 2, 3, 4, 5))

    def test_completed_closure_retains_the_ordinary_converter_state(self):
        maps = (rdflib.term.XSDToPython, rdflib.term._toPythonMapping)
        before = [dict(mapping) for mapping in maps]
        try:
            DeductiveClosure(OWLRL_Semantics).expand(Graph())
            ordinary = [dict(mapping) for mapping in maps]
            for mapping, saved in zip(maps, before):
                mapping.clear()
                mapping.update(saved)
            with corrected_temporal_converters():
                DeductiveClosure(OWLRL_Semantics).expand(Graph())
            # OWL closure adds its own ordinary converter entries. The correction
            # must preserve that exact state while restoring its two entries.
            for mapping, expected in zip(maps, ordinary):
                self.assertEqual(mapping, expected)
        finally:
            for mapping, saved in zip(maps, before):
                mapping.clear()
                mapping.update(saved)


if __name__ == '__main__':
    unittest.main()
