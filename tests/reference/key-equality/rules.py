"""Apply only the pinned key rule's omitted final-property membership test."""
import contextlib
import hashlib
import inspect
import sys
import textwrap
from importlib.metadata import version
from pathlib import Path

from owlrl import OWLRL_Semantics

PROPERTIES_SHA256 = '8c00f92c204e8a1729d60b7be2d429f2be3524fb9f5f1476afce9133281a05a6'
BEFORE = ('for i in range(0, len(pis) - 1):\n'
          '                                    if (y, pis[i], vals[i]) not in self.graph:')
AFTER = BEFORE.replace('len(pis) - 1', 'len(pis)')


def correction_receipt():
    assert version('owlrl') == '7.1.4'
    source = inspect.getsource(OWLRL_Semantics._properties)
    assert hashlib.sha256(source.encode()).hexdigest() == PROPERTIES_SHA256
    assert source.count(BEFORE) == 1
    return {'owlrl': version('owlrl'), 'properties_sha256': PROPERTIES_SHA256,
            'replacement': {'before': BEFORE, 'after': AFTER},
            'rules_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}


@contextlib.contextmanager
def corrected_key_rule():
    correction_receipt()
    original = OWLRL_Semantics._properties
    namespace = dict(sys.modules[OWLRL_Semantics.__module__].__dict__)
    exec(textwrap.dedent(inspect.getsource(original).replace(BEFORE, AFTER)), namespace)
    OWLRL_Semantics._properties = namespace['_properties']
    try:
        yield
    finally:
        OWLRL_Semantics._properties = original
