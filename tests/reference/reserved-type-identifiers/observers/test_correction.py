"""Reject unregistered input or role changes and restore both reference seams."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from rdflib import Graph
from rocrate_validator.models import ValidationContext
import bia_ro_crate.core.parser.jsonld_metadata_parser as metadata
import corrected

request = json.loads((Path(__file__).parent / 'inputs.json').read_bytes())

def run_case(case):
    return case

class ReservedTypeCorrectionTests(unittest.TestCase):
    def test_scope(self):
        corrected.registered_request(request)
        changes = [lambda x: x['cases'].pop(), lambda x: x['cases'].reverse(),
            lambda x: x['cases'][0].update(name='unknown'),
            lambda x: x['cases'][0]['files'].update(extra='new'),
            lambda x: x['cases'][0]['files'].update({'ro-crate-metadata.json': x['cases'][0]['files']['ro-crate-metadata.json'] + ' '}),
            lambda x: x['cases'][0].update(contexts={'https://example.org/extra': {'@context': {}}})]
        for change in changes:
            changed = copy.deepcopy(request)
            change(changed)
            with self.assertRaises(AssertionError):
                corrected.registered_request(changed)

    def test_restoration_on_failure_and_wrong_role(self):
        original_graph = metadata.Graph
        original_parse = Graph.parse
        original_profile = ValidationContext.__load_data_graph__
        original_run = globals()['run_case']
        oracle = {'run_case': original_run}
        with self.assertRaisesRegex(RuntimeError, 'bounded failure'):
            with corrected.reserved_type_graphs(oracle, request):
                self.assertIs(Graph.parse, original_parse)
                with self.assertRaisesRegex(AssertionError, 'Wrong metadata graph role'):
                    metadata.Graph().parse('unused')
                raise RuntimeError('bounded failure')
        self.assertIs(metadata.Graph, original_graph)
        self.assertIs(Graph.parse, original_parse)
        self.assertIs(ValidationContext.__load_data_graph__, original_profile)
        self.assertIs(globals()['run_case'], original_run)

    def test_missing_required_roles_and_source_pin(self):
        original_graph = metadata.Graph
        original_profile = ValidationContext.__load_data_graph__
        original_run = globals()['run_case']
        with self.assertRaises(AssertionError):
            with corrected.reserved_type_graphs({'run_case': original_run}, request):
                pass
        self.assertIs(metadata.Graph, original_graph)
        self.assertIs(ValidationContext.__load_data_graph__, original_profile)
        with patch.object(corrected, 'source_identity', return_value={}):
            with self.assertRaisesRegex(AssertionError, 'Pinned parser'):
                with corrected.reserved_type_graphs({'run_case': original_run}, request):
                    pass

if __name__ == '__main__':
    unittest.main()
