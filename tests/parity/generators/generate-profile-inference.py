"""Capture profile-relevant entailment queries independently with pinned owlrl."""
from importlib.metadata import version
import json
from pathlib import Path
from rdflib import Graph, Literal, Namespace, URIRef
from owlrl import DeductiveClosure, OWLRL_Semantics

assert version('owlrl') == '7.1.4'
PREFIXES = {
    'ex': 'https://example.org/',
    'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
    'owl': 'http://www.w3.org/2002/07/owl#',
    'xsd': 'http://www.w3.org/2001/XMLSchema#',
}


def term(value):
    if isinstance(value, list):
        return Literal(value[0], datatype=term(value[1]) if value[1] else None,
                       lang=value[2] if len(value) > 2 else None)
    prefix, local = value.split(':', 1)
    return URIRef(PREFIXES[prefix] + local)


cases = []


def record(name, triples, queries):
    graph = Graph()
    for row in triples:
        graph.add(tuple(map(term, row)))
    DeductiveClosure(OWLRL_Semantics).expand(graph)
    cases.append(dict(name=name, triples=triples,
                      queries=[dict(triple=q, present=tuple(map(term, q)) in graph) for q in queries]))


record('subclass cycles and transitive membership', [
    ['ex:a', 'rdf:type', 'ex:C'], ['ex:C', 'rdfs:subClassOf', 'ex:D'],
    ['ex:D', 'rdfs:subClassOf', 'ex:C'], ['ex:D', 'rdfs:subClassOf', 'ex:E'],
], [['ex:a', 'rdf:type', 'ex:E'], ['ex:a', 'rdf:type', 'ex:Unrelated']])
record('equivalent classes', [
    ['ex:a', 'rdf:type', 'ex:C'], ['ex:C', 'owl:equivalentClass', 'ex:D'],
    ['ex:b', 'rdf:type', 'ex:D'],
], [['ex:a', 'rdf:type', 'ex:D'], ['ex:b', 'rdf:type', 'ex:C']])
for characteristic in ['SymmetricProperty', 'TransitiveProperty', 'FunctionalProperty', 'InverseFunctionalProperty']:
    triples = [['ex:p', 'rdf:type', 'owl:' + characteristic], ['ex:a', 'ex:p', 'ex:b']]
    if characteristic == 'TransitiveProperty':
        triples.append(['ex:b', 'ex:p', 'ex:c'])
    elif characteristic == 'FunctionalProperty':
        triples.append(['ex:a', 'ex:p', 'ex:c'])
    elif characteristic == 'InverseFunctionalProperty':
        triples.append(['ex:c', 'ex:p', 'ex:b'])
    record(characteristic, triples, [
        ['ex:b', 'ex:p', 'ex:a'], ['ex:a', 'ex:p', 'ex:c'],
        ['ex:b', 'owl:sameAs', 'ex:c'], ['ex:a', 'owl:sameAs', 'ex:c'],
    ])
record('identity substitutes subjects predicates and objects', [
    ['ex:a', 'owl:sameAs', 'ex:b'], ['ex:a', 'ex:p', 'ex:c'],
    ['ex:c', 'ex:a', 'ex:d'], ['ex:d', 'ex:p', 'ex:a'],
], [['ex:b', 'ex:p', 'ex:c'], ['ex:c', 'ex:b', 'ex:d'], ['ex:d', 'ex:p', 'ex:b']])
record('property domain and class restriction cooperate', [
    ['ex:a', 'ex:p', 'ex:b'], ['ex:p', 'rdfs:domain', 'ex:C'],
    ['ex:C', 'owl:onProperty', 'ex:q'], ['ex:C', 'owl:hasValue', 'ex:d'],
    ['ex:q', 'rdfs:range', 'ex:D'],
], [['ex:a', 'ex:q', 'ex:d'], ['ex:d', 'rdf:type', 'ex:D'], ['ex:b', 'rdf:type', 'ex:D']])
for construct in ['intersectionOf', 'unionOf', 'oneOf']:
    triples = [
        ['ex:C', 'owl:' + construct, 'ex:head'],
        ['ex:head', 'rdf:first', 'ex:D'], ['ex:head', 'rdf:rest', 'ex:tail'],
        ['ex:tail', 'rdf:first', 'ex:E'], ['ex:tail', 'rdf:rest', 'rdf:nil'],
        ['ex:a', 'rdf:type', 'ex:D'], ['ex:a', 'rdf:type', 'ex:E'],
        ['ex:b', 'rdf:type', 'ex:C'], ['ex:c', 'rdf:type', 'ex:D'],
    ]
    record(construct, triples, [
        ['ex:a', 'rdf:type', 'ex:C'], ['ex:b', 'rdf:type', 'ex:D'],
        ['ex:c', 'rdf:type', 'ex:C'], ['ex:D', 'rdf:type', 'ex:C'], ['ex:E', 'rdf:type', 'ex:C'],
    ])
