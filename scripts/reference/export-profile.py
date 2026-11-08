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

ontology = Graph()
ontology.parse(profile / 'ontology.ttl', publicID='file:///crate/')
rows = sorted(([term(s), term(p), term(o)] for s,p,o in to_canonical_graph(ontology)), key=lambda r:json.dumps(r))
path.with_name('ontology.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1) + '\n')

# Datatype recognition and subsumption are implementation behavior of locked owlrl.
from owlrl.XsdDatatypes import OWL_RL_Datatypes, OWL_Datatype_Subsumptions
from owlrl.AxiomaticTriples import OWLRL_Datatypes_Disjointness
assert version('owlrl') == '7.1.4'
datatypes = {
    'owlrl': version('owlrl'),
    'recognized': sorted(map(str, OWL_RL_Datatypes)),
    'disjointness': sorted([list(map(str, triple)) for triple in OWLRL_Datatypes_Disjointness]),
    'subsumptions': {str(key): sorted(map(str, values))
                     for key, values in sorted(OWL_Datatype_Subsumptions.items())},
}
path.with_name('inference').joinpath('datatypes.json').write_text(json.dumps(datatypes, indent=2) + '\n')

from owlrl.OWLRL import OWLRL_Annotation_properties
from rdflib.namespace import OWL, RDF
axioms = [(OWL.Thing, RDF.type, OWL.Class), (OWL.Nothing, RDF.type, OWL.Class)]
axioms.extend((predicate, RDF.type, OWL.AnnotationProperty)
              for predicate in OWLRL_Annotation_properties)
path.with_name('inference').joinpath('axioms.json').write_text(json.dumps({
    'owlrl': version('owlrl'), 'triples': sorted([list(map(str, row)) for row in axioms]),
}, indent=2) + '\n')
