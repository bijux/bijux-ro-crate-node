# JSON-LD graph context contracts

Twelve complete crates retain six RDFLib diagnostic differences and six agreeing
controls. Every crate completes as invalid; none permits continuation.

- Type-map labels expand before a value's scoped type context can redefine them.
- A local `@propagate: false` context applies to its current node.
- Anonymous graph containers, including indexed containers, retain their named
  graph membership rather than contributing their contents to the default graph.

These follow the [JSON-LD expansion and node-map algorithms](https://www.w3.org/TR/json-ld11-api/).
The original Python reports remain visible. A separate Python capture substitutes
unchanged PyLD RDF conversion at only the metadata reference and profile graph
construction calls, retaining only the default graph. It verifies the original
function source hashes, exact registered input bytes, locked environment and both
graph calls for every crate. Other parsing, models, inference and constraints are
unchanged. No installed Python file is modified.

The upstream-defect registry requires the complete independently corrected
reports through source, installed packages, browser Workers and Sessions.
Neighboring controls keep their original reports. The ordinary parity comparator
does not allow these diagnostic differences for unregistered inputs.
