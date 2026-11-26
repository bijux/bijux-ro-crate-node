<script setup lang="ts">
import {onMounted, onUnmounted, ref, shallowRef, watch} from 'vue'
import type {LocalIdentity} from './api'
interface Operation {
  draftId:string; versionId:string; operationId:string; state:'prepared'|'uncertain'|'accepted'|'rejected';
  receiptId:string|null; preparedAt:string; lastObservedAt:string|null; observation:'none'|'available'|'unavailable'; reason:string|null
}
const props=defineProps<{identity:LocalIdentity; reset:number}>()
const emit=defineEmits<{select:[draftId:string,versionId:string]; 'session-changed':[]}>()
const operations=shallowRef<Operation[]>([]), status=ref(''), busy=ref(false)
let generation=0, disposed=false
const owner=() => JSON.stringify([props.identity.issuer,props.identity.subject])
const active=(token:number, principal:string) => !disposed && token===generation && owner()===principal
async function ensureSession(token:number, principal:string) {
  const response=await fetch('/api/local/session',{cache:'no-store'})
  if (!response.ok) {if ([401,403].includes(response.status) && active(token,principal)) {operations.value=[]; emit('session-changed')} throw Error('Session unavailable')}
  const identity=await response.json() as LocalIdentity
  if (JSON.stringify([identity.issuer,identity.subject]) !== principal) {if (active(token,principal)) {operations.value=[]; emit('session-changed')} throw Error('Session changed')}
}
async function refresh() {
  const token=++generation, principal=owner(); busy.value=true
  try {
    const response=await fetch('/api/local/submissions',{cache:'no-store'})
    if (!response.ok) {if ([401,403].includes(response.status) && active(token,principal)) {operations.value=[]; emit('session-changed')} throw Error('Unavailable')}
    const result=await response.json() as {owner:string; operations:Operation[]}
    if (result.owner !== principal) {if (active(token,principal)) {operations.value=[]; emit('session-changed')} throw Error('Session changed')}
    await ensureSession(token,principal)
    if (active(token,principal)) {operations.value=result.operations; status.value='Local operations loaded. Receiver observations are only updated when checked.'}
  } catch {if (active(token,principal)) status.value='Local operations could not be loaded. Sign in again or retry.'}
  finally {if (active(token,principal)) busy.value=false}
}
async function reconcile(operation:Operation) {
  const token=++generation, principal=owner(); busy.value=true
  try {
    const response=await fetch(`/api/local/drafts/${encodeURIComponent(operation.draftId)}/submission/reconcile`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({owner:principal})})
    if (response.status===409) {
      const result=await response.json().catch(() => null) as {error?:unknown}|null
      if (result?.error==='owner-mismatch' && active(token,principal)) {operations.value=[]; status.value='The local account changed. Outcomes were cleared.'; emit('session-changed'); return}
    }
    if (!response.ok) {if ([401,403].includes(response.status) && active(token,principal)) {operations.value=[]; emit('session-changed')} throw Error('Unavailable')}
    const result=await response.json() as {operation:Omit<Operation,'draftId'>}
    await ensureSession(token,principal)
    if (active(token,principal)) {operations.value=operations.value.map(item=>item.operationId===operation.operationId ? {...result.operation,draftId:operation.draftId} : item); status.value='Local receiver check finished.'}
  } catch {if (active(token,principal)) status.value='The check could not be completed. The last known outcome remains unchanged.'}
  finally {if (active(token,principal)) busy.value=false}
}
watch(owner, () => {generation++; operations.value=[]; busy.value=false; void refresh()})
watch(() => props.reset, () => {generation++; operations.value=[]; busy.value=false; status.value='The local account changed. Outcomes were cleared.'}, {flush:'sync'})
onMounted(() => {void refresh()})
onUnmounted(() => {disposed=true; generation++})
</script>
<template>
  <section aria-labelledby="local-operations-title">
    <h4 id="local-operations-title">Local submission outcomes</h4>
    <p>These records belong to the local reference fixture. They are not archive submissions.</p>
    <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="refresh">Refresh local operations</button>
    <p role="status">{{ status }}</p>
    <p v-if="!operations.length && !busy">No local operations are shown.</p>
    <article v-for="operation in operations" :key="operation.operationId">
      <p>Saved version: {{ operation.versionId }}</p>
      <p>Outcome: {{ operation.state }}</p>
      <p v-if="operation.receiptId">Local receipt: {{ operation.receiptId }}</p>
      <p>Prepared: {{ new Date(operation.preparedAt).toLocaleString() }}</p>
      <p v-if="operation.lastObservedAt">Last receiver observation: {{ new Date(operation.lastObservedAt).toLocaleString() }}</p>
      <p v-else>No receiver receipt has been observed.</p>
      <p v-if="operation.observation === 'unavailable'">Receiver unavailable; the last known outcome is retained.</p>
      <p v-else>Receiver status is not live; check it explicitly for a new observation.</p>
      <p v-if="operation.reason">{{ operation.reason }}</p>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="emit('select',operation.draftId,operation.versionId)">View submitted version</button>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy || operation.state === 'rejected'" @click="reconcile(operation)">Check local receiver</button>
    </article>
  </section>
</template>
