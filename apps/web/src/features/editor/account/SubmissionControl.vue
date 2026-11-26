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
        const result = await existing.json() as {operation:{state:string; receiptId:string|null}|null}
        if (disposed || owner !== JSON.stringify([props.identity.issuer,props.identity.subject])) return
        status.value = result.operation?.receiptId
          ? `This request could not be qualified. Known local receipt: ${result.operation.receiptId}.`
          : `This request could not be qualified. ${result.operation ? `Known local operation: ${result.operation.state}.` : 'No local operation is recorded.'}`
      } catch {if (!disposed) status.value = 'This request could not be qualified. The known local operation could not be loaded.'}
      return
    }
    if (response.status === 409) {status.value = 'A different version is already bound to this local submission, or your session changed.'; return}
    if (!response.ok) {status.value = 'Local submission is unavailable. Check the selected version and try again.'; return}
    const result = await response.json() as {operation:{state:string;receiptId:string|null;reason:string|null}}
    if (disposed) return
    status.value = result.operation.state === 'accepted'
      ? `Local reference receiver accepted this create: ${result.operation.receiptId}. This is not an archive accession.`
      : `Local reference outcome: ${result.operation.state}. ${result.operation.reason ?? 'Retry to reconcile with the same operation.'}`
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
