# Validation session ownership

A validation session owns one worker for its current revision. Selection, edits,
options and revalidation clear eligibility before terminating earlier work.

Termination can run a callback supplied by the worker factory. If canceling
crate A selects crate B inside that callback, B owns the replacement worker and
its deadline. A's cleanup, result or failure must not overwrite B. Ownership is
released before invoking termination, and the outer operation checks its
revision again before publishing state.

Disposal closes the session before cleanup. A termination callback cannot start
another selection after disposal. Input snapshots also commit only while their
operation owns the revision: caller getters and file iterators can reenter.

## Qualification

[Termination controls](../../tests/browser/session/termination.mjs) use native
module workers in Chromium, Firefox and WebKit. They hold the replacement
request, require continuation to remain unavailable, then verify its approved
bytes, options and revision. Separate controls check the retained execution
deadline and disposal. Every created worker must receive one termination.

The installed Session module and its declared core dependency both resolve to
the installed archives. The harness records the requested core path and rejects
fallback to source packages. The continuation, native-file and lifecycle harnesses
bind the same dependency explicitly.

The complete installed-worker corpus checks validation separately. The source
example UI has its own lifecycle checks; reports identify that UI surface
separately from the selected Session, worker and core distribution.
