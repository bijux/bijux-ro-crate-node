<script setup lang="ts">
import {ref} from 'vue'
import type {LocalDraft} from './api'
const props = defineProps<{available:boolean; signedIn:boolean; busy:boolean; status:string; pending:boolean; drafts:readonly LocalDraft[]; currentId:string | null}>()
const emit = defineEmits<{login:[]; logout:[]; save:[]; 'save-new':[]; refresh:[]; open:[id:string]; 'download-pending':[]; 'discard-pending':[]}>()
const selected = ref('')
function open() {if (props.drafts.some(draft => draft.draftId === selected.value)) emit('open', selected.value)}
</script>
<template>
  <section aria-labelledby="account-title">
    <h2 id="account-title" class="section-heading" tabindex="-1">Local account</h2>
    <p>This account uses a local reference service. Saved drafts contain metadata and pending file listings; select image files again for validation. This is not an archive submission.</p>
    <p role="status">{{ status }}</p>
    <button v-if="!available" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('refresh')">Retry local connection</button>
    <template v-if="available && !signedIn"><button type="button" class="vf-button vf-button--primary vf-button--sm app-button" :disabled="busy" @click="emit('login')">Sign in locally</button></template>
    <template v-if="available && signedIn">
      <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" :disabled="busy" @click="emit('save')">Save local draft</button>
      <button v-if="currentId" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('save-new')">Save as a new local draft</button>
      <button v-if="pending" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('download-pending')">Download pending save backup</button>
      <button v-if="pending" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('discard-pending')">Discard pending account save</button>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('refresh')">Refresh saved drafts</button>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('logout')">Sign out locally</button>
      <div v-if="drafts.length" class="vf-form__item"><label class="vf-form__label" for="account-draft">Saved local draft</label><select id="account-draft" v-model="selected" class="vf-form__select"><option value="">Choose a draft</option><option v-for="draft in drafts" :key="draft.draftId" :value="draft.draftId">{{ new Date(draft.savedAt).toLocaleString() }} — {{ draft.draftId.slice(0, 8) }}</option></select><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy || !selected" @click="open">Open saved local draft</button></div>
    </template>
  </section>
</template>
