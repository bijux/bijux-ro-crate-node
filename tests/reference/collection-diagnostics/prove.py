"""Prove the two cyclic diagnostic failures and lossless report-cell copying."""
import ast
import hashlib
import inspect
import json
from pathlib import Path
import pyshacl.rdfutil.clone as cloner
import pyshacl.rdfutil.stringify as formatter
from rdflib import BNode, Graph, Literal, RDF
from rdflib.compare import isomorphic

folder = Path(__file__).parent
contract = json.loads((folder / 'correction.json').read_text())
source = inspect.getsource(formatter.stringify_blank_node)
original_clone_list = cloner.clone_list
assert hashlib.sha256(source.encode()).hexdigest() == contract['functions']['stringify_blank_node']
assert hashlib.sha256(inspect.getsource(original_clone_list).encode()).hexdigest() == contract['functions']['clone_list']
module = ast.parse((folder / 'capture.py').read_text())
correction = next(node for node in module.body if isinstance(node, ast.If)
                  and ast.unparse(node.test) == 'args.corrected')
assignments = {node.targets[0].id: ast.literal_eval(node.value) for node in correction.body
               if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
               and node.targets[0].id in ['before', 'after']}
function = next(node for node in correction.body if isinstance(node, ast.FunctionDef)
                and node.name == 'cycle_preserving_clone')
namespace = {'cloner': cloner, 'original_clone_list': original_clone_list, 'BNode': BNode, 'RDF': RDF}
exec(compile(ast.Module(body=[function], type_ignores=[]), str(folder / 'capture.py'), 'exec'), namespace)
fixed_clone = namespace['cycle_preserving_clone']
graphs, failures = [], []
for name in ['self', 'tail']:
    graph = Graph(); graphs.append(graph)
    head, tail = BNode('head'), BNode('tail')
    graph.add((head, RDF.first, Literal('item')))
    graph.add((head, RDF.rest, head if name == 'self' else tail))
    if name == 'tail':
        graph.add((tail, RDF.first, Literal('tail'))); graph.add((tail, RDF.rest, head))
    original_errors = []
    for operation in [lambda: formatter.stringify_blank_node(graph, head),
                      lambda: original_clone_list(graph, head, Graph(), keepid=True)]:
        formatter.stringify_blank_node.dict_cache.clear()
        try:
            operation()
        except ValueError as error:
            assert str(error) == 'List contains a recursive rdf:rest reference'
            original_errors.append(str(error))
        else:
            raise AssertionError('Original cyclic diagnostic operation did not fail')
    assert len(original_errors) == 2
    for keepid in [False, True]:
        target = Graph(); fixed_clone(graph, head, target, keepid=keepid)
        assert isomorphic(graph, target), 'Corrected report clone lost cyclic RDF structure'
        if keepid: assert set(graph) == set(target)
    failures.append({'name': name, 'original_errors': original_errors,
                     'clone_isomorphic_with_and_without_retained_ids': True,
                     'triples': sorted([[term.n3() for term in triple] for triple in graph])})
assert source.count(assignments['before']) == 1
exec(source.replace(assignments['before'], assignments['after']), formatter.__dict__)
for row, graph in zip(failures, graphs):
    formatter.stringify_blank_node.dict_cache.clear()
    label = formatter.stringify_blank_node(graph, BNode('head'))
    expected = '( Literal("item") ' + ('Literal("tail") ' if row['name'] == 'tail' else '')
    assert label == expected + '<http://recursion.too.deep> )'
    row['corrected_label'] = label
print(json.dumps({'functions': contract['functions'], 'cases': failures}, indent=2))
