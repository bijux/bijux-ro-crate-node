"""Capture the original formatter or its explicitly isolated defect correction."""
import argparse
import contextlib
import io
import hashlib
import inspect
import json
import runpy
import sys
from importlib.metadata import version
from pathlib import Path

import pyshacl.rdfutil.stringify as formatter

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
parser.add_argument('--prove', action='store_true')
args = parser.parse_args()
contract = json.loads((Path(__file__).parent / 'correction.json').read_text())
source = inspect.getsource(formatter.stringify_blank_node)
assert version('pyshacl') == contract['pyshacl']
assert hashlib.sha256(source.encode()).hexdigest() == contract['function_sha256']
if args.prove:
    assert not args.corrected
    from rdflib import BNode, Graph, Literal, URIRef
    from rdflib.namespace import OWL, RDFS
    node, equal_node = BNode('focus'), BNode('focus')
    graph = Graph()
    graph.bind('owl', OWL)
    graph.add((node, OWL.sameAs, node))
    graph.add((node, RDFS.label, Literal('same logical node')))
    formatter.stringify_blank_node.dict_cache.clear()
    canonical = formatter.stringify_node(graph, node)
    formatter.stringify_blank_node.dict_cache.clear()
    alternate = formatter.stringify_node(graph, equal_node)
    equal_graph = Graph()
    equal_graph.bind('owl', OWL)
    equal_graph.add((node, URIRef(str(OWL.sameAs)), node))
    equal_graph.add((node, RDFS.label, Literal('same logical node')))
    formatter.stringify_blank_node.dict_cache.clear()
    alternate_predicate = formatter.stringify_node(equal_graph, node)
    assert node == equal_node and node is not equal_node
    assert set(graph) == set(equal_graph)
    assert canonical != alternate and canonical != alternate_predicate
    print(json.dumps({'pyshacl': contract['pyshacl'], 'equal_rdf_terms': True,
                      'equal_rdf_graphs': True, 'original': canonical,
                      'equal_focus': alternate, 'equal_predicate': alternate_predicate}))
    raise SystemExit(0)
if args.corrected:
    # This separate oracle corrects only the proven diagnostic defects. The
    # ordinary parity oracle and the installed Python files remain untouched.
    replacements = [
        ('p is OWLsameAs and o is bnode', 'p == OWLsameAs and o == bnode'),
        ('    stringed_cache_key = id(graph), str(bnode)',
         '    if recursion == 1:\n        stringify_blank_node.dict_cache.clear()\n'
         '    stringed_cache_key = id(graph), str(bnode)'),
        ('    p_string_map = {}',
         '    predicates = sorted(set(predicates), key=lambda p: p.n3(namespace_manager=ns_manager))\n'
         '    p_string_map = {}'),
        ('        o_texts = []',
         '        objs.sort(key=lambda o: (_diagnostic_kind(o), str(o), '
         'getattr(o, "language", None) or "", str(getattr(o, "datatype", None) or "") '
         'if not getattr(o, "language", None) else ""))\n        o_texts = []'),
    ]
    for before, after in replacements:
        assert source.count(before) == 1, 'Formatter correction no longer applies exactly'
        source = source.replace(before, after)
    formatter.__dict__['_diagnostic_kind'] = lambda term: (
        'BlankNode' if isinstance(term, formatter.rdflib.BNode) else
        'Literal' if isinstance(term, formatter.rdflib.Literal) else 'NamedNode')
    exec(source, formatter.__dict__)
sys.path.insert(0, str(root / 'tests/parity'))
if args.corrected:
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
    capture = json.loads(output.getvalue())
    capture['diagnostic_correction'] = {
        **contract, 'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }
    print(json.dumps(capture))
else:
    runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
