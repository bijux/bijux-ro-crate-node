"""Check capture completeness and filesystem confinement independently of JavaScript."""
from pathlib import Path
import unittest
from oracle import case_path, exception_tree, completion_status, run_case
import hashlib
from bia_ro_crate.core.validation.validation_error import ValidationError
from bia_ro_crate.core.validation.severity import Severity


class OracleCapture(unittest.TestCase):
    def test_capture_records_actual_parser_input_bytes(self):
        result = run_case({'name': 'malformed UTF-8 metadata', 'files': {'ro-crate-metadata.json': [255]}})
        self.assertEqual(result['status'], 'incomplete')
        self.assertEqual(result['inputs_sha256'], {'ro-crate-metadata.json': hashlib.sha256(bytes([255])).hexdigest()})

    def test_only_exact_parser_rejection_is_invalid(self):
        issues = [ValidationError(message='broken', severity=Severity.ERROR),
                  ValidationError(message='broken', severity=Severity.ERROR)]
        error = ExceptionGroup('Validation failed.', [issue.to_exception() for issue in issues])
        self.assertEqual(completion_status(error, issues), 'invalid')
        self.assertEqual(completion_status(None, []), 'valid')

    def test_unrelated_or_mixed_groups_do_not_become_completed_rejection(self):
        issues = [ValidationError(message='broken', severity=Severity.ERROR)]
        failures = [ExceptionGroup('unrelated', [Exception('broken')]),
                    ExceptionGroup('Validation failed.', [ValueError('broken')]),
                    ExceptionGroup('Validation failed.', [Exception('different')]),
                    ExceptionGroup('Validation failed.', [Exception('broken'), OSError('read failed')]),
                    ExceptionGroup('Validation failed.', [ExceptionGroup('nested', [Exception('broken')])])]
        for error in failures:
            with self.subTest(error=repr(error)):
                self.assertEqual(completion_status(error, issues), 'incomplete')

    def test_rejection_signature_preserves_multiplicity(self):
        issues = [ValidationError(message='broken', severity=Severity.ERROR)] * 2
        error = ExceptionGroup('Validation failed.', [Exception('broken')])
        self.assertEqual(completion_status(error, issues), 'incomplete')
        self.assertEqual(completion_status(None, issues), 'incomplete')

    def test_nested_exception_groups_retain_every_child(self):
        failure = ExceptionGroup('outer', [ExceptionGroup('inner', [ValueError('broken')])])
        tree = exception_tree(failure)
        self.assertEqual(tree['children'][0]['children'][0], {'type': 'ValueError', 'message': 'broken'})

    def test_case_files_cannot_escape_the_isolated_crate(self):
        root = Path(__file__).parents[2] / 'artifacts/work/isolated-crate'
        for name in ['', '.', '../outside', '/outside', 'a/../../outside', 'a\\outside']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                case_path(root, name)
        self.assertEqual(case_path(root, 'manifests/list.tsv'), root/'manifests/list.tsv')


if __name__ == '__main__':
    unittest.main()
