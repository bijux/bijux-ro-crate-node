"""Capture imported context triples from the independently installed RDFLib."""

import argparse
import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import runpy

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument(
    "--output", type=Path, default=root / "tests/parity/expected/jsonld-contexts.json"
)
args = parser.parse_args()
with contextlib.redirect_stdout(io.StringIO()):
    environment = runpy.run_path(str(Path(__file__).with_name("verify-environment.py")))

from rdflib import Graph, Literal
from rdflib.plugins.shared.jsonld import context

source = (root / "tests/parity/jsonld-contexts.json").read_bytes()
rows = []
original = context.source_to_json


def term(value):
    if isinstance(value, Literal):
        return ["Literal", str(value), str(value.datatype or ""), value.language or ""]
    return ["NamedNode", str(value)]


try:
    for case in json.loads(source):

        def load(url, *args, **kwargs):
            document = copy.deepcopy(case["contexts"][str(url)])
            return json.loads(document) if isinstance(document, str) else document, None

        context.source_to_json = load
        try:
            graph = Graph().parse(
                data=json.dumps(case["document"]),
                format="json-ld",
                publicID="file:///crate/ro-crate-metadata.json",
            )
        except Exception as error:
            rows.append(
                {
                    "name": case["name"],
                    "exception": {"type": type(error).__name__, "message": str(error)},
                }
            )
        else:
            triples = [[term(s), term(p), term(o)] for s, p, o in graph]
            triples.sort(
                key=lambda row: json.dumps(
                    row, ensure_ascii=False, separators=(",", ":")
                )
            )
            rows.append({"name": case["name"], "triples": triples})
finally:
    context.source_to_json = original
args.output.write_text(
    json.dumps(
        {
            "reference": environment["commit"],
            "python": environment["platform"].python_version(),
            "rdflib": environment["versions"]["rdflib"],
            "inputs_sha256": hashlib.sha256(source).hexdigest(),
            "cases": rows,
        },
        indent=2,
    )
    + "\n"
)
