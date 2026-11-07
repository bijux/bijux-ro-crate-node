"""Check capture completeness and filesystem confinement independently of JavaScript."""
from pathlib import Path
import unittest
from oracle import case_path, exception_tree


class OracleCapture(unittest.TestCase):
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
