"""Export SHACL Core constraints from the installed, pinned roc-validator wheel."""
from importlib.metadata import version
import json
from pathlib import Path

from rdflib import BNode, Graph, Literal, URIRef
from rdflib.compare import to_canonical_graph
from rdflib.namespace import SH
import rocrate_validator

assert version("roc-validator") == "0.8.1"
profile = Path(rocrate_validator.__file__).parent / "profiles/ro-crate"
graph = Graph()
for path in sorted((profile / "must").glob("*.ttl")):
    graph.parse(path, publicID="file:///crate/")
# Variable SPARQL targets and TripleRules are materialized by the pinned JS profile.
# Keep core targets and every property constraint, including non-standard predicates.
for predicate in [SH.target, SH.rule, SH.description, SH.select, SH.prefixes]:
    graph.remove((None, predicate, None))

def term(t):
    if isinstance(t, URIRef):
        return str(t)
    if isinstance(t, BNode):
        return "_:shape-" + str(t)
    if isinstance(t, Literal):
        return [str(t), str(t.datatype) if t.datatype else None, t.language]
    raise TypeError(t)

rows = sorted(([term(s), term(p), term(o)] for s,p,o in to_canonical_graph(graph)), key=lambda r:json.dumps(r))
path = Path(__file__).resolve().parents[2] / "packages/validator/src/profile/shapes.json"
path.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n")
