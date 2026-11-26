<script setup lang="ts">
import {fromDirectory} from '@bijux/ro-crate-core'
import {computed} from 'vue'
import type {Severity} from '@bijux/ro-crate-core'
import type {ValidationStatus} from './coordinator'
const props = defineProps<{status: ValidationStatus; missingPayload: number; listedPayload: number}>()
const emit = defineEmits<{selection: [files: ReadonlyMap<string, Blob>]; selectionError: [message: string]; continue: []}>()
const severities: readonly Severity[] = ['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG']
const result = computed(() => props.status.result)
function downloadReport() {
  if (!result.value) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(result.value, null, 2) + '\n'], {type: 'application/json'}))
  const link = document.createElement('a')
  link.href = url; link.download = 'validation-report.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
function select(event: Event) {
  const input = event.target as HTMLInputElement
  try {
    const chosen = Array.from(input.files ?? [])
    if (input.id === 'validation-directory') {emit('selection', fromDirectory(chosen)); return}
    const files = new Map<string, Blob>()
    for (const file of chosen) {
      if (files.has(file.name)) throw new Error(`Duplicate selected path: ${file.name}`)
      files.set(file.name, file)
    }
    emit('selection', files)
  } catch (error) {emit('selectionError', error instanceof Error ? error.message : 'Could not select payload files.')}
}
</script>

<template>
  <section class="study-section" aria-labelledby="validation-title">
    <h2 id="validation-title" class="section-heading" tabindex="-1">Validate crate</h2>
    <p>Select payload files to check their presence alongside the current metadata. Files remain on this device.</p>
    <div class="vf-form__item"><label class="vf-form__label" for="validation-payload">Payload files</label><input id="validation-payload" class="vf-form__input" type="file" multiple @change="select" /></div>
    <div class="vf-form__item"><label class="vf-form__label" for="validation-directory">Or select a payload folder</label><input id="validation-directory" class="vf-form__input" type="file" multiple v-bind="{webkitdirectory: ''}" @change="select" /></div>
    <p role="status">Validation: {{ props.status.state }}<span v-if="props.status.message"> — {{ props.status.message }}</span></p>
    <div v-if="result" aria-labelledby="findings-title">
      <h3 id="findings-title">Validation findings</h3>
      <p v-if="result.status === 'incomplete'">Validation stopped at {{ result.stage }}: {{ result.reason }}</p>
      <p>The default validator may stop after errors; this report does not imply that every check ran.</p>
      <section v-for="severity in severities" :key="severity">
        <h4>{{ severity }} ({{ result.report.issues[severity].length }})</h4>
        <ul v-if="result.report.issues[severity].length" class="vf-list">
          <li v-for="(issue, index) in result.report.issues[severity]" :key="index">
            <span>{{ issue.message }}</span><span v-if="issue.location_description"> — {{ issue.location_description }}</span>
          </li>
        </ul>
      </section>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="downloadReport">Download validation report</button>
    </div>
    <h3>Payload selection coverage</h3>
    <p v-if="!props.listedPayload">No payload files are listed in this draft. Physical storage and remote staging are not checked.</p>
    <p v-else-if="props.missingPayload">{{ props.missingPayload }} listed payload file(s) are not in the current selection. Physical storage and remote staging are not checked.</p>
    <p v-else>All listed payload names are in the current selection. Physical storage and remote staging are not checked.</p>
    <h3>Submission readiness</h3><p>Submission readiness is not configured.</p>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" :disabled="!props.status.eligible" @click="emit('continue')">Continue</button>
  </section>
</template>
