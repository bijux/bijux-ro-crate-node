<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityKind, IncomingReference} from '@bijux/ro-crate-creator'
import Dependents from './Dependents.vue'
import ReferenceOptions from './ReferenceOptions.vue'
import {recordId} from './records'
const props = defineProps<{view:DraftView; references:ReadonlyMap<string,readonly IncomingReference[]>; entityText:(id:string, field:string, fallback:string) => string}>()
const emit = defineEmits<{change:[change:DraftChange, raw?:string]; add:[kind:EntityKind]}>()
const specimens = computed(() => props.view.entities.filter(entity => entity.kind === 'specimen'))
function label(id: string, event: Event) {emit('change',{type:'set-label',entityId:id,value:(event.target as HTMLInputElement).value || null},(event.target as HTMLInputElement).value)}
</script>
<template>
  <section id="specimens" class="study-section" aria-labelledby="specimens-title">
    <h2 id="specimens-title" class="section-heading" tabindex="-1">Specimens</h2><p>Link each specimen to its biosamples and preparation protocols.</p>
    <p v-if="!specimens.length">No specimens added yet.</p>
    <fieldset v-for="(specimen,index) in specimens" :id="recordId(specimen.id)" :key="specimen.id" class="contribution-record" tabindex="-1">
      <legend>Specimen {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`specimen-label-${index}`">Specimen label {{ index + 1 }}</label><p :id="`specimen-label-help-${index}`" class="vf-form__helper">For this draft; the label is not included in metadata export.</p><input :id="`specimen-label-${index}`" :aria-describedby="`specimen-label-help-${index}`" class="vf-form__input" :value="entityText(specimen.id, 'label', specimen.label ?? '')" @input="label(specimen.id,$event)" /></div>
      <ReferenceOptions :view="view" :source="specimen" relationship="biologicalEntity" target-kind="biosample" :title="`Biosamples for specimen ${index + 1}`" @change="emit('change',$event)" />
      <ReferenceOptions :view="view" :source="specimen" relationship="imagingPreparationProtocol" target-kind="preparation-protocol" :title="`Preparation protocols for specimen ${index + 1}`" @change="emit('change',$event)" />
      <Dependents :view="view" :references="references.get(specimen.id) ?? []" :label="`specimen ${index + 1}`" />
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete specimen ${index + 1}`" :disabled="(references.get(specimen.id)?.length ?? 0) > 0" @click="emit('change',{type:'delete-entity',entityId:specimen.id})">Delete specimen</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add','specimen')">Add specimen</button>
  </section>
</template>
