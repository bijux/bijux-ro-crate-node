"""Reject only three proven non-XSD spellings before RDFLib normalization."""
import contextlib
import datetime
import hashlib
import inspect
from importlib.metadata import version
from pathlib import Path

import rdflib.term
import rdflib.xsd_datetime
from owlrl import DatatypeHandling
from rdflib.namespace import XSD

SPELLINGS = {XSD.time: frozenset({'03:04:05\x00', '20250102'}),
             XSD.dateTime: frozenset({'2025-01-02T03:04:05\x00'})}
MODULE_SHA256 = '88f5fe16466721f72618e981001a33d3108e574ac3301606da33bcaf8fa80555'
TERM_SHA256 = '564280e97c4e64b5b704bd1fff96ebc374ebd2dcc2df134cda62452a3f83c1db'
RESTORE_SHA256 = 'bdece9cca3a16b4f9d09dce90584eaf2679e970132b96c747998546ca2e2d62b'


def correction_receipt():
    assert version('rdflib') == '7.6.0' and version('owlrl') == '7.1.4'
    assert hashlib.sha256(Path(rdflib.xsd_datetime.__file__).read_bytes()).hexdigest() == MODULE_SHA256
    assert hashlib.sha256(Path(rdflib.term.__file__).read_bytes()).hexdigest() == TERM_SHA256
    assert hashlib.sha256(inspect.getsource(DatatypeHandling.use_RDFLib_lexical_conversions).encode()).hexdigest() == RESTORE_SHA256
    for datatype, owner in [(XSD.time, datetime.time), (XSD.dateTime, datetime.datetime)]:
        for mapping in (rdflib.term.XSDToPython, rdflib.term._toPythonMapping):
            converter = mapping[datatype]
            assert converter.__self__ is owner and converter.__name__ == 'fromisoformat'
    return {'rdflib': version('rdflib'), 'owlrl': version('owlrl'),
            'xsd_datetime_sha256': MODULE_SHA256, 'term_sha256': TERM_SHA256,
            'owlrl_restore_sha256': RESTORE_SHA256,
            'spellings': {str(datatype): sorted(values) for datatype, values in SPELLINGS.items()},
            'rules_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}


@contextlib.contextmanager
def corrected_temporal_converters():
    correction_receipt()
    mappings = (rdflib.term.XSDToPython, rdflib.term._toPythonMapping)
    originals = [(mapping, {datatype: mapping[datatype] for datatype in SPELLINGS}) for mapping in mappings]
    try:
        # OWL closure restores converters from XSDToPython between validations.
        # Both maps must carry the same narrow correction for every case.
        for mapping, saved in originals:
            for datatype, spellings in SPELLINGS.items():
                original = saved[datatype]
                def convert(value, original=original, spellings=spellings):
                    if value in spellings:
                        raise ValueError('Invalid XML Schema temporal spelling')
                    return original(value)
                mapping[datatype] = convert
        yield
    finally:
        for mapping, saved in originals:
            mapping.update(saved)
