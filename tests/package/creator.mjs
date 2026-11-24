// Generated from tests/package/creator.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export function creatorScenario(creator) {
    assert.equal(creator.name, '@bijux/ro-crate-creator');
    const source = 'tests/package/fixtures/creator/';
    return { fixture: {
            files: ['node-runtime.ts', 'browser-app.ts'].map(name => ({ source: source + name, target: name })),
            nodeRoots: ['node-runtime.ts'], browserRoots: ['browser-app.ts'],
            runtimeEntry: { source: 'node-runtime.ts', output: 'consumer.mjs' }, browserEntry: { source: 'browser-app.ts', output: 'app.mjs' },
            required: [{ packageName: creator.name, export: '.', environment: 'node' }, { packageName: creator.name, export: '.', environment: 'browser' }],
        }, prepareFiles: ['index.html'], prepare: async (directory) => {
            await writeFile(resolve(directory, 'index.html'), '<!doctype html><script type="importmap">{"imports":{"@bijux/ro-crate-creator":"/node_modules/@bijux/ro-crate-creator/dist/index.js","@bijux/ro-crate-core":"/node_modules/@bijux/ro-crate-core/dist/index.js"}}</script><script type="module" src="/app.mjs"></script>');
        } };
}
export async function creatorBrowser(root) {
    const { chromium, firefox, webkit } = await import('playwright');
    const { serve } = await import('../../scripts/http/server.mjs');
    const { selectedEngines } = await import('../support/selection.mjs');
    const host = await serve(resolve(root, 'artifacts/consumers/creator'));
    try {
        for (const [, engine] of selectedEngines({ chromium, firefox, webkit })) {
            const browser = await engine.launch({ headless: true });
            try {
                const page = await browser.newPage();
                await page.goto(host.origin + '/index.html');
                await page.waitForFunction(() => document.body.textContent?.includes('Browser study'));
                const metadata = JSON.parse((await page.locator('body').textContent()));
                assert.deepEqual(metadata['@graph'][0].about, { '@id': './' });
                assert.equal(metadata['@graph'][1].name, 'Browser study');
            }
            finally {
                await browser.close();
            }
        }
    }
    finally {
        await host.close();
    }
}
