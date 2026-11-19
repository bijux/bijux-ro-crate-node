// Generated from tests/browser/observe-worker.mts by npm run generate:runtime; do not edit.
const scope = self;
const reads = [];
let paths = new Map();
const arrayBuffer = Blob.prototype.arrayBuffer;
Blob.prototype.arrayBuffer = function () {
    if (!paths.has(this.size))
        throw new Error('Unregistered Blob bytes were read');
    const path = paths.get(this.size);
    if (path === undefined)
        throw new Error('Unregistered Blob bytes were read');
    reads.push(path);
    if (path === 'unrelated.tif')
        throw new Error('Unrelated image bytes were read');
    return arrayBuffer.call(this);
};
// Install read observation before the core captures the native payload reader.
const validatorWorker = '../../packages/validator/dist/worker.js';
await import(validatorWorker);
const validate = scope.onmessage;
if (!validate)
    throw new Error('Validator worker did not install a handler');
scope.onmessage = async (event) => {
    // Snapshots may be plain Blobs. Unique fixture sizes bind reads to paths
    // without loading payload bytes or depending on File-specific metadata.
    paths = new Map();
    reads.length = 0;
    for (const [path, value] of event.data.files) {
        if (!(value instanceof Blob) || paths.has(value.size))
            throw new Error('Read-observation fixture requires unique Blob sizes');
        paths.set(value.size, path);
    }
    if (event.data.probeRead) {
        const source = event.data.probeRead === 'unregistered'
            ? new Uint8Array(Math.max(...paths.keys()) + 1) : event.data.files.get(event.data.probeRead);
        try {
            await new Blob([source]).arrayBuffer();
            post({ id: event.data.id, probeReadBlocked: false });
        }
        catch (error) {
            post({ id: event.data.id, probeReadBlocked: true, reason: error.message });
        }
        return;
    }
    return validate.call(scope, event);
};
const post = scope.postMessage.bind(scope);
scope.postMessage = data => post({ ...data, reads: [...reads] });
post({ ready: true });
export {};
