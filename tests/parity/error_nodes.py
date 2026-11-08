"""Observe only blank nodes emitted by the untouched pinned OWL closure."""
from contextlib import contextmanager
from rdflib import BNode, Literal, Namespace
from rdflib.namespace import RDF
from owlrl.Closure import Core
from owlrl.OWLRL import OWLRL_Semantics

ERROR = Namespace('http://www.daml.org/2002/03/agents/agent-ont#')


@contextmanager
def observe_error_nodes(root, receipts):
    original = Core.closure
    failures = []

    def closure(self, *args, **kwargs):
        before = {term for triple in self.graph for term in triple}
        result = original(self, *args, **kwargs)
        if not isinstance(self, OWLRL_Semantics):
            return result
        emitted = []
        for node in self.graph.subjects(RDF.type, ERROR.ErrorMessage):
            if not isinstance(node, BNode) or node in before:
                continue
            values = list(self.graph.objects(node, ERROR.error))
            if len(values) != 1 or type(values[0]) is not Literal or values[0].datatype or values[0].language:
                continue
            message = str(values[0])
            if message not in self.error_messages:
                continue
            if set(self.graph.predicate_objects(node)) != {(RDF.type, ERROR.ErrorMessage), (ERROR.error, values[0])}:
                failures.append('Generated OWL node has unexpected graph facts')
                continue
            emitted.append((node, message))
        if len(emitted) != len(self.error_messages):
            failures.append('OWL error-node observation is incomplete')
        generated = {node for node, _ in emitted}
        occupied = [str(node) for triple in self.graph for node in triple if isinstance(node, BNode) and node not in generated]
        namespace = 'owl-error-'
        while any(value.startswith(namespace) for value in occupied):
            namespace += '-'
        stable = lambda message: message.replace(root.as_uri() + '/', 'crate:/')
        for index, (node, message) in enumerate(sorted(emitted, key=lambda pair: stable(pair[1]))):
            receipts.append({'node': str(node), 'message': message, 'comparison_node': namespace + str(index),
                             'provenance': 'owlrl-7.1.4/closure-created-error-message'})
        return result

    Core.closure = closure
    try:
        yield failures
    finally:
        Core.closure = original
