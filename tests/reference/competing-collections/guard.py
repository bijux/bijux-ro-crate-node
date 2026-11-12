"""Reject competing RDF arcs before arbitrary collection traversal."""
from rdflib import RDF
from bia_ro_crate.core.validation.severity import Severity
from bia_ro_crate.core.validation.validation_error import ValidationError


def reject_competing_arcs(parser, graph):
    ambiguous = False
    for predicate in (RDF.first, RDF.rest):
        if any(len(set(graph.objects(cell, predicate))) > 1
               for cell in graph.subjects(predicate=predicate, unique=True)):
            parser._parse_issues.append(ValidationError(
                severity=Severity.ERROR,
                message=f"Ambiguous RDF collection: multiple values for {predicate}."))
            ambiguous = True
    if ambiguous:
        parser._raise_errors()
