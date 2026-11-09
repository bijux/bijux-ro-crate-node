"""Ground LIST antecedents from OWL 2 RL Table 3, independent of Node traversal."""
import hashlib, inspect, json
from rdflib import Graph, Namespace, Literal, RDF, RDFS, OWL, XSD
from owlrl import DeductiveClosure, OWLRL_Semantics
from importlib.metadata import version
EX = Namespace('https://example.test/')
rows = []
values = [('empty-string', Literal('')), ('empty-language', Literal('', lang='en')), ('integer-zero', Literal(0)), ('boolean-false', Literal(False)), ('duration-zero', Literal('P0D', datatype=XSD.duration)), ('binary-empty', Literal('', datatype=XSD.hexBinary)), ('native-string-zero', Literal(0, datatype=XSD.string)), ('lexical-string-zero', Literal('0', datatype=XSD.string)), ('truthy-string', Literal('head'))]
for label, head in values:
    for complete in [False, True]:
        graph = Graph()
        asserted = [(EX.holder, EX.p, head), (EX.p, RDFS.range, EX.Head), (EX.Head, OWL.onProperty, RDF.first), (EX.Head, OWL.hasValue, EX.edge), (EX.result, OWL.propertyChainAxiom, head), (EX.start, EX.edge, EX.finish)]
        if complete:
            asserted += [(EX.Head, RDFS.subClassOf, EX.End), (EX.End, OWL.onProperty, RDF.rest), (EX.End, OWL.hasValue, RDF.nil)]
        for t in asserted:
            graph.add(t)
        assert all((not isinstance(t[0], Literal) for t in asserted))
        DeductiveClosure(OWLRL_Semantics).expand(graph)
        antecedent = (head, RDF.first, EX.edge) in graph and (head, RDF.rest, RDF.nil) in graph
        consequence = (EX.start, EX.result, EX.finish) in graph
        assert antecedent == complete
        assert consequence == bool(head)
        rows.append({'name': label, 'complete': complete, 'python_truth': bool(head), 'first': (head, RDF.first, EX.edge) in graph, 'rest_nil': (head, RDF.rest, RDF.nil) in graph, 'one_member_LIST_antecedent': antecedent, 'original_consequence': consequence, 'correct_consequence': antecedent, 'head': head.n3(), 'asserted': [[x.n3() for x in t] for t in asserted]})
tail_rows = []
for value in [0, 1]:
    head = Literal(value)
    graph = Graph()
    asserted = [
        (EX.holder, EX.p, head), (EX.p, RDFS.range, EX.Head),
        (EX.Head, OWL.onProperty, RDF.first), (EX.Head, OWL.hasValue, EX.edge),
        (EX.Head, RDFS.subClassOf, EX.End), (EX.End, OWL.onProperty, RDF.rest),
        (EX.End, OWL.hasValue, RDF.nil),
        (EX.chain, RDF.first, EX.prefix), (EX.chain, RDF.rest, head),
        (EX.start, EX.prefix, EX.middle), (EX.middle, EX.edge, EX.finish),
    ]
    for triple in asserted:
        graph.add(triple)
    DeductiveClosure(OWLRL_Semantics).expand(graph)
    assert (head, RDF.first, EX.edge) in graph and (head, RDF.rest, RDF.nil) in graph
    graph.add((EX.result, OWL.propertyChainAxiom, EX.chain))
    semantics = OWLRL_Semantics(graph, False, False)
    semantics.empty_stored_triples()
    semantics._property_chain(EX.result, EX.chain)
    semantics.flush_stored_triples()
    expected = (EX.start, EX.result, EX.finish) in graph
    wrong_prefix = (EX.start, EX.result, EX.middle) in graph
    assert expected == bool(head) and wrong_prefix != bool(head)
    tail_rows.append({'head': head.n3(), 'python_truth': bool(head),
                      'two_member_LIST_antecedent': True,
                      'original_complete_consequence': expected,
                      'original_partial_prefix_consequence': wrong_prefix,
                      'asserted': [[term.n3() for term in triple] for triple in asserted]})
nil_rows = []
for label in ['empty', 'partial', 'dead', 'repeat', 'cycle']:
    graph = Graph()
    head = RDF.nil
    if label != 'empty':
        graph.add((RDF.nil, RDF.first, EX.edge))
    if label == 'dead':
        graph.add((RDF.nil, RDF.rest, EX.dead))
    if label == 'repeat':
        graph.add((RDF.nil, RDF.rest, RDF.nil))
    if label == 'cycle':
        graph = Graph()
        head = EX.head
        graph.add((head, RDF.first, EX.edge))
        graph.add((head, RDF.rest, head))

    def ground_paths(node, length):
        if not length:
            return [()] if node == RDF.nil else []
        return [(member, *suffix) for member in graph.objects(node, RDF.first) for tail in graph.objects(node, RDF.rest) for suffix in ground_paths(tail, length - 1)]
    counts = [len(ground_paths(head, n)) for n in range(4)]
    assert counts == ([1, 1, 1, 1] if label == 'repeat' else [0, 0, 0, 0] if label == 'cycle' else [1, 0, 0, 0])
    nil_rows.append({'name': label, 'ground_witness_counts_for_lengths_0_to_3': counts, 'asserted': sorted([[term.n3() for term in triple] for triple in graph])})
print(json.dumps({'versions': {x: version(x) for x in ['rdflib', 'owlrl']}, 'functions': {name: hashlib.sha256(inspect.getsource(fn).encode()).hexdigest() for name, fn in [('Graph.items', Graph.items), ('OWLRL._list', OWLRL_Semantics._list), ('OWLRL._property_chain', OWLRL_Semantics._property_chain)]}, 'cases': rows, 'tail_witnesses': tail_rows, 'nil_witnesses': nil_rows}, indent=2))
