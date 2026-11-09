# Platform-dependent manifest numbers

Pandas 3.0.2 wheels can infer different binary64 values from the same TSV spelling. Its C decimal accumulator may use a fused multiply-add instruction or separate multiplication and addition. Pinning the Python package version alone does not pin this compiler decision.

For example, these file paths collide in the pinned arm64 pandas build but remain distinct with separate accumulation:

```text
-3019.6136703185655666518e160
-3.01961367031856573e+163
```

Approving that file list would depend on the Python build being compared. The validator therefore retains both proven interpretations privately and evaluates the same file-list rules with each. Different findings, interruption details or inbound references produce `incomplete`, with continuation disabled. This includes duplicate-path decisions and numeric row locations. Agreeing interpretations retain the existing result, including unused/discarded numeric cells and ordinary string/integer columns.

The [required characterization suite](../../tests/reference/manifest-numeric-identity/README.md) preserves the unchanged arm64 whole-parser reports, exact input bytes, official x86 wheel provenance and independent C proofs for both arithmetic profiles. Source and installed Node checks and all three browser engines enforce the portable continuation contract. This is an explicit incomplete-input boundary outside exact Python agreement, rather than a corrected Python defect. Publication remains disabled.
