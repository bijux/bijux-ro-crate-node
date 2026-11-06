# Shared standards adoption

Accepted engineering infrastructure was inspected from
`bijux/bijux-std` main at `c3b22a7be99304592a379dc83f51d7397d372efb`.
Its declared capabilities are common, docs, python and rust. There is no
Node/workspace capability or canonical governance registry entry for this
repository at that source revision.

Repository-owned npm build, test and validation commands implement product
behavior. No synchronized shared content is modified or locally patched.
Full shared-governance acceptance remains blocked until bijux-std registers
this repository and defines the applicable Node/workspace verification contract.

The durable upstream work is to declare the repository's capability/profile,
register its check producers and publication route, validate canonical
projection and checksums, then consume the exact accepted GitHub revision here
using its updater. Run the supplied managed-content/checksum validator before
committing that refresh. This is an adoption dependency, not an implemented
local exception or a claim that generic synchronization cannot copy files.
