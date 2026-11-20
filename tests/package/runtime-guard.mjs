// Generated from tests/package/runtime-guard.mts by npm run generate:runtime; do not edit.
import * as nodeModule from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import workerThreads from 'node:worker_threads';
import { assertAllowed } from './resolution-policy.mjs';
import { assertNoPreloads } from './node-options.mjs';
if (typeof nodeModule.registerHooks === 'function') {
    nodeModule.registerHooks({
        resolve(specifier, context, nextResolve) {
            const result = nextResolve(specifier, context);
            assertAllowed(result.url);
            return result;
        },
    });
}
else {
    // Older Node releases do not expose synchronous hooks; guard CommonJS
    // resolution in the loading thread as well as ESM resolution in its hook.
    const commonjs = nodeModule.Module;
    const original = commonjs._resolveFilename;
    commonjs._resolveFilename = function (...args) {
        const result = original.apply(this, args);
        if (!nodeModule.isBuiltin(result))
            assertAllowed(pathToFileURL(result).href);
        return result;
    };
    nodeModule.register(new URL('./resolution-hook.mjs', import.meta.url));
}
const OriginalWorker = workerThreads.Worker;
class GuardedWorker extends OriginalWorker {
    constructor(filename, options) {
        const nodeOptions = options?.env && options.env !== workerThreads.SHARE_ENV ? options.env.NODE_OPTIONS : process.env.NODE_OPTIONS;
        assertNoPreloads(nodeOptions);
        const configured = options?.execArgv ?? process.execArgv;
        const guardPath = fileURLToPath(import.meta.url);
        const isGuard = (value) => value === import.meta.url || resolve(value) === guardPath;
        const inherited = [];
        for (let index = 0; index < configured.length; index++) {
            const option = configured[index];
            if (option === '--import' && configured[index + 1] && isGuard(configured[index + 1])) {
                index++;
                continue;
            }
            if (option.startsWith('--import=') && isGuard(option.slice('--import='.length)))
                continue;
            inherited.push(option);
        }
        const guarded = { ...options, execArgv: ['--import', import.meta.url, ...inherited] };
        if (options?.env && options.env !== workerThreads.SHARE_ENV) {
            guarded.env = { ...options.env, BIJUX_CONSUMER_ROOT: process.env.BIJUX_CONSUMER_ROOT,
                ...(process.env.NODE_V8_COVERAGE ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE } : {}) };
        }
        super(filename, guarded);
    }
}
workerThreads.Worker = GuardedWorker;
nodeModule.syncBuiltinESMExports();
