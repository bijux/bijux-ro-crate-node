"""Ground member-pair contradictions from OWL 2 RL eq-diff and prp-adp."""
import json, hashlib, inspect
from rdflib import Graph, Namespace, RDF, OWL
from owlrl import DeductiveClosure, OWLRL_Semantics
EX = Namespace('urn:')
rows = []
for length, conflict in [(2, [0, 1]), (3, [0, 1]), (3, [1, 2]), (3, [0, 2]), (2, [])]:
    g = Graph()
    members = [EX['p' + str(i)] for i in range(length)]
    triples = [(EX.axiom, RDF.type, OWL.AllDisjointProperties), (EX.axiom, OWL.members, EX.cell0)]
    for i, p in enumerate(members):
        triples += [(EX['cell' + str(i)], RDF.first, p), (EX['cell' + str(i)], RDF.rest, EX['cell' + str(i + 1)] if i + 1 < length else RDF.nil)]
    triples += [(EX.a, members[i], EX.b) for i in conflict]
    for t in triples:
        g.add(t)
    normative = any(((EX.a, members[i], EX.b) in g and (EX.a, members[j], EX.b) in g for i in range(length) for j in range(i + 1, length)))
    sem = OWLRL_Semantics(g, False, False)
    sem.closure()
    rows.append({'kind': 'AllDisjointProperties', 'members': length, 'conflict': conflict, 'normative_contradiction': normative, 'original_errors': list(sem.error_messages), 'triples': [[str(t) for t in q] for q in triples]})
for members in [[EX.a, EX.a], [EX.a, EX.b, EX.b], [EX.a, EX.b, EX.c]]:
    g = Graph()
    g.add((EX.axiom, RDF.type, OWL.AllDifferent))
    g.add((EX.axiom, OWL.members, EX.cell0))
    for i, member in enumerate(members):
        g.add((EX['cell' + str(i)], RDF.first, member))
        g.add((EX['cell' + str(i)], RDF.rest, EX['cell' + str(i + 1)] if i + 1 < len(members) else RDF.nil))
    normative = any((members[i] == members[j] for i in range(len(members)) for j in range(i + 1, len(members))))
    sem = OWLRL_Semantics(g, False, False)
    sem.closure()
    assert all(((x, OWL.sameAs, x) in g for x in members))
    rows.append({'kind': 'AllDifferent', 'members': [str(x) for x in members], 'normative_contradiction': normative, 'original_errors': list(sem.error_messages)})
assert sum((x['normative_contradiction'] and (not x['original_errors']) for x in rows)) == 5
print(json.dumps({'functions': {name: hashlib.sha256(inspect.getsource(fn).encode()).hexdigest() for name, fn in [('_properties', OWLRL_Semantics._properties), ('_equality', OWLRL_Semantics._equality)]}, 'cases': rows}, indent=2))
