"""Qualify opt-in provenance without changing pinned closure behavior."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from rdflib import Graph, BNode, Literal, URIRef
from rdflib.namespace import RDF, OWL
from owlrl.Closure import Core
from owlrl.OWLRL import OWLRL_Semantics
from error_nodes import ERROR, observe_error_nodes
from oracle import run_case


class ErrorNodeObservation(unittest.TestCase):
    def test_preexisting_error_nodes_are_never_receipted(self):
        graph = Graph()
        old = BNode('owl-error-0')
        graph.add((old, RDF.type, ERROR.ErrorMessage))
        graph.add((old, ERROR.error, Literal('user supplied')))
        prop, subject = URIRef('urn:property'), URIRef('urn:subject')
        graph.add((prop, RDF.type, OWL.IrreflexiveProperty))
        graph.add((subject, prop, subject))
        before = set(graph)
        receipts = []
        original = Core.closure
        with observe_error_nodes(Path('/crate'), receipts) as failures:
            closure = OWLRL_Semantics(graph, False, False)
            closure.closure()
        self.assertIs(Core.closure, original)
        self.assertFalse(failures)
        self.assertEqual(len(receipts), 1)
        self.assertNotEqual(receipts[0]['node'], str(old))
        self.assertEqual(receipts[0]['comparison_node'], 'owl-error--0')
        self.assertEqual(receipts[0]['message'], 'Irreflexive property used on urn:subject with urn:property')
        self.assertTrue(before <= set(graph))
        self.assertEqual(set(graph.predicate_objects(BNode(receipts[0]['node']))),
                         {(RDF.type, ERROR.ErrorMessage), (ERROR.error, Literal(receipts[0]['message']))})

    def test_original_exception_is_preserved_and_wrapper_is_restored(self):
        failure = RuntimeError('original closure failure')
        def broken(_self):
            raise failure
        with patch.object(Core, 'closure', broken):
            with self.assertRaises(RuntimeError) as caught:
                with observe_error_nodes(Path('/crate'), []):
                    OWLRL_Semantics(Graph(), False, False).closure()
            self.assertIs(caught.exception, failure)
            self.assertIs(Core.closure, broken)

    def test_opt_in_observer_preserves_whole_parser_status_and_findings(self):
        cases = json.loads((Path(__file__).parent / 'inputs/profile-inconsistency-nodes.json').read_text())['cases']
        original = Core.closure
        for case in cases:
            if case['name'] not in {'owl-inconsistency-error-node', 'owl-inconsistency-nonreflexive-control'}:
                continue
            with self.subTest(name=case['name']):
                observed = run_case(case)
                plain = run_case({**case, 'observe_error_nodes': False})
                self.assertIs(Core.closure, original)
                self.assertNotIn('generated_error_nodes', plain)
                self.assertEqual(observed['status'], plain['status'])
                self.assertEqual(observed['inputs_sha256'], plain['inputs_sha256'])
                self.assertEqual(observed['error_mode_exit_code'], plain['error_mode_exit_code'])
                self.assertEqual(observed['report']['highest_error_level'], plain['report']['highest_error_level'])
                for level, issues in observed['report']['issues'].items():
                    other = plain['report']['issues'][level]
                    self.assertEqual(len(issues), len(other))
                    self.assertEqual(sorted((i['message'], i['severity']) for i in issues),
                                     sorted((i['message'], i['severity']) for i in other))
                    if level == 'ERROR' and case['name'] == 'owl-inconsistency-error-node':
                        self.assertEqual(len(issues), 1)
                        self.assertEqual(issues[0]['location_description'], 'At ro-crate object with @id: ' + observed['generated_error_nodes'][0]['node'])
                        self.assertRegex(other[0]['location_description'], r'^At ro-crate object with @id: N[0-9a-f]{32}$')
                    else:
                        self.assertEqual([i['location_description'] for i in issues], [i['location_description'] for i in other])


if __name__ == '__main__':
    unittest.main()