for construct in ['someValuesFrom', 'allValuesFrom', 'hasValue']:
    record(construct, [
        ['ex:C', 'owl:onProperty', 'ex:p'], ['ex:C', 'owl:' + construct, 'ex:D'],
        ['ex:a', 'ex:p', 'ex:b'], ['ex:b', 'rdf:type', 'ex:D'],
        ['ex:c', 'rdf:type', 'ex:C'], ['ex:c', 'ex:p', 'ex:d'],
        ['ex:e', 'ex:p', 'ex:D'],
    ], [['ex:a', 'rdf:type', 'ex:C'], ['ex:d', 'rdf:type', 'ex:D'],
        ['ex:c', 'ex:p', 'ex:D'], ['ex:e', 'rdf:type', 'ex:C']])
record('someValuesFrom Thing does not require an object type', [
    ['ex:C', 'owl:onProperty', 'ex:p'], ['ex:C', 'owl:someValuesFrom', 'owl:Thing'],
    ['ex:a', 'ex:p', 'ex:b'],
], [['ex:a', 'rdf:type', 'ex:C'], ['ex:b', 'rdf:type', 'ex:C']])
for cardinality in ['maxCardinality', 'maxQualifiedCardinality']:
    record(cardinality, [
        ['ex:C', 'owl:onProperty', 'ex:p'], ['ex:C', 'owl:' + cardinality, ['1', 'xsd:nonNegativeInteger']],
        ['ex:C', 'owl:onClass', 'ex:D'], ['ex:a', 'rdf:type', 'ex:C'],
        ['ex:a', 'ex:p', 'ex:b'], ['ex:a', 'ex:p', 'ex:c'], ['ex:a', 'ex:p', 'ex:d'],
        ['ex:b', 'rdf:type', 'ex:D'], ['ex:c', 'rdf:type', 'ex:D'],
    ], [['ex:b', 'owl:sameAs', 'ex:c'], ['ex:b', 'owl:sameAs', 'ex:d']])
record('pinned key equality includes its final-key quirk', [
    ['ex:C', 'owl:hasKey', 'ex:head'], ['ex:head', 'rdf:first', 'ex:p'], ['ex:head', 'rdf:rest', 'rdf:nil'],
    ['ex:a', 'rdf:type', 'ex:C'], ['ex:b', 'rdf:type', 'ex:C'], ['ex:a', 'ex:p', 'ex:key'],
], [['ex:a', 'owl:sameAs', 'ex:b']])

record('declared classes retain Thing membership', [
    ['ex:C', 'rdf:type', 'owl:Class'], ['ex:a', 'rdf:type', 'ex:C'],
], [['ex:a', 'rdf:type', 'owl:Thing'], ['ex:C', 'rdfs:subClassOf', 'owl:Thing']])
for restriction in ['hasValue', 'someValuesFrom', 'allValuesFrom']:
    record('schema restriction inheritance ' + restriction, [
        ['ex:C', 'owl:onProperty', 'ex:p'], ['ex:D', 'owl:onProperty', 'ex:q'],
        ['ex:p', 'rdfs:subPropertyOf', 'ex:q'], ['ex:C', 'owl:' + restriction, 'ex:E'],
        ['ex:D', 'owl:' + restriction, 'ex:E'],
    ], [['ex:C', 'rdfs:subClassOf', 'ex:D'], ['ex:D', 'rdfs:subClassOf', 'ex:C']])


