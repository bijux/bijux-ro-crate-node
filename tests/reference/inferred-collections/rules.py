"""Independent least-fixed-point relations for complete OWL LIST antecedents."""
from rdflib import RDF, RDFS, OWL


class ListRelation:
    def __init__(self, graph, head):
        self.head, self.cells = head, {}
        pending = [] if head is None else [head]
        while pending:
            cell = pending.pop()
            if cell in self.cells:
                continue
            members = set(graph.objects(cell, RDF.first))
            tails = set(graph.objects(cell, RDF.rest)) if members else set()
            self.cells[cell] = members, tails
            pending.extend(tails - self.cells.keys())
        self.productive = {RDF.nil} & self.cells.keys()
        changed = True
        while changed:
            before = len(self.productive)
            self.productive.update(cell for cell, (members, tails) in self.cells.items()
                                   if members and tails & self.productive)
            changed = len(self.productive) != before
        self.members = {cell: set() for cell in self.cells}
        self.pairs = {cell: set() for cell in self.cells}
        changed = True
        while changed:
            changed = False
            for cell, (members, tails) in self.cells.items():
                for tail in tails & self.productive:
                    suffix = self.members[tail]
                    values = members | suffix
                    pairs = self.pairs[tail] | {(left, right) for left in members for right in suffix}
                    before = len(self.members[cell]), len(self.pairs[cell])
                    self.members[cell].update(values)
                    self.pairs[cell].update(pairs)
                    changed |= before != (len(self.members[cell]), len(self.pairs[cell]))

    def all_members(self):
        return self.members.get(self.head, set())

    def member_pairs(self):
        return self.pairs.get(self.head, set())

    def accepts(self, predicate):
        # Every position of a nonempty complete witness must satisfy the same
        # predicate. The empty nil witness does not supply an operand.
        accepted = set()
        changed = True
        while changed:
            before = len(accepted)
            for cell, (members, tails) in self.cells.items():
                if any(predicate(member) and (RDF.nil in tails or tails & accepted)
                       for member in members):
                    accepted.add(cell)
            changed = len(accepted) != before
        return self.head in accepted

    def chain(self, graph):
        # Backward suffix relations are independent of Node's forward product
        # states. Finite cell × endpoint relations reach a fixed point even if
        # the collection denotes infinitely many complete sequence lengths.
        relations = {cell: set() for cell in self.cells}
        changed = True
        while changed:
            changed = False
            for cell, (members, tails) in self.cells.items():
                for member in members:
                    edges = set(graph.subject_objects(member))
                    for tail in tails & self.productive:
                        values = edges if tail == RDF.nil else set()
                        suffix = relations[tail]
                        values = values | {(start, end) for start, middle in edges
                                           for left, end in suffix if middle == left}
                        before = len(relations[cell])
                        relations[cell].update(values)
                        changed |= len(relations[cell]) != before
        return relations.get(self.head, set())


def install(semantics):
    """Override only list-consuming branches; every other pinned rule delegates."""
    original = {name: getattr(semantics, name) for name in
                ['_classes', '_class_axioms', '_properties', '_equality']}

    def operand(self, head):
        stamp = len(self.graph)
        if getattr(self, '_collection_graph_stamp', None) != stamp:
            self._collection_graph_stamp = stamp
            self._collection_graph_cache = {}
        cache = self._collection_graph_cache
        if head not in cache:
            cache[head] = ListRelation(self.graph, head)
        return cache[head]

    def members(self, head):
        return list(operand(self, head).all_members())

    def classes(self, triple, cycle_num):
        cls, predicate, head = triple
        if predicate != OWL.intersectionOf:
            return original['_classes'](self, triple, cycle_num)
        collection = operand(self, head)
        values = collection.all_members()
        candidates = {instance for member in values for instance in self.graph.subjects(RDF.type, member)}
        for instance in candidates:
            if collection.accepts(lambda member: (instance, RDF.type, member) in self.graph):
                self.store_triple((instance, RDF.type, cls))
        for instance in self.graph.subjects(RDF.type, cls):
            for member in values:
                self.store_triple((instance, RDF.type, member))

    def class_axioms(self, triple, cycle_num):
        axiom, predicate, kind = triple
        if predicate != RDF.type or kind != OWL.AllDisjointClasses:
            return original['_class_axioms'](self, triple, cycle_num)
        for head in self.graph.objects(axiom, OWL.members):
            for left, right in operand(self, head).member_pairs():
                for instance in self.graph.subjects(RDF.type, left):
                    if (instance, RDF.type, right) in self.graph:
                        self.add_error('Disjoint classes %s and %s have a common individual %s' % (left, right, instance))

    def properties(self, triple, cycle_num):
        subject, predicate, value = triple
        if predicate == RDF.type and value == OWL.AllDisjointProperties:
            for head in self.graph.objects(subject, OWL.members):
                for left, right in operand(self, head).member_pairs():
                    for start, end in self.graph.subject_objects(left):
                        if (start, right, end) in self.graph:
                            self.add_error("Disjoint properties in an 'AllDisjointProperties' are not really "
                                           'disjoint: (%s, %s,%s) and (%s,%s,%s)' % (start, left, end, start, right, end))
        elif predicate == OWL.hasKey:
            collection = operand(self, value)
            instances = list(self.graph.subjects(RDF.type, subject))
            for left in instances:
                for right in instances:
                    if left == right or (left, OWL.sameAs, right) in self.graph or (right, OWL.sameAs, left) in self.graph:
                        continue
                    if collection.accepts(lambda member: any((right, member, item) in self.graph
                                                             for item in self.graph.objects(left, member))):
                        self.store_triple((left, OWL.sameAs, right))
        else:
            return original['_properties'](self, triple, cycle_num)

    def equality(self, triple, cycle_num):
        subject, predicate, kind = triple
        if predicate != RDF.type or kind != OWL.AllDifferent:
            return original['_equality'](self, triple, cycle_num)
        for term in triple:
            self.store_triple((term, OWL.sameAs, term))
        heads = list(self.graph.objects(subject, OWL.members)) + list(self.graph.objects(subject, OWL.distinctMembers))
        for head in heads:
            for left, right in operand(self, head).member_pairs():
                if (left, OWL.sameAs, right) in self.graph or (right, OWL.sameAs, left) in self.graph:
                    self.add_error("'sameAs' and 'AllDifferent' cannot be used on the same subject-object pair: (%s, %s)" % (left, right))

    def property_chain(self, property, head):
        for start, end in operand(self, head).chain(self.graph):
            self.store_triple((start, property, end))

    semantics._list = members
    semantics._classes = classes
    semantics._class_axioms = class_axioms
    semantics._properties = properties
    semantics._equality = equality
    semantics._property_chain = property_chain
