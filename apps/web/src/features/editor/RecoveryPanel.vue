<script setup lang="ts">
import {ref} from 'vue'
import type {RecoverySummary} from '../../drafts/recovery-store'
import {inventoryBrowserStorage, type BrowserStorageInventory} from '../../drafts/browser-inventory'
const props = defineProps<{records:readonly RecoverySummary[]; listIssue:string; status:string; deleteStatus:string; deleteBusy:boolean; backupIssue:string; readOnlyMessage:string}>()
const emit = defineEmits<{restore:[record:RecoverySummary]; remove:[record:RecoverySummary]; download:[]; 'download-read-only':[]; 'download-copy':[record:RecoverySummary]; reopen:[file:File]; metadata:[files:File[]]}>()
const selected = ref('')
const inventory = ref<BrowserStorageInventory>()
const inventoryIssue = ref('')
const inventoryBusy = ref(false)
async function inspectStorage() {
  inventoryBusy.value = true; inventory.value = undefined; inventoryIssue.value = ''
  try {inventory.value = await inventoryBrowserStorage(indexedDB)}
  catch {inventoryIssue.value = 'Browser storage could not be inspected. Existing data has not been changed.'}
  finally {inventoryBusy.value = false}
}
function displayCount(count:number | null) {return count === null ? 'not found' : String(count)}
function choose(event:Event, kind:'backup' | 'metadata') {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (kind === 'backup' && files[0]) emit('reopen', files[0])
  if (kind === 'metadata' && files.length) emit('metadata', files)
  input.value = ''
}
function selectedRecord() {return props.records.find(item => item.id === selected.value)}
function restore() {const record = selectedRecord(); if (record) emit('restore',record)}
function remove() {const record = selectedRecord(); if (record) emit('remove',record)}
function downloadCopy() {const record = selectedRecord(); if (record) emit('download-copy',record)}
</script>
<template>
  <section aria-labelledby="recovery-title">
    <h2 id="recovery-title" class="section-heading" tabindex="-1">Local recovery</h2>
    <p>Recovery keeps metadata, unfinished file listings and vocabulary input in this browser. Image files must be selected again for validation. It is not a server save or validation approval.</p>
    <p role="status">{{ status }}</p>
    <p v-if="deleteStatus" role="status">{{ deleteStatus }}</p>
    <div v-if="backupIssue">
      <p role="alert">{{ backupIssue }}</p>
      <p>Metadata export may be available; it is not an editable backup. Metadata export does not include image contents or unfinished input.</p>
      <p><a class="vf-link" href="#export">Open metadata export</a></p>
    </div>
    <p v-if="listIssue" role="alert">{{ listIssue }}</p>
    <p v-if="readOnlyMessage" role="alert">{{ readOnlyMessage }}</p>
    <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="inventoryBusy" @click="inspectStorage">Inspect browser storage</button>
    <div v-if="inventory" role="status">
      <p>Counts are from this browser and origin at different moments. This is not a backup and does not include server drafts or image files.</p>
      <ul><li>Recovery copies: {{ displayCount(inventory.recovery) }}</li><li>Pending account saves: {{ displayCount(inventory.pendingSaves) }}</li><li>Pending history restores: {{ displayCount(inventory.pendingRestores) }}</li></ul>
    </div>
    <p v-if="inventoryIssue" role="alert">{{ inventoryIssue }}</p>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('download')">Download editable backup</button>
    <button v-if="readOnlyMessage" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="emit('download-read-only')">Download read-only backup</button>
    <div class="vf-form__item"><label class="vf-form__label" for="backup-input">Open a full backup</label><input id="backup-input" type="file" accept="application/json,.json" @change="choose($event, 'backup')" /></div>
    <div class="vf-form__item"><label class="vf-form__label" for="metadata-input">Import metadata files</label><p>Select the RO-Crate descriptor and any associated metadata files. Image payloads are not imported.</p><input id="metadata-input" type="file" multiple accept=".json,.jsonld,.tsv,.csv,.txt" @change="choose($event, 'metadata')" /></div>
    <div v-if="records.length" class="vf-form__item">
      <label class="vf-form__label" for="recovery-copy">Available recovery copy</label>
      <select id="recovery-copy" v-model="selected" class="vf-form__select">
        <option value="">Choose a copy</option>
        <option v-for="record in records" :key="record.id" :value="record.id">{{ new Date(record.savedAt).toLocaleString() }} — {{ record.id.slice(0, 8) }}</option>
      </select>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="!selected" @click="downloadCopy">Download selected copy</button>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="!selected" @click="restore">Restore selected copy</button>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="!selected || deleteBusy" @click="remove">Delete selected copy</button>
    </div>
  </section>
</template>
