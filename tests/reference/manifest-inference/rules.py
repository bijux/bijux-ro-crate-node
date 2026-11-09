"""Bounded pandas counterparts for lexical missingness and warning rendering."""
from __future__ import annotations
import __future__
import base64
from collections import Counter
import contextlib
import hashlib
import inspect
from importlib.metadata import distribution, version
from pathlib import Path
import platform
import sys

import numpy as np
import pandas as pd
from pandas._libs import parsers
from pandas.io.parsers import c_parser_wrapper as wrapper

WRAPPER_SHA256 = '4e9ce2074fc73a3315c5427244ae682913d37fee18d1762acf9cde9b6dfee693'
CONCATENATE_SHA256 = '39b51704f2df78e72aa7d7b787f982cf1cd774cfe63cd4cc03226293e4ab0847'
PARSER_SOURCE_SHA256 = '5a7ef2817a73886def086213aa4aa7ee31318131e8c3f96231436bd065192b4c'
SENTINEL_INPUTS = frozenset({
    '05a6bba923197f759e8eccd18ef152458ebb09aeea25bafada8dbf5f00ba7133',
    'b46acfb2704396e9e380b67ae10785d78cefb31d35609766367151758ebb98f5',
})
WARNING_INPUT = '88f75fd86e946d4da9b5688e17a92a334c9fc9d0b81ddccb0fcb7eb85888eb2d'
BEFORE = 'warning_columns.append(column_names[name])'
AFTER = 'warning_columns.append(column_names[name] if name < len(column_names) else str(name))'
sha256 = lambda value: hashlib.sha256(value).hexdigest()


def installed_integrity():
    """Verify actual installed pandas files against their wheel RECORD entries."""
    assert version('pandas') == '3.0.2'
    assert sys.version_info[:3] == (3, 13, 12)
    package = distribution('pandas')
    paths = [Path(parsers.__file__).resolve(), Path(wrapper.__file__).resolve()]
    rows = []
    for path in paths:
        records = [entry for entry in package.files if Path(package.locate_file(entry)).resolve() == path]
        assert len(records) == 1 and records[0].hash.mode == 'sha256'
        actual = sha256(path.read_bytes())
        recorded = base64.urlsafe_b64decode(records[0].hash.value + '===').hex()
        assert actual == recorded, 'Installed pandas file differs from its wheel RECORD'
        rows.append({'path': str(path), 'sha256': actual, 'record_sha256': recorded})
    assert rows[1]['sha256'] == WRAPPER_SHA256
    source = inspect.getsource(wrapper._concatenate_chunks)
    assert sha256(source.encode()) == CONCATENATE_SHA256
    assert source.count(BEFORE) == 1
    assert str(-2**63) not in parsers.STR_NA_VALUES
    assert parsers.na_values[np.int64] == -2**63
    return {'pandas': version('pandas'), 'numpy': version('numpy'),
            'python': platform.python_version(), 'platform': platform.platform(),
            'machine': platform.machine(), 'files': rows}


def correction_receipt():
    return {'pandas': '3.0.2', 'parser_source_sha256': PARSER_SOURCE_SHA256,
            'wrapper_sha256': WRAPPER_SHA256, 'concatenate_sha256': CONCATENATE_SHA256,
            'sentinel_tsv_sha256': sorted(SENTINEL_INPUTS), 'warning_tsv_sha256': WARNING_INPUT,
            'sentinel_counterpart': {'engine': 'python', 'dtype': {'file_path': 'Int64'},
                                     'promotion': {'file_path': 'float64'}},
            'warning_replacement': {'before': BEFORE, 'after': AFTER},
            'rules_sha256': sha256(Path(__file__).read_bytes())}


@contextlib.contextmanager
def corrected_manifest_reads():
    """Use public nullable parsing or a warning-label repair only for pinned TSVs."""
    integrity = installed_integrity()
    read_csv, concatenate = pd.read_csv, wrapper._concatenate_chunks
    source = inspect.getsource(concatenate)
    namespace = dict(wrapper.__dict__)
    exec(compile(source.replace(BEFORE, AFTER), '<pandas-warning-label>', 'exec',
                 flags=__future__.annotations.compiler_flag), namespace)
    patched = namespace['_concatenate_chunks']
    applied = []

    def read(source, *args, **kwargs):
        path = Path(source)
        digest = sha256(path.read_bytes())
        if digest not in SENTINEL_INPUTS and digest != WARNING_INPUT:
            return read_csv(source, *args, **kwargs)
        assert not args and kwargs == {'delimiter': '\t'}, 'Pinned manifest read options changed'
        applied.append(digest)
        if digest in SENTINEL_INPUTS:
            result = read_csv(source, delimiter='\t', engine='python', dtype={'file_path': 'Int64'})
            # Nullable lexical parsing retains a genuine signed minimum. This
            # promotion uses pandas itself and matches the default float dtype.
            result['file_path'] = result['file_path'].astype('float64')
            return result
        assert wrapper._concatenate_chunks is concatenate
        wrapper._concatenate_chunks = patched
        try:
            return read_csv(source, *args, **kwargs)
        finally:
            wrapper._concatenate_chunks = concatenate

    pd.read_csv = read
    trace = {'before': integrity, 'applied_tsv_sha256': applied}
    try:
        yield trace
        assert Counter(applied) == Counter([*SENTINEL_INPUTS, WARNING_INPUT]), 'Correction targets changed'
    finally:
        pd.read_csv = read_csv
        wrapper._concatenate_chunks = concatenate
        assert installed_integrity() == integrity, 'Correction changed installed pandas files'
