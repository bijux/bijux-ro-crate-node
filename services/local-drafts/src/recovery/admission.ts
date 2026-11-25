import { decodeRecovery, RECOVERY_MAX_BYTES } from '../../../../apps/web/src/drafts/recovery-codec.js';
import type { CrateFiles } from '@bijux/ro-crate-core';

// The envelope is embedded once; 2 KiB covers the bounded ASCII key, IDs and JSON wrapper.
export const RECOVERY_REQUEST_MAX_BYTES = RECOVERY_MAX_BYTES + 2048;
export interface FrozenFile { readonly path: string; readonly base64: string }
export type FrozenRecovery =
  | { readonly status: 'materialized'; readonly revision: number; readonly files: readonly FrozenFile[] }
  | { readonly status: 'blocked'; readonly revision: number; readonly issues: readonly { readonly code: string; readonly message: string }[] }
  | { readonly status: 'read-only'; readonly files: readonly FrozenFile[]; readonly excludedPaths: readonly string[]; readonly issues: readonly string[] };

async function freezeFiles(files: CrateFiles): Promise<FrozenFile[]> {
  return Promise.all([...files].map(async ([path, value]) => {
    const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') :
      value instanceof Blob ? Buffer.from(new Uint8Array(await value.arrayBuffer())) :
      value instanceof ArrayBuffer ? Buffer.from(new Uint8Array(value)) : Buffer.from(value);
    return { path, base64: bytes.toString('base64') };
  }));
}

export async function admitRecovery(value: unknown): Promise<{ payload: string; frozen: FrozenRecovery } | undefined> {
  let payload: string | undefined;
  try { payload = JSON.stringify(value); } catch { return undefined; }
  if (payload === undefined || Buffer.byteLength(payload) > RECOVERY_MAX_BYTES) return undefined;
  const decoded = await decodeRecovery(payload);
  if (decoded.status === 'rejected') return undefined;
  if (decoded.status === 'read-only') return {
    payload, frozen: { status: 'read-only', files: await freezeFiles(decoded.files), excludedPaths: decoded.excludedPaths, issues: decoded.issues },
  };
  const materialization = decoded.materialization;
  if (materialization.status === 'blocked') return { payload, frozen: materialization };
  return { payload, frozen: { status: 'materialized', revision: materialization.revision, files: await freezeFiles(materialization.files) } };
}