for literal, requested in [
    (['value', 'xsd:string'], 'xsd:string'), (['1', 'xsd:integer'], 'xsd:integer'),
    (['1.5', 'xsd:decimal'], 'xsd:decimal'), (['2024-01-01T00:00:00Z', 'xsd:dateTime'], 'xsd:dateTime'),
    (['1', 'xsd:int'], 'xsd:integer'), (['1', 'xsd:integer'], 'xsd:decimal'),
    (['value', None], 'xsd:string'), (['value', None, 'en'], 'rdf:langString'),
    (['P1D', 'xsd:duration'], 'xsd:duration'), (['value', 'ex:Unknown'], 'ex:Unknown'),
]:
    record(f'datatype restriction {literal!r} as {requested}', [
        ['ex:C', 'owl:onProperty', 'ex:p'], ['ex:C', 'owl:someValuesFrom', requested],
        ['ex:a', 'ex:p', literal],
    ], [['ex:a', 'rdf:type', 'ex:C'], [literal, 'rdf:type', requested]])
record('datatype membership cooperates with user subclass rules', [
    ['ex:a', 'ex:p', ['1', 'xsd:integer']], ['xsd:integer', 'rdfs:subClassOf', 'ex:Numeric'],
    ['ex:C', 'owl:onProperty', 'ex:p'], ['ex:C', 'owl:someValuesFrom', 'ex:Numeric'],
], [['ex:a', 'rdf:type', 'ex:C'], [['1', 'xsd:integer'], 'rdf:type', 'ex:Numeric']])
record('explicit datatype node receives datatype subsumptions', [
    ['ex:a', 'rdf:type', 'xsd:short'],
], [['ex:a', 'rdf:type', 'xsd:integer'], ['ex:a', 'rdf:type', 'xsd:decimal']])
record('allValuesFrom literal facts cooperate with someValuesFrom', [
    ['ex:a', 'ex:p', ['value', None]], ['ex:a', 'rdf:type', 'ex:C'],
    ['ex:C', 'owl:onProperty', 'ex:p'], ['ex:C', 'owl:allValuesFrom', 'ex:Target'],
    ['ex:D', 'owl:onProperty', 'ex:p'], ['ex:D', 'owl:someValuesFrom', 'ex:Target'],
], [['ex:a', 'rdf:type', 'ex:D'], [['value', None], 'rdf:type', 'ex:Target']])

record('built-in OWL classes are present without user declarations', [], [
    ['owl:Thing', 'rdf:type', 'owl:Class'], ['owl:Nothing', 'rdf:type', 'owl:Class'],
])
from owlrl.OWLRL import OWLRL_Annotation_properties
record('standard annotation properties have their built-in type', [], [
    [str(p).replace(PREFIXES['rdfs'], 'rdfs:').replace(PREFIXES['owl'], 'owl:'),
     'rdf:type', 'owl:AnnotationProperty'] for p in OWLRL_Annotation_properties
])

for name, first_head, second_head in [
    ('plain and typed string', ['head', None], ['head', 'xsd:string']),
    ('different literal text', ['head', None], ['tail', 'xsd:string']),
    ('different literal languages', ['head', None, 'en'], ['head', None, 'fr']),
]:
    triples = [
        ['ex:C', 'owl:oneOf', first_head],
        ['ex:item', 'ex:P', first_head], ['ex:item', 'ex:T', second_head],
        ['ex:P', 'rdfs:range', 'ex:H1'], ['ex:T', 'rdfs:range', 'ex:H2'],
    ]
    for head, rest, member, next_node in [
        ('ex:H1', 'ex:R1', 'ex:A', second_head),
        ('ex:H2', 'ex:R2', 'ex:B', 'rdf:nil'),
    ]:
        triples.extend([
            [head, 'owl:onProperty', 'rdf:first'], [head, 'owl:hasValue', member],
            [head, 'rdfs:subClassOf', rest], [rest, 'owl:onProperty', 'rdf:rest'],
            [rest, 'owl:hasValue', next_node],
        ])
    record('inferred collection heads retain ' + name, triples, [
        ['ex:A', 'rdf:type', 'ex:C'], ['ex:B', 'rdf:type', 'ex:C'],
    ])

destination = Path(__file__).parents[1] / 'expected/profile-inference.json'
destination.write_text(json.dumps(dict(owlrl='7.1.4', prefixes=PREFIXES, cases=cases), indent=2) + '\n')
print(f'{len(cases)} independent owlrl scenarios captured')
