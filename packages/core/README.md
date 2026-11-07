# @bijux/ro-crate-core

Reusable local RO-Crate inputs and diagnostic primitives.

`decodeCrateReference(reference)` decodes UTF-8 percent escapes for selected
crate filenames. It preserves malformed escapes, encoded BOM characters and
replacement characters for malformed UTF-8, matching tolerant reference loading.
It does not normalize paths or grant filesystem access; workspace operations
still enforce crate-relative path confinement.
