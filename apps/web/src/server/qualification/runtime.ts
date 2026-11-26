import {QualificationPool} from './index.js'

let pool:QualificationPool | undefined
/** Astro places server chunks one directory below the compiled qualification worker. */
export function localQualificationPool():QualificationPool {
  return pool ??= new QualificationPool({worker:new URL(['..', 'qualification', 'worker.mjs'].join('/'), import.meta.url),
    concurrency:2, queue:8, maxBytes:16 * 1024 * 1024, deadlineMs:30_000})
}
