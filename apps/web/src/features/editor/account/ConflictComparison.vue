<script setup lang="ts">
import {computed} from 'vue'
import type {AttemptComparison, RecoveryComparison} from './comparison'
const props = defineProps<{comparison:AttemptComparison; busy:boolean}>()
const emit = defineEmits<{recover:[]; 'open-head':[]; 'save-copy':[]; 'download-current':[]; 'download-head':[]; close:[]}>()
const sections = computed(() => [
  {label:'Retained save compared with current work', value:props.comparison.currentChanges},
  ...(props.comparison.headChanges ? [{label:'Retained save compared with confirmed server revision', value:props.comparison.headChanges}] : []),
])
function rows(value:RecoveryComparison) {
  if (value.status !== 'compared') return []
  return [...value.study, ...value.records, ...value.files, ...value.pending]
}
function omitted(value:RecoveryComparison) {return value.status === 'compared' ? value.recordsOmitted + value.filesOmitted + value.pendingOmitted : 0}
</script>
<template>
  <section aria-labelledby="conflict-title" class="vf-box vf-box--easy">
    <h3 id="conflict-title">Compare the retained save</h3>
    <p v-if="comparison.attempt.expectedHead">The retained save expected revision <code>{{ comparison.attempt.expectedHead }}</code>.</p>
    <p v-else>The retained save began a new draft. Its outcome is not yet confirmed; retrying uses the same request key.</p>
    <p v-if="comparison.head">Confirmed server revision <code>{{ comparison.head.versionId }}</code>, saved <time>{{ comparison.head.savedAt }}</time> (UTC).</p>
    <p v-else>No server draft identifier is known for this attempt.</p>
    <div v-for="section in sections" :key="section.label">
      <h4>{{ section.label }}</h4>
      <p v-if="section.value.status === 'unavailable'">{{ section.value.reason }}</p>
      <template v-else>
        <ul v-if="rows(section.value).length"><li v-for="(line, index) in rows(section.value)" :key="index">{{ line }}</li></ul>
        <p v-else>No changes in the displayed fields.</p>
        <p v-if="omitted(section.value)">{{ omitted(section.value) }} more changes are not displayed.</p>
        <p v-if="section.value.additionalPending">Other pending input is included in the full backups.</p>
      </template>
    </div>
    <p>Only a bounded summary is shown. Download full backups to inspect opaque metadata and every change. Frozen metadata is not validation approval.</p>
    <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('download-current')">Download current work backup</button>
    <button v-if="comparison.head" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('download-head')">Download confirmed server backup</button>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" :disabled="busy || comparison.retained.status !== 'decoded'" @click="emit('recover')">Recover retained save as new local draft</button>
    <button v-if="comparison.head" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy || comparison.head.decoded.status !== 'decoded'" @click="emit('open-head')">Open confirmed server revision</button>
    <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('save-copy')">Save current work as a copy</button>
    <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="busy" @click="emit('close')">Close comparison</button>
  </section>
</template>
