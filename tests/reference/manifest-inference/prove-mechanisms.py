"""Prove the scoped counterparts preserve every unaffected pandas value."""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import platform
import warnings
import numpy as np
import pandas as pd
from rules import corrected_manifest_reads, correction_receipt, installed_integrity

folder = Path(__file__).parent
root = folder.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--workdir', required=True, type=Path)
parser.add_argument('--details-output', required=True, type=Path)
args = parser.parse_args()
workdir = args.workdir.resolve()
details_path = args.details_output.resolve()
assert workdir.is_relative_to(root / 'artifacts') and details_path.is_relative_to(root / 'artifacts')
workdir.mkdir(parents=True, exist_ok=True)
request_bytes = (folder / 'inputs.json').read_bytes()
cases = json.loads(request_bytes)['cases']
assert len(cases) == 9
original_read = pd.read_csv


def cell(value):
    if pd.isna(value):
        return ['missing']
    if isinstance(value, (float, np.floating)):
        return ['float', float(value).hex()]
    if isinstance(value, (int, np.integer)):
        return ['integer', str(value)]
    return [type(value).__name__, str(value)]


def array(value):
    return {'dtype': str(value.dtype), 'values': [cell(v) for v in value]}


def frame(value):
    index = value.index
    keys = [[cell(v) for v in key] for key in index] if isinstance(index, pd.MultiIndex) else [cell(v) for v in index]
    return {'columns': list(value.columns), 'index_names': list(index.names), 'index': keys,
            'columns_data': [array(value[name]) for name in value.columns]}


minimum_names = {'manifest-inference/minimum-with-missing', 'manifest-inference/padded-minimum-with-missing'}
warning_name = 'manifest-inference/implicit-index-mixed-chunks'
changes, unchanged, details = [], [], []
source_integrity = installed_integrity()
with corrected_manifest_reads() as trace:
    for item in cases:
        text = item['files']['file_list.tsv']
        path = workdir / (item['name'].rsplit('/', 1)[-1] + '.tsv')
        path.write_bytes(text.encode())
        partial = None
        try:
            before = original_read(path, delimiter='\t')
        except IndexError as error:
            assert item['name'] == warning_name
            tb = error.__traceback__
            while tb and tb.tb_frame.f_code.co_name != '_concatenate_chunks':
                tb = tb.tb_next
            assert tb is not None
            values = tb.tb_frame.f_locals
            assert values['name'] == 2046 and values['column_names'] == ['file_path', 'dataset']
            partial = {key: array(value) for key, value in values['result'].items()}
            assert set(partial) == set(range(2047))
        with warnings.catch_warnings(record=True) as messages:
            warnings.simplefilter('always')
            after = pd.read_csv(path, delimiter='\t')
        if item['name'] in minimum_names:
            pd.testing.assert_index_equal(before.index, after.index, exact=True)
            pd.testing.assert_index_equal(before.columns, after.columns, exact=True)
            left, right = frame(before), frame(after)
            assert left['columns'] == right['columns'] == ['file_path', 'dataset']
            assert left['index_names'] == right['index_names']
            assert left['index'] == right['index']
            assert [column['dtype'] for column in left['columns_data']] == ['float64', 'float64']
            assert [column['dtype'] for column in right['columns_data']] == ['float64', 'float64']
            differences = [(column, row, a, b)
                           for column, (a_col, b_col) in enumerate(zip(left['columns_data'], right['columns_data']))
                           for row, (a, b) in enumerate(zip(a_col['values'], b_col['values'])) if a != b]
            assert differences == [(0, 0, ['missing'], ['float', float(-2**63).hex()])]
            independent = original_read(path, delimiter='\t', dtype={'file_path': 'Int64'})
            assert independent['file_path'].iloc[0] == -2**63
            independent['file_path'] = independent['file_path'].astype('float64')
            assert frame(independent) == right
            changes.append({'name': item['name'], 'restored_row': 0, 'restored_column': 'file_path',
                            'restored_hex': float(-2**63).hex(), 'other_fields_unchanged': True})
            bare = original_read(path, delimiter='\t', engine='python')['file_path'].iloc[0]
            details.append({'name': item['name'], 'bare_python_engine_hex': float(bare).hex(),
                            'exact_minimum_hex': float(-2**63).hex(), 'corrected': right})
        elif item['name'] == warning_name:
            assert partial is not None
            assert len(after) == 258 and after.index.nlevels == 2046
            physical = [array(after.index.get_level_values(i)) for i in range(2046)]
            physical += [array(after[name]) for name in ['file_path', 'dataset']]
            assert all(partial[i] == physical[i] for i in partial)
            header = '\t'.join([f'index-{i}' for i in range(2046)] + ['file_path', 'dataset']) + '\n'
            with warnings.catch_warnings(record=True):
                full = original_read(io.StringIO(header + text.split('\n', 1)[1]), delimiter='\t')
            assert physical == [array(full[name]) for name in full.columns]
            independent_index = pd.MultiIndex.from_arrays(
                [full[name] for name in full.columns[:2046]], names=[None] * 2046)
            pd.testing.assert_index_equal(after.index, independent_index, exact=True)
            pd.testing.assert_index_equal(after.columns, full.columns[-2:], exact=True)
            assert len(messages) == 1 and isinstance(messages[0].message, pd.errors.DtypeWarning)
            assert after['file_path'].dtype == object
            assert isinstance(after['file_path'].iloc[0], int) and after['file_path'].iloc[-1] == 'tail-b'
            warning = {'name': item['name'], 'original_exception': 'IndexError',
                       'physical_column': 2046, 'headers': 2, 'rows': 258, 'physical_columns': 2048,
                       'index_levels': 2046, 'already_computed_columns_unchanged': 2047,
                       'all_columns_match_independent_full_header_control': True,
                       'warning_type': type(messages[0].message).__name__, 'warning_text': str(messages[0].message)}
        else:
            pd.testing.assert_frame_equal(before, after, check_exact=True,
                                          check_index_type=True, check_column_type=True)
            assert frame(before) == frame(after)
            assert not messages
            unchanged.append(item['name'])
        assert path.read_bytes() == text.encode()
assert installed_integrity() == source_integrity
assert len(changes) == 2 and len(unchanged) == 6
# Missingness is lexical. The signed minimum is not one of pandas' NA spellings.
from pandas._libs import parsers
assert str(-2**63) not in parsers.STR_NA_VALUES
controls = []
minimum = cases[0]['files']['file_list.tsv']
for options in [{'dtype': str}, {'na_filter': False}]:
    result = original_read(io.StringIO(minimum), delimiter='\t', **options)
    assert not pd.isna(result['file_path'].iloc[0])
    assert int(result['file_path'].iloc[0]) == -2**63
    controls.append({key: str(value) for key, value in options.items()})
report = {'pandas': '3.0.2', 'inputs_sha256': hashlib.sha256(request_bytes).hexdigest(),
          'proof_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'correction': correction_receipt(), 'minimum_is_lexical_na': False,
          'minimum_changes': changes, 'unchanged_controls': unchanged,
          'public_option_controls': controls, 'warning': warning}
details_path.parent.mkdir(parents=True, exist_ok=True)
details_path.write_text(json.dumps({'platform': platform.platform(), 'machine': platform.machine(),
                                    'integrity': source_integrity, 'observations': details}, indent=2) + '\n')
print(json.dumps(report, indent=2))
