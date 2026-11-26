// Generated from tests/package/validator/node.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseJson, snapshotReceipt, nodeReceipt, nativeReceipt, numericReceipt } from '../harness/receipts.mjs';
export async function nodeChecks({ root, validator, run, verifyPrepared, mode }, nodeVersions, lane) {
    const proof = await verifyPrepared();
    const validatorConsumer = proof.consumers.find(item => item.name === 'validator');
    assert.ok(validatorConsumer);
    const validatorEntry = validatorConsumer.packages.find(item => item.name === validator.name);
    assert.ok(validatorEntry);
    const module = pathToFileURL(resolve(root, validatorEntry.entry)).href;
    const runNode = (version, arguments_, env) => mode === '--node'
        ? run(process.execPath, arguments_, root, env)
        : run('npm', ['exec', '--yes', '--package=node@' + version, '--', 'node', ...arguments_], root, env);
    const installedCorpus = [];
    for (const version of nodeVersions) {
        let snapshot = {};
        if (lane !== 'references') {
            const parity = runNode(version, ['tests/parity/snapshot-partitions.mjs'], { BIJUX_VALIDATOR_MODULE: module });
            const receipt = snapshotReceipt(parseJson(parity));
            assert.equal(receipt.node_version, version);
            assert.equal(receipt.distribution, 'installed');
            assert.equal(receipt.failed, 0);
            assert.equal(receipt.passed, receipt.total);
            assert.equal(receipt.reference_kind, 'qualified-main');
            assert.equal(receipt.qualified_collection_cases, 151);
            assert.equal(receipt.qualified_collection_passed, 151);
            assert.equal(receipt.ordinary_exact_cases, receipt.total - 151);
            assert.equal(receipt.ordinary_exact_passed, receipt.total - 151);
            const line = version.split('.')[0];
            await writeFile(resolve(root, 'artifacts/logs/installed-parity.log'), parity);
            await writeFile(resolve(root, `artifacts/logs/installed-parity-node${line}.log`), parity);
            await writeFile(resolve(root, `artifacts/reports/installed-snapshot-parity-node${line}.json`), JSON.stringify(receipt, null, 2) + '\n');
            snapshot = { node_version: version, total: receipt.total, passed: receipt.passed,
                reference_kind: receipt.reference_kind, ordinary_exact_passed: receipt.ordinary_exact_passed,
                qualified_collection_passed: receipt.qualified_collection_passed,
                corpus_sha256: receipt.corpus_sha256, imported_module: receipt.imported_module };
        }
        if (lane === 'snapshot') {
            installedCorpus.push(snapshot);
            continue;
        }
        const nativeInputs = nativeReceipt(parseJson(runNode(version, ['tests/package/native-inputs.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
        assert.equal(nativeInputs.node, version);
        assert.equal(nativeInputs.passed, 4);
        const upstreamDefects = nodeReceipt(parseJson(runNode(version, ['tests/reference/upstream-defects/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
        assert.equal(upstreamDefects.distribution, 'installed');
        assert.equal(upstreamDefects.node_version, version);
        assert.equal(upstreamDefects.imported_module, module);
        assert.equal(upstreamDefects.cases, 123);
        assert.equal(upstreamDefects.approved_differences, 47);
        const reservedTypes = nodeReceipt(parseJson(runNode(version, ['tests/reference/reserved-type-identifiers/observers/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
        assert.equal(reservedTypes.distribution, 'installed');
        assert.equal(reservedTypes.node_version, version);
        assert.equal(reservedTypes.imported_module, module);
        assert.equal(reservedTypes.cases, 6);
        assert.equal(reservedTypes.approved_differences, 2);
        assert.deepEqual(reservedTypes.outcomes, { valid: 0, invalid: 6, incomplete: 0 });
        const modelTypePrefixes = nodeReceipt(parseJson(runNode(version, ['tests/reference/model-type-prefixes/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
        assert.equal(modelTypePrefixes.distribution, 'installed');
        assert.equal(modelTypePrefixes.node_version, version);
        assert.equal(modelTypePrefixes.imported_module, module);
        assert.equal(modelTypePrefixes.cases, 20);
        assert.equal(modelTypePrefixes.approved_differences, 0);
        assert.deepEqual(modelTypePrefixes.outcomes, { valid: 5, invalid: 15, incomplete: 0 });
        const literalGrammar = nodeReceipt(parseJson(runNode(version, ['tests/reference/literal-grammar/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
        assert.equal(literalGrammar.distribution, 'installed');
        assert.equal(literalGrammar.node_version, version);
        assert.equal(literalGrammar.imported_module, module);
        assert.equal(literalGrammar.cases, 62);
        assert.equal(literalGrammar.approved_differences, 18);
        const jsonldProcessing = nodeReceipt(parseJson(runNode(version, ['tests/reference/jsonld-processing/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
        assert.equal(jsonldProcessing.distribution, 'installed');
        assert.equal(jsonldProcessing.node_version, version);
        assert.equal(jsonldProcessing.imported_module, module);
        assert.equal(jsonldProcessing.cases, 80);
        assert.equal(jsonldProcessing.approved_differences, 72);
        assert.deepEqual(jsonldProcessing.outcomes, { valid: 4, invalid: 37, incomplete: 39 });
        const inferredCollections = nodeReceipt(parseJson(runNode(version, ['tests/reference/inferred-collections/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
        assert.equal(inferredCollections.distribution, 'installed');
        assert.equal(inferredCollections.node_version, version);
        assert.equal(inferredCollections.imported_module, module);
        assert.equal(inferredCollections.cases, 138);
        assert.equal(inferredCollections.approved_differences, 41);
        assert.equal(inferredCollections.input_limits, 0);
        assert.deepEqual(inferredCollections.outcomes, { valid: 96, invalid: 42, incomplete: 0 });
        const collectionDiagnostics = nodeReceipt(parseJson(runNode(version, ['tests/reference/collection-diagnostics/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
        assert.equal(collectionDiagnostics.distribution, 'installed');
        assert.equal(collectionDiagnostics.node_version, version);
        assert.equal(collectionDiagnostics.imported_module, module);
        assert.equal(collectionDiagnostics.cases, 15);
        assert.equal(collectionDiagnostics.approved_differences, 3);
        assert.deepEqual(collectionDiagnostics.outcomes, { valid: 3, invalid: 12, incomplete: 0 });
        const numericIdentity = numericReceipt(parseJson(runNode(version, ['tests/reference/manifest-numeric-identity/run.mjs'], { BIJUX_VALIDATOR_MODULE: module })));
        assert.equal(numericIdentity.distribution, 'installed');
        assert.equal(numericIdentity.node_version, version);
        assert.equal(numericIdentity.imported_module, module);
        assert.equal(numericIdentity.cases, 11);
        assert.equal(numericIdentity.platform_dependent, 3);
        installedCorpus.push({ node_version: version, imported_module: module, ...snapshot,
            native_inputs: nativeInputs, upstream_defects: upstreamDefects, reserved_types: reservedTypes, model_type_prefixes: modelTypePrefixes, literal_grammar: literalGrammar, jsonld_processing: jsonldProcessing,
            inferred_collections: inferredCollections, collection_diagnostics: collectionDiagnostics, numeric_identity: numericIdentity });
    }
    return installedCorpus;
}
