<script setup lang="ts">
import type {ValidationStatus} from './coordinator'
const props = defineProps<{status: ValidationStatus; missingPayload: number; listedPayload: number}>()
const emit = defineEmits<{selection: [files: ReadonlyMap<string, Blob>]; continue: []}>()
function select(event: Event) {
  const input = event.target as HTMLInputElement
  const files = new Map<string, Blob>()
  for (const file of Array.from(input.files ?? [])) {
    const path = file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name
    if (files.has(path)) {emit('selection', new Map()); return}
    files.set(path, file)
  }
  emit('selection', files)
}
</script>

<template>
  <section class="study-section" aria-labelledby="validation-title">
    <h2 id="validation-title" class="section-heading" tabindex="-1">Validate crate</h2>
    <p>Select payload files to check their presence alongside the current metadata. Files remain on this device.</p>
    <div class="vf-form__item"><label class="vf-form__label" for="validation-payload">Payload files</label><input id="validation-payload" class="vf-form__input" type="file" multiple @change="select" /></div>
    <div class="vf-form__item"><label class="vf-form__label" for="validation-directory">Or select a payload folder</label><input id="validation-directory" class="vf-form__input" type="file" multiple v-bind="{webkitdirectory: ''}" @change="select" /></div>
    <p role="status">Validation: {{ props.status.state }}<span v-if="props.status.message"> — {{ props.status.message }}</span></p>
    <p v-if="!props.listedPayload">No payload files are listed in this draft. Physical storage and remote staging are not checked.</p>
    <p v-else-if="props.missingPayload">{{ props.missingPayload }} listed payload file(s) are not in the current selection. Physical storage and remote staging are not checked.</p>
    <p v-else>All listed payload names are in the current selection. Physical storage and remote staging are not checked.</p>
    <p>Validation checks the metadata; it does not establish submission readiness.</p>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" :disabled="!props.status.eligible" @click="emit('continue')">Continue</button>
  </section>
</template>
