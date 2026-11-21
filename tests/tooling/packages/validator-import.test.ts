import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import test from 'node:test'

test('Node consumer imports do not load browser-only dependencies', () => {
  const program = `
    import {register} from 'node:module';
    const loader = "export async function resolve(specifier, context, next) { if (specifier === 'playwright' || specifier === 'esbuild') throw new Error('blocked browser dependency: ' + specifier); return next(specifier, context); }";
    register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);
    await import('./tests/package/consumers.mjs');
    await import('./tests/package/validator/node.mjs');
    for (const path of ['./tests/package/validator/browser.mjs', './tests/package/validator/apps.mjs']) {
      try { await import(path); throw new Error('expected browser dependency to be blocked'); }
      catch (error) { if (!String(error).includes('blocked browser dependency:')) throw error; }
    }
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {encoding: 'utf8', timeout: 30000})
  assert.equal(result.status, 0, result.stderr)
})
