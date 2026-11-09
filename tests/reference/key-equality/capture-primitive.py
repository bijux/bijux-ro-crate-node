"""Retain the original key query and independently capture its corrected closure."""
import hashlib
import json
import sys
from importlib.metadata import version
from pathlib import Path
from rdflib import BNode, Graph, Literal, URIRef
from owlrl import DeductiveClosure, OWLRL_Semantics
from rules import corrected_key_rule, correction_receipt

assert version('rdflib') == '7.6.0'
assert sys.version_info[:3] == (3, 13, 12)
folder = Path(__file__).parent
oracle_path = folder.parents[1] / 'parity/expected/profile-inference.json'
oracle = json.loads(oracle_path.read_text())
name = 'pinned key equality includes its final-key quirk'
selected = [case for case in oracle['cases'] if case['name'] == name]
assert len(selected) == 1
original = selected[0]
assert original['queries'] == [{'triple': ['ex:a', 'owl:sameAs', 'ex:b'], 'present': True}]


def term(value):
    if isinstance(value, list):
        return Literal(value[0], datatype=term(value[1]) if value[1] else None,
                       lang=value[2] if len(value) > 2 else None)
    prefix, local = value.split(':', 1)
    return BNode(local) if prefix == '_' else URIRef(oracle['prefixes'][prefix] + local)


def capture():
    graph = Graph()
    for row in original['triples']:
        graph.add(tuple(map(term, row)))
    DeductiveClosure(OWLRL_Semantics).expand(graph)
    return {**original, 'queries': [{'triple': query['triple'],
                                   'present': tuple(map(term, query['triple'])) in graph}
                                  for query in original['queries']]}


assert capture() == original
receipt = correction_receipt()
with corrected_key_rule():
    corrected = capture()
assert capture() == original, 'Corrected capture must restore the original closure'
assert corrected['queries'] == [{'triple': ['ex:a', 'owl:sameAs', 'ex:b'], 'present': False}]
print(json.dumps({'prefixes': oracle['prefixes'], 'original': original, 'corrected': corrected,
                  'key_correction': receipt, 'python': '.'.join(map(str, sys.version_info[:3])),
                  'rdflib': version('rdflib'),
                  'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}, indent=2))
