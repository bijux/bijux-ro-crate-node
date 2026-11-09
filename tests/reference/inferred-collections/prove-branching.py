"""Compare finite LIST summaries with direct regular-language witness queries."""
import hashlib
import json
from pathlib import Path
from rdflib import Graph, RDF, URIRef
from rules import ListRelation

nodes = [URIRef('urn:h'), URIRef('urn:t'), RDF.nil]
labels = [URIRef('urn:p'), URIRef('urn:q')]
topologies = [[1, 0, 2], [1, 2, 0]]
digest = hashlib.sha256()
rows, member_count, pair_count = 0, 0, 0

def witness(graph, head, symbols):
    # A small recognizer asks whether ONE complete witness contains the named
    # positions in order. Each edge consumes one symbol, so equal symbols still
    # require distinct positions. No witness lengths are enumerated or capped.
    pending, seen = [(head, 0)], {(head, 0)}
    for cell, progress in pending:
        if cell == RDF.nil and progress == len(symbols):
            return True
        for member in graph.objects(cell, RDF.first):
            next_progress = progress + (progress < len(symbols) and member == symbols[progress])
            for tail in graph.objects(cell, RDF.rest):
                state = tail, next_progress
                if state not in seen:
                    seen.add(state); pending.append(state)
    return False

for topology, next_cells in enumerate(topologies):
    for pattern in range(4096):
        graph = Graph()
        for i, cell in enumerate(nodes):
            choices = (pattern >> (4 * i)) & 15
            for bit, member in enumerate(labels):
                if choices & (1 << bit): graph.add((cell, RDF.first, member))
            for bit, tail in enumerate([nodes[next_cells[i]], RDF.nil]):
                if choices & (1 << (bit + 2)): graph.add((cell, RDF.rest, tail))
        for head_index in [0, 2]:
            head = nodes[head_index]
            members = [str(label) for label in labels if witness(graph, head, [label])]
            pairs = [[str(left), str(right)] for left in labels for right in labels
                     if witness(graph, head, [left, right])]
            relation = ListRelation(graph, head)
            assert set(relation.all_members()) == {URIRef(value) for value in members}, (topology, pattern, head_index)
            assert set(relation.member_pairs()) == {(URIRef(a), URIRef(b)) for a, b in pairs}, (topology, pattern, head_index)
            row = [topology, pattern, head_index, members, pairs]
            digest.update((json.dumps(row, separators=(',', ':')) + '\n').encode())
            rows += 1; member_count += len(members); pair_count += len(pairs)
folder = Path(__file__).parent
scenarios = json.loads((folder / 'branching-graphs.json').read_text())['cases']
chain_digest = hashlib.sha256()
chain_rows = 0
term = lambda value: RDF.nil if value == 'nil' else URIRef('urn:' + value)
individuals = [term('a'), term('b')]
for scenario in scenarios:
    for pattern in range(256):
        graph = Graph()
        for cell, member, tail in scenario['arcs']:
            graph.add((term(cell), RDF.first, term(member)))
            graph.add((term(cell), RDF.rest, term(tail)))
        for index, predicate in enumerate(labels):
            for i, start in enumerate(individuals):
                for j, end in enumerate(individuals):
                    if pattern & (1 << (index * 4 + i * 2 + j)):
                        graph.add((start, predicate, end))
        outputs = ListRelation(graph, term(scenario['head'])).chain(graph)
        expected = set()
        for start in individuals:
            pending, seen = [(term(scenario['head']), start, False)], set()
            for cell, current, consumed in pending:
                if cell == RDF.nil and consumed:
                    expected.add((start, current))
                for member in graph.objects(cell, RDF.first):
                    for end in graph.objects(current, member):
                        for tail in graph.objects(cell, RDF.rest):
                            state = tail, end, True
                            if state not in seen:
                                seen.add(state); pending.append(state)
        assert outputs == expected, (scenario['name'], pattern)
        row = [scenario['name'], pattern, sorted([[str(a), str(b)] for a, b in outputs])]
        chain_digest.update((json.dumps(row, separators=(',', ':')) + '\n').encode())
        chain_rows += 1
print(json.dumps({'graphs': 8192, 'head_queries': rows, 'members': member_count, 'pairs': pair_count,
                  'witness_relations_sha256': digest.hexdigest(), 'chain_queries': chain_rows,
                  'chain_relations_sha256': chain_digest.hexdigest(),
                  'graphs_sha256': hashlib.sha256((folder / 'branching-graphs.json').read_bytes()).hexdigest(),
                  'rules_sha256': hashlib.sha256((folder / 'rules.py').read_bytes()).hexdigest(),
                  'proof_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}, indent=2))
