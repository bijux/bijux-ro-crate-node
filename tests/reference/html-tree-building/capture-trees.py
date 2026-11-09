"""Observe original/corrected DOMs and errors independently of the Node parser."""
import argparse
import hashlib
import json
import logging
from pathlib import Path
import subprocess
import sys
from corrected import corrected_grammar

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=Path(__file__).with_name('trees.json'))
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')], check=True, stdout=subprocess.DEVNULL)
from rdflib import Literal, RDF
from html5rdf import HTMLParser, treebuilders
logging.disable(logging.CRITICAL)
folder = Path(__file__).resolve().parent
pairs_path = folder / 'pairs.json'
pairs = json.loads(pairs_path.read_text())['pairs']


def node_value(node):
    if node.nodeType == node.ELEMENT_NODE:
        return {'type': 'element', 'namespace': node.namespaceURI, 'name': node.localName,
                'attributes': [[item.namespaceURI, item.localName, item.value]
                               for item in node.attributes.values()],
                'children': [node_value(child) for child in node.childNodes]}
    if node.nodeType == node.TEXT_NODE:
        return {'type': 'text', 'value': node.data}
    if node.nodeType == node.COMMENT_NODE:
        return {'type': 'comment', 'value': node.data}
    raise AssertionError(f'Unexpected DOM node type {node.nodeType}')


def observe(text):
    term = Literal(text, datatype=RDF.HTML)
    parser = HTMLParser(tree=treebuilders.getTreeBuilder('dom'), strict=False)
    fragment = parser.parseFragment(text)
    return {'canonical': str(term), 'converted': term.value is not None,
            'tree': [node_value(node) for node in fragment.childNodes], 'parse_errors': parser.errors}


original = [{side: observe(pair[side]) for side in ['first', 'second']} for pair in pairs]
with corrected_grammar() as stamp:
    corrected = [{side: observe(pair[side]) for side in ['first', 'second']} for pair in pairs]
rows = []
for pair, before, after in zip(pairs, original, corrected):
    assert (after['first']['tree'] == after['second']['tree']) is pair['equivalent'], pair['name']
    for side in ['first', 'second']:
        assert bool(after[side]['parse_errors']) is pair[side + '_parse_error'], (pair['name'], side)
        assert after[side]['converted'] is not pair[side + '_parse_error'], (pair['name'], side)
    rows.append({'name': pair['name'], 'original': before, 'corrected': after})
args.output.write_text(json.dumps({'html_grammar_correction': stamp,
    'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'pairs_sha256': hashlib.sha256(pairs_path.read_bytes()).hexdigest(), 'pairs': rows}, indent=2) + '\n')
print(f'{len(rows)} original/corrected HTML tree and strict-error pairs captured')
