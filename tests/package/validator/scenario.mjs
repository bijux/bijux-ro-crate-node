// Generated from tests/package/validator/scenario.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
export async function validatorScenario(validator, _root) {
    assert.equal(validator.name, '@bijux/ro-crate-validator', 'Validator scenario must exercise its public package');
    const source = 'tests/package/fixtures/validator/';
    const data = 'tests/parity/fixtures/test_minimal_valid_ro_crate/';
    return { fixture: {
            files: [...['node-runtime.ts', 'node-types.ts', 'browser-types.ts', 'browser-app.ts'].map(name => ({ source: source + name, target: name })),
                ...['ro-crate-metadata.json', 'file_list.tsv'].map(name => ({ source: data + name, target: name }))],
            nodeRoots: ['node-runtime.ts', 'node-types.ts'], browserRoots: ['browser-types.ts', 'browser-app.ts'],
            runtimeEntry: { source: 'node-runtime.ts', output: 'consumer.mjs' }, browserEntry: { source: 'browser-app.ts', output: 'app.mjs' },
            required: [
                { packageName: validator.name, export: '.', environment: 'node' },
                { packageName: validator.name, export: './worker', environment: 'node' },
                { packageName: validator.name, export: '.', environment: 'browser' },
                { packageName: validator.name, export: './worker', environment: 'browser' },
                { packageName: validator.name, export: './browser', environment: 'browser' },
            ],
        } };
}
