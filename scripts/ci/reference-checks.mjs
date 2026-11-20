// Generated from scripts/ci/reference-checks.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReferenceFamilies, runReferenceStep } from './reference-execution.mjs';
import { createReferencePlan } from '../reference/plan.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
export async function runReferenceGroup(group, { referenceGroups, upstreamReferenceFamilies }) {
    assert.ok(Object.hasOwn(referenceGroups, group), 'Unknown reference group: ' + group);
    mkdirSync(resolve(root, 'artifacts/reports'), { recursive: true });
    mkdirSync(resolve(root, 'artifacts/work'), { recursive: true });
    mkdirSync(resolve(root, 'artifacts/cache'), { recursive: true });
    const receipt = resolve(root, `artifacts/reports/reference-checks-${group}.json`);
    rmSync(receipt, { force: true });
    const results = new Map();
    const execute = async (step) => {
        console.error(`[reference:${group}] start ${[step.command, ...step.args].join(' ')}`);
        const result = await runReferenceStep(step, { cwd: root });
        results.set(step, { ...step, ...result });
        console.error(`[reference:${group}] passed in ${result.seconds.toFixed(3)}s`);
    };
    if (group === 'upstream-defects')
        await runReferenceFamilies(upstreamReferenceFamilies, referenceGroups[group].at(-1), execute);
    else
        for (const step of referenceGroups[group])
            await execute(step);
    const commands = referenceGroups[group].map(step => results.get(step));
    assert.ok(commands.every(Boolean), 'Every reference command must finish successfully');
    writeFileSync(receipt, JSON.stringify({ group, passed: commands.length, commands }, null, 2) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { referenceGroups, ...rest } = createReferencePlan({ python: process.env.BIA_PYTHON ?? 'artifacts/reference/python-env/bin/python', nodeExecutable: process.execPath });
    const plan = { referenceGroups, ...rest };
    const [group, ...extra] = process.argv.slice(2);
    assert.equal(extra.length, 0, 'Use reference-checks.mjs <group>|--list');
    if (group === '--list')
        console.log(JSON.stringify(referenceGroups, null, 2));
    else
        await runReferenceGroup(group, plan);
}
