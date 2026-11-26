<script setup lang="ts">
import {onUnmounted, ref} from 'vue'
import type {LocalIdentity} from './api'
const props = defineProps<{identity:LocalIdentity; draftId:string; versionId:string}>()
const busy = ref(false), status = ref('')
let disposed = false
async function submit() {
  if (busy.value) return
  busy.value = true
  status.value = 'Checking the saved version and contacting the local reference receiver.'
  try {
    const owner = JSON.stringify([props.identity.issuer, props.identity.subject])
    const response = await fetch(`/api/local/drafts/${encodeURIComponent(props.draftId)}/versions/${encodeURIComponent(props.versionId)}/submission`, {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({key:crypto.randomUUID(),owner})
    })
    if (disposed) return
    if (response.status === 422) {
      status.value = 'This request could not be qualified. Checking the known local operation.'
      try {
        const existing = await fetch(`/api/local/drafts/${encodeURIComponent(props.draftId)}/submission`, {cache:'no-store'})
        if (!existing.ok) throw Error('Operation unavailable')
        const result = await existing.json() as {operation:{state:string; receiptId:string|null; observation:string; lastObservedAt:string|null}|null}
        if (disposed || owner !== JSON.stringify([props.identity.issuer,props.identity.subject])) return
        const observation = result.operation?.lastObservedAt ? `Last receiver observation: ${new Date(result.operation.lastObservedAt).toLocaleString()}.` : 'No receiver receipt has been observed.'
        const freshness = result.operation?.observation === 'unavailable' ? ` Receiver unavailable; ${observation.charAt(0).toLowerCase() + observation.slice(1)}` : ` ${observation}`
        status.value = result.operation?.receiptId
          ? `This request could not be qualified. Known local receipt: ${result.operation.receiptId}.${freshness}`
          : `This request could not be qualified. ${result.operation ? `Known local operation: ${result.operation.state}.${freshness}` : 'No local operation is recorded.'}`
      } catch {if (!disposed) status.value = 'This request could not be qualified. The known local operation could not be loaded.'}
      return
    }
    if (response.status === 413) {status.value = 'The selected metadata exceeds the local receiver limit. No operation was created by this request.'; return}
    if (response.status === 409) {status.value = 'A different version is already bound to this local submission, or your session changed.'; return}
    if (!response.ok) {status.value = 'Local submission is unavailable. Check the selected version and try again.'; return}
    const result = await response.json() as {operation:{state:string;receiptId:string|null;reason:string|null;observation:string;lastObservedAt:string|null}}
    if (disposed) return
    const operation=result.operation
    const observed=operation.lastObservedAt ? ` Last receiver observation: ${new Date(operation.lastObservedAt).toLocaleString()}.` : ' No receiver receipt has been observed.'
    status.value = operation.state === 'accepted'
      ? operation.observation === 'unavailable'
        ? `Receiver unavailable; last known local receipt: ${operation.receiptId}.${observed} This is not an archive accession.`
        : `Local reference receiver accepted this create: ${operation.receiptId}.${observed} This is not an archive accession.`
      : `Local reference outcome: ${operation.state}. ${operation.reason ?? 'Retry to reconcile with the same operation.'}${observed}`
  } catch {if (!disposed) status.value = 'Local submission outcome is unknown. Retry the selected saved version to reconcile.'}
  finally {if (!disposed) busy.value = false}
}
onUnmounted(() => {disposed = true})
</script>
<template>
  <div>
    <p>Send this saved version to the configured local reference fixture only. This does not submit to an archive.</p>
    <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="submit">Submit selected version to local reference</button>
    <p role="status">{{ status }}</p>
  </div>
</template>
