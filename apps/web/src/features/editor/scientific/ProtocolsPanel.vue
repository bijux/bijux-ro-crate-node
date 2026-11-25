<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityField, EntityKind, IncomingReference} from '@bijux/ro-crate-creator'
import Dependents from './Dependents.vue'
import {recordId, type ScientificSection} from './records'
const props = defineProps<{view:DraftView; references:ReadonlyMap<string,readonly IncomingReference[]>}>()
const emit = defineEmits<{change:[change:DraftChange]; add:[kind:EntityKind]; navigate:[section:ScientificSection, entityId:string | null]}>()
const preparations = computed(() => props.view.entities.filter(entity => entity.kind === 'preparation-protocol'))
const acquisitions = computed(() => props.view.entities.filter(entity => entity.kind === 'acquisition-protocol'))
function field(id: string, key: EntityField, event: Event) {emit('change',{type:'set-field',entityId:id,field:key,value:(event.target as HTMLInputElement).value || null})}
</script>
<template>
  <section id="protocols" class="study-section" aria-labelledby="protocols-title">
    <h2 id="protocols-title" class="section-heading" tabindex="-1">Protocols</h2><p>Preparation and acquisition protocols can be shared across records.</p>
    <h3>Preparation protocols</h3><p v-if="!preparations.length">No preparation protocols added yet.</p>
    <fieldset v-for="(protocol,index) in preparations" :id="recordId(protocol.id)" :key="protocol.id" class="contribution-record" tabindex="-1">
      <legend>Preparation protocol {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`prep-name-${index}`">Preparation protocol name {{ index + 1 }}</label><input :id="`prep-name-${index}`" class="vf-form__input" :value="protocol.name ?? ''" @input="field(protocol.id,'name',$event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`prep-description-${index}`">Preparation protocol description {{ index + 1 }}</label><textarea :id="`prep-description-${index}`" class="vf-form__input" :value="protocol.description ?? ''" @input="field(protocol.id,'description',$event)"></textarea></div>
      <Dependents :view="view" :references="references.get(protocol.id) ?? []" :label="`preparation protocol ${index + 1}`" @navigate="(section, id) => emit('navigate',section,id)" />
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete preparation protocol ${index + 1}`" :disabled="(references.get(protocol.id)?.length ?? 0) > 0" @click="emit('change',{type:'delete-entity',entityId:protocol.id})">Delete preparation protocol</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add','preparation-protocol')">Add preparation protocol</button>
    <h3>Acquisition protocols</h3><p v-if="!acquisitions.length">No acquisition protocols added yet.</p>
    <fieldset v-for="(protocol,index) in acquisitions" :id="recordId(protocol.id)" :key="protocol.id" class="contribution-record" tabindex="-1">
      <legend>Acquisition protocol {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`acquisition-name-${index}`">Acquisition protocol name {{ index + 1 }}</label><input :id="`acquisition-name-${index}`" class="vf-form__input" :value="protocol.name ?? ''" @input="field(protocol.id,'name',$event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`acquisition-description-${index}`">Acquisition protocol description {{ index + 1 }}</label><textarea :id="`acquisition-description-${index}`" class="vf-form__input" :value="protocol.description ?? ''" @input="field(protocol.id,'description',$event)"></textarea></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`acquisition-instrument-${index}`">Imaging instrument {{ index + 1 }}</label><input :id="`acquisition-instrument-${index}`" class="vf-form__input" :value="protocol.imagingInstrumentDescription ?? ''" @input="field(protocol.id,'imagingInstrumentDescription',$event)" /></div>
      <Dependents :view="view" :references="references.get(protocol.id) ?? []" :label="`acquisition protocol ${index + 1}`" @navigate="(section, id) => emit('navigate',section,id)" />
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete acquisition protocol ${index + 1}`" :disabled="(references.get(protocol.id)?.length ?? 0) > 0" @click="emit('change',{type:'delete-entity',entityId:protocol.id})">Delete acquisition protocol</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add','acquisition-protocol')">Add acquisition protocol</button>
  </section>
</template>
