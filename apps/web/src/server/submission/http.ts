import type {Pool} from 'pg';
import {qualifySavedVersion} from '../qualification/saved.js';
import {decodeFrozenSelection} from '../qualification/frozen.js';
import {digestFrozenFiles, matchesSavedVersion} from '../qualification/index.js';
import {claimSubmission, findSubmission, listSubmissions, type SubmissionRecord} from './store.js';
import {dispatchSubmission} from './transport.js';
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const postPath = new RegExp(`^/api/local/drafts/(${uuid})/versions/(${uuid})/submission$`, 'i');
const reconcilePath = new RegExp(`^/api/local/drafts/(${uuid})/submission/reconcile$`, 'i');
const getPath = new RegExp(`^/api/local/drafts/(${uuid})/submission$`, 'i');
const present = ({payload: _payload, receiverOrigin: _receiverOrigin, ...record}:SubmissionRecord) => record;

export async function handleSubmissionRequest(request:Request, url:URL, origin:URL, database:Pool, owner:{issuer:string;subject:string}, destination?:string):Promise<Response> {
  if (request.method === 'GET' && url.pathname === '/api/local/submissions') {
    const operations = await listSubmissions(database,owner);
    return Response.json({owner:JSON.stringify([owner.issuer,owner.subject]), operations});
  }
  const reconcile = reconcilePath.exec(url.pathname);
  if (request.method === 'POST' && reconcile) {
    if (request.headers.get('origin') !== origin.origin) return new Response(null,{status:403});
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return new Response(null,{status:415});
    let body:unknown;
    try {
      const reader=request.body?.getReader(), chunks:Uint8Array[]=[]; let size=0;
      if (reader) for (;;) {const {value,done}=await reader.read(); if(done) break; size+=value.byteLength; if(size>4096) {void reader.cancel(); return new Response(null,{status:413});} chunks.push(value);}
      body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    } catch {return new Response(null,{status:400});}
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'owner' || typeof (body as {owner?:unknown}).owner !== 'string') return new Response(null,{status:400});
    if ((body as {owner:string}).owner !== JSON.stringify([owner.issuer,owner.subject])) return Response.json({error:'owner-mismatch'},{status:409});
    const operation=await findSubmission(database,owner,reconcile[1]);
    if (!operation) return new Response(null,{status:404});
    if (!destination) return new Response(null,{status:503});
    try {return Response.json({operation:present(await dispatchSubmission(database,operation,destination))});}
    catch {return new Response(null,{status:503});}
  }
  const get = getPath.exec(url.pathname);
  if (request.method === 'GET' && get) {
    const owned = await database.query('SELECT 1 FROM draft_store.drafts WHERE id=$1 AND issuer=$2 AND subject=$3',[get[1],owner.issuer,owner.subject]);
    if (!owned.rowCount) return new Response(null,{status:404});
    const operation = await findSubmission(database,owner,get[1]);
    return Response.json({operation:operation ? present(operation) : null});
  }
  const match = postPath.exec(url.pathname);
  if (request.method !== 'POST' || !match) return new Response(null,{status:404});
  if (request.headers.get('origin') !== origin.origin) return new Response(null,{status:403});
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return new Response(null,{status:415});
  let input:unknown;
  try {
    const reader=request.body?.getReader(); const chunks:Uint8Array[]=[]; let size=0;
    if (reader) for (;;) {const {value,done}=await reader.read(); if(done) break; size+=value.byteLength; if(size>4096) {void reader.cancel(); return new Response(null,{status:413});} chunks.push(value);}
    input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  } catch {return new Response(null,{status:400});}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return new Response(null,{status:400});
  const body=input as Record<string,unknown>;
  if (Object.keys(body).sort().join(',') !== 'key,owner' || typeof body.key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(body.key) || typeof body.owner !== 'string') return new Response(null,{status:400});
  if (body.owner !== JSON.stringify([owner.issuer,owner.subject])) return Response.json({error:'owner-mismatch'},{status:409});
  if (!destination) return new Response(null,{status:503});
  const qualification=await qualifySavedVersion(database,owner,match[1],match[2],request.signal);
  if (!qualification) return new Response(null,{status:404});
  if (qualification.status !== 'valid') return Response.json({qualification},{status:422});
  const saved=await database.query<{payload:string;frozen:unknown;content_hash:string}>(`SELECT v.payload,v.frozen,v.content_hash FROM draft_store.drafts d JOIN draft_store.versions v ON v.draft_id=d.id WHERE d.id=$1 AND d.issuer=$2 AND d.subject=$3 AND v.id=$4`,[match[1],owner.issuer,owner.subject,match[2]]);
  if (!saved.rowCount) return new Response(null,{status:404});
  const selection=decodeFrozenSelection(saved.rows[0].payload,saved.rows[0].frozen);
  if (selection.status !== 'selected' || !matchesSavedVersion(qualification,{versionId:match[2],contentHash:saved.rows[0].content_hash},digestFrozenFiles(selection.files))) return new Response(null,{status:422});
  const files=[...selection.files].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([path,bytes]) => ({path,base64:Buffer.from(bytes).toString('base64')}));
  try {
    const operation=await claimSubmission(database,{owner,draftId:match[1],versionId:match[2],contentHash:saved.rows[0].content_hash,qualificationDigest:qualification.digest,requestKey:body.key,destination,files});
    return Response.json({operation:present(await dispatchSubmission(database,operation,destination))});
  } catch (error) {
    if (error instanceof Error && error.message === 'payload too large') return new Response(null,{status:413});
    if (error instanceof Error && error.message === 'receiver configuration mismatch') return Response.json({error:'receiver-mismatch'},{status:409});
    if (error instanceof Error && error.message === 'submission conflict') return new Response(null,{status:409});
    if (error instanceof Error && error.message === 'draft unavailable') return new Response(null,{status:404});
    return new Response(null,{status:503});
  }
}
