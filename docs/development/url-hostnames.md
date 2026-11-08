# URL hostnames

Metadata URL fields use the Unicode 15.1 domain mapping in `tr46` 5.0.0 before
native URL parsing. This keeps acceptance and normalization tied to the locked
Python reference when Node and browser Unicode tables differ.

Mapping uses the original authority spelling. A host that maps to an empty
string remains an error. File URL credentials and ports retain their syntax
error precedence. Opaque schemes retain their separate host rules.

The pinned Pydantic generator supplies primitive expectations. Whole-crate
captures also check complete reports and valid normalization controls.
