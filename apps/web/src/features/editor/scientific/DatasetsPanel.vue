<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityKind, EntityView, IncomingReference} from '@bijux/ro-crate-creator'
import Dependents from './Dependents.vue'
import ReferenceOptions from './ReferenceOptions.vue'
import {displayName, recordId} from './records'
const props = defineProps<{view:DraftView; references:ReadonlyMap<string,readonly IncomingReference[]>}>()
const emit = defineEmits<{change:[change:DraftChange]; batch:[changes:readonly DraftChange[]]; add:[kind:EntityKind]}>()
const datasets = computed(() => props.view.entities.filter(entity => entity.kind === 'dataset'))
const specimens = computed(() => props.view.entities.filter(entity => entity.kind === 'specimen'))
function field(id: string, key: 'name' | 'description', event: Event) {emit('change',{type:'set-field',entityId:id,field:key,value:(event.target as HTMLInputElement).value || null})}
function chooseSpecimen(dataset: EntityView, event: Event) {
  const next = (event.target as HTMLSelectElement).value
  const current = dataset.references.associatedSpecimen?.[0]
  if (current === next || (!current && !next)) return
  const changes: DraftChange[] = []
  if (current) changes.push({type:'remove-reference',sourceId:dataset.id,relationship:'associatedSpecimen',targetId:current})
  if (next) changes.push({type:'add-reference',sourceId:dataset.id,relationship:'associatedSpecimen',targetId:next})
  emit('batch',changes)
}
</script>
<template>
  <section id="datasets" class="study-section" aria-labelledby="datasets-title">
    <h2 id="datasets-title" class="section-heading" tabindex="-1">Datasets</h2><p>Describe the specimen and protocols associated with each dataset.</p>
    <p v-if="!datasets.length">No datasets added yet.</p>
    <fieldset v-for="(dataset,index) in datasets" :id="recordId(dataset.id)" :key="dataset.id" class="contribution-record" tabindex="-1">
      <legend>Dataset {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`dataset-name-${index}`">Dataset name {{ index + 1 }}</label><input :id="`dataset-name-${index}`" class="vf-form__input" :value="dataset.name ?? ''" @input="field(dataset.id,'name',$event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`dataset-description-${index}`">Dataset description {{ index + 1 }}</label><textarea :id="`dataset-description-${index}`" class="vf-form__input" :value="dataset.description ?? ''" @input="field(dataset.id,'description',$event)"></textarea></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`dataset-specimen-${index}`">Specimen for dataset {{ index + 1 }}</label><select :id="`dataset-specimen-${index}`" class="vf-form__input" :value="dataset.references.associatedSpecimen?.[0] ?? ''" @change="chooseSpecimen(dataset,$event)"><option value="">Not selected</option><option v-for="specimen in specimens" :key="specimen.id" :value="specimen.id">{{ displayName(specimen,view) }}</option></select><p v-if="!specimens.length" class="vf-form__helper">Add a specimen in <a class="vf-link" href="#specimens">Specimens</a> to make it available here.</p></div>
      <ReferenceOptions :view="view" :source="dataset" relationship="associatedImageAcquisitionProtocol" target-kind="acquisition-protocol" :title="`Acquisition protocols for dataset ${index + 1}`" @change="emit('change',$event)" />
      <ReferenceOptions :view="view" :source="dataset" relationship="associatedSpecimenImagingPreparationProtocol" target-kind="preparation-protocol" :title="`Preparation protocols for dataset ${index + 1}`" @change="emit('change',$event)" />
      <Dependents :view="view" :references="references.get(dataset.id) ?? []" :label="`dataset ${index + 1}`" />
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete dataset ${index + 1}`" :disabled="(references.get(dataset.id)?.length ?? 0) > 0" @click="emit('change',{type:'delete-entity',entityId:dataset.id})">Delete dataset</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add','dataset')">Add dataset</button>
  </section>
</template>
