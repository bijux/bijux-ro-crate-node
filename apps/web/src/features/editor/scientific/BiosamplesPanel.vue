<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityKind, IncomingReference} from '@bijux/ro-crate-creator'
import Dependents from './Dependents.vue'
import {recordId, type ScientificSection} from './records'
const props = defineProps<{view:DraftView; references:ReadonlyMap<string,readonly IncomingReference[]>}>()
const emit = defineEmits<{change:[change:DraftChange]; add:[kind:EntityKind]; navigate:[section:ScientificSection, entityId:string | null]}>()
const samples = computed(() => props.view.entities.filter(entity => entity.kind === 'biosample'))
function field(id: string, key: 'name' | 'description', event: Event) {emit('change',{type:'set-field',entityId:id,field:key,value:(event.target as HTMLInputElement).value || null})}
</script>
<template>
  <section id="biosamples" class="study-section" aria-labelledby="biosamples-title">
    <h2 id="biosamples-title" class="section-heading" tabindex="-1">Biosamples</h2><p>Add the biological material used by specimens.</p>
    <p v-if="!samples.length">No biosamples added yet.</p>
    <fieldset v-for="(sample,index) in samples" :id="recordId(sample.id)" :key="sample.id" class="contribution-record" tabindex="-1">
      <legend>Biosample {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`sample-name-${index}`">Biosample name {{ index + 1 }}</label><input :id="`sample-name-${index}`" class="vf-form__input" :value="sample.name ?? ''" @input="field(sample.id,'name',$event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`sample-description-${index}`">Biosample description {{ index + 1 }}</label><textarea :id="`sample-description-${index}`" class="vf-form__input" :value="sample.description ?? ''" @input="field(sample.id,'description',$event)"></textarea></div>
      <Dependents :view="view" :references="references.get(sample.id) ?? []" :label="`biosample ${index + 1}`" @navigate="(section, id) => emit('navigate',section,id)" />
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete biosample ${index + 1}`" :disabled="(references.get(sample.id)?.length ?? 0) > 0" @click="emit('change',{type:'delete-entity',entityId:sample.id})">Delete biosample</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add','biosample')">Add biosample</button>
  </section>
</template>
