import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises'
import test from 'node:test'
import pg from 'pg'
import {createDraft, importCrate} from '@bijux/ro-crate-creator'
import {decodeRecovery, encodeRecovery} from '../../src/drafts/recovery-codec.js'
import {migrateDatabase} from '../../src/server/database/migrations.js'
import {admitRecovery} from '../../src/server/recovery/admission.js'

const image = 'postgres:17.12@sha256:87c8b42f423b45d5247e6aa8fdb2e7762fec164c68a50fe3eb07e7bfcaf4dbcf'
const docker = process.env.DOCKER ?? 'docker'
const run = (args:string[], input?:Buffer) => execFileSync(docker, args, {input, maxBuffer:20 * 1024 * 1024})

test('a private database archive restores synthetic drafts, history and pending operations', async () => {
  const suffix = randomUUID(), source = `bijux-backup-source-${suffix}`, destination = `bijux-backup-restore-${suffix}`
  const containers:string[] = [], pools:pg.Pool[] = []
  const archive = new URL(`../../../../artifacts/reference-backup/${suffix}.dump`, import.meta.url)
  try {
    for (const name of [source, destination]) {
      run(['run','-d','--rm','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_USER=authoring','-e','POSTGRES_PASSWORD=local-reference-only','-e','POSTGRES_DB=authoring',image])
      containers.push(name)
      for (let attempt = 0; ; attempt++) {
        try {run(['exec',name,'pg_isready','-U','authoring','-d','authoring']); break} catch {}
        if (attempt === 60) throw Error('Synthetic database did not start')
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      const binding = run(['port',name,'5432/tcp']).toString().trim()
      assert.match(binding, /^127\.0\.0\.1:[0-9]+$/)
      pools.push(new pg.Pool({host:'127.0.0.1', port:Number(binding.split(':')[1]), user:'authoring', password:'local-reference-only', database:'authoring'}))
    }
    const [original, restored] = pools
    await migrateDatabase(original)
    const readonly = await importCrate(new Map([['ro-crate-metadata.json',new Uint8Array([255])]]), {metadataPaths:['ro-crate-metadata.json']})
    assert.equal(readonly.status, 'read-only')
    if (readonly.status !== 'read-only') throw Error('Expected read-only fixture')
    const samples = [JSON.parse(encodeRecovery({draft:createDraft(), pending:[{id:'p:1',path:'images/raw.tif',size:'3'}]})), JSON.parse(encodeRecovery({readOnly:readonly, pending:[]}))]
    const saves:Array<{draft_id:string;version_id:string;content_hash:string}> = []
    for (const [index, sample] of samples.entries()) {
      const admitted = await admitRecovery(sample); assert.ok(admitted)
      const result = await original.query<{draft_id:string;version_id:string;content_hash:string}>('SELECT * FROM draft_store.save($1,$2,$3,$4,$5,$6,$7::jsonb)', ['fixture','owner',null,null,`save-${index}`,admitted.payload,JSON.stringify(admitted.frozen)])
      saves.push(result.rows[0])
    }
    const first = saves[0]
    await original.query('SELECT * FROM draft_store.restore($1,$2,$3,$4,$5,$6)', ['fixture','owner',first.draft_id,first.version_id,'restore',first.version_id])
    const operation = randomUUID()
    await original.query("INSERT INTO draft_store.submissions (operation_id,draft_id,version_id,content_hash,qualification_digest,receiver_origin,payload,state) VALUES ($1,$2,$3,$4,'synthetic','http://127.0.0.1:1234','fixture','uncertain')", [operation,first.draft_id,first.version_id,first.content_hash])
    await original.query('INSERT INTO draft_store.submission_requests (issuer,subject,request_key,operation_id) VALUES ($1,$2,$3,$4)', ['fixture','owner','submit',operation])
    const snapshot = async (pool:pg.Pool) => Promise.all(['drafts','versions','requests','submissions','submission_requests'].map(async table => (await pool.query(`SELECT * FROM draft_store.${table} t ORDER BY row_to_json(t)::text`)).rows))
    const expected = await snapshot(original)
    await mkdir(new URL('.', archive), {recursive:true})
    await writeFile(archive, run(['exec',source,'pg_dump','-U','authoring','-d','authoring','--format=custom']), {mode:0o600, flag:'wx'})
    assert.equal((await stat(archive)).mode & 0o077, 0, 'Synthetic archive must not be readable by other users')
    run(['exec','-i',destination,'pg_restore','-U','authoring','-d','authoring','--exit-on-error','--no-owner','--no-privileges'], await readFile(archive))
    await migrateDatabase(restored)
    assert.deepEqual(await snapshot(restored), expected)
    const restoredVersions = await restored.query<{payload:string}>('SELECT payload FROM draft_store.versions ORDER BY id')
    const states = await Promise.all(restoredVersions.rows.map(row => decodeRecovery(row.payload)))
    assert.ok(states.some(state => state.status === 'read-only'))
    assert.ok(states.some(state => state.status === 'decoded' && state.pending.length === 1))
  } finally {
    const cleanupErrors:unknown[] = []
    for (const pool of pools) {try {await pool.end()} catch (error) {cleanupErrors.push(error)}}
    for (const name of containers) {try {run(['rm','-f',name])} catch (error) {cleanupErrors.push(error)}}
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Synthetic backup services were not fully removed')
  }
})
