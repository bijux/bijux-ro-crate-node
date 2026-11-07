# JSON-LD dependency patch

The validator bundles `jsonld@9.0.0`. Valid context terms can be named
`hasOwnProperty` or `__proto__`; they must remain data rather than changing
object behavior or interrupting parsing.

The reviewed patch in `scripts/dependencies/patches/` uses intrinsic own-property
checks and preserves own keys during cloning without invoking the prototype
setter. The validator's RDF and model-context adapters also use dictionaries
without inherited properties.

`npm ci` applies the exact-version patch through the private workspace's
`postinstall` script and fails if it cannot apply. The build includes the
patched implementation in each published validator and worker bundle. Installed
package consumers do not run a patching script or download this dependency.

When changing the JSON-LD dependency, review the patch against that version and
run the live Python corpus, declaration checks and installed package browser
qualification. Keep the key-collision regressions even if an upstream release
makes the patch unnecessary. Dependency copyright notices and bundled license
files remain part of the build output.
