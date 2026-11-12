# Prefix and container model identities

All twenty complete requests now compare directly with merged Python main.
Explicit prefix serialization retains model identities, including the five
full-IRI counterpart pairs. The single-model alias diagnostic is captured from
the unchanged parser. Three supported map labels complete valid; three prefix
containers complete invalid with the dedicated prefix-value finding.

The previously necessary prefix correction has been retired. `prove.py` checks
that reconstructed and full contexts now select the same model identities and
that each counterpart preserves the expanded JSON-LD and RDF graph.
