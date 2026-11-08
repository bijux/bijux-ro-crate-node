# Upstream profile reporting blocker

The pinned Python validator can approve a crate after profile reporting fails
on a typed-literal focus node. Six cases reproduce this with boolean, integer,
decimal, dateTime, duration and binary values. Node deliberately retains the required-profile
rejection. Complete parity and publication remain blocked.

To reproduce the boolean case, take `literal-focus/typed-string-range` from
[the literal-target fixtures](../../tests/parity/inputs/profile-literal-targets.json).
Keep its Dataset range declaration and replace the author's `tag` value with:

```json
{"@value": "true", "@type": "http://www.w3.org/2001/XMLSchema#boolean"}
```

In roc-validator 0.8.1, `make_uris_relative` calls `.replace` on the Python
boolean. The reporting exception is suppressed, and the parser returns `valid`.
[Reference qualification](PARITY.md) identifies the exact provisional source.
The [separate literal-target suite](../../tests/reference/profile-literal-targets/README.md)
keeps all fourteen cases outside the passing corpus. Source and installed
Session guards refuse eight Dataset controls and preserve six valid handoffs.

Unblocking requires an accepted upstream reporting correction and fresh
qualification of the accepted Python source against all six cases and their
controls. Node must continue rejecting these constraint violations.
