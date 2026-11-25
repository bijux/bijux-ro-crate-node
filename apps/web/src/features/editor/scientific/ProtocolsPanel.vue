<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityField, EntityKind, IncomingReference} from '@bijux/ro-crate-creator'
import Dependents from './Dependents.vue'
import TermControl from '../vocabulary/TermControl.vue'
import {recordId} from './records'
import {sameTermSlot, type PendingTerm, type TermSlot} from '../../../drafts/pending.js'
const props = defineProps<{view:DraftView; references:ReadonlyMap<string,readonly IncomingReference[]>; pendingTerms:readonly PendingTerm[]}>()
const emit = defineEmits<{change:[change:DraftChange]; add:[kind:EntityKind]; pending:[term:PendingTerm]; discard:[slot:TermSlot]; applyTerm:[change:DraftChange,slot:TermSlot]}>()
const preparations = computed(() => props.view.entities.filter(entity => entity.kind === 'preparation-protocol'))
const acquisitions = computed(() => props.view.entities.filter(entity => entity.kind === 'acquisition-protocol'))
function slot(entityId:string, previousId:string | null):TermSlot {return {kind:'imaging',entityId,previousId}}
function pendingFor(current:TermSlot):PendingTerm | undefined {return props.pendingTerms.find(item => sameTermSlot(item,current))}
function edit(current:TermSlot, identifier:string, label:string, originalId:string, originalLabel:string) {if (identifier === originalId && label === originalLabel) emit('discard',current); else emit('pending',{...current,identifier,label})}
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
      <Dependents :view="view" :references="references.get(protocol.id) ?? []" :label="`preparation protocol ${index + 1}`" />
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete preparation protocol ${index + 1}`" :disabled="(references.get(protocol.id)?.length ?? 0) > 0" @click="emit('change',{type:'delete-entity',entityId:protocol.id})">Delete preparation protocol</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add','preparation-protocol')">Add preparation protocol</button>
    <h3>Acquisition protocols</h3><p v-if="!acquisitions.length">No acquisition protocols added yet.</p>
    <fieldset v-for="(protocol,index) in acquisitions" :id="recordId(protocol.id)" :key="protocol.id" class="contribution-record" tabindex="-1">
      <legend>Acquisition protocol {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`acquisition-name-${index}`">Acquisition protocol name {{ index + 1 }}</label><input :id="`acquisition-name-${index}`" class="vf-form__input" :value="protocol.name ?? ''" @input="field(protocol.id,'name',$event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`acquisition-description-${index}`">Acquisition protocol description {{ index + 1 }}</label><textarea :id="`acquisition-description-${index}`" class="vf-form__input" :value="protocol.description ?? ''" @input="field(protocol.id,'description',$event)"></textarea></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`acquisition-instrument-${index}`">Imaging instrument {{ index + 1 }}</label><input :id="`acquisition-instrument-${index}`" class="vf-form__input" :value="protocol.imagingInstrumentDescription ?? ''" @input="field(protocol.id,'imagingInstrumentDescription',$event)" /></div>
      <div v-if="(protocol.fbbiId?.length ?? 0) > 1 || (protocol.imagingMethodName?.length ?? 0) > 1">
        <p>This protocol contains multiple independent imaging identifiers or names. They are preserved; this editor cannot infer their pairings or replace them.</p>
        <p>Identifiers: {{ (protocol.fbbiId ?? []).join(', ') || 'none' }}</p><p>Names: {{ (protocol.imagingMethodName ?? []).join(', ') || 'none' }}</p>
      </div>
      <TermControl :document="view" v-else kind="imaging" :control-id="`imaging-${index}`" :title="`Imaging method for acquisition protocol ${index + 1}`" :identifier="protocol.fbbiId?.[0] ?? ''" :label="protocol.imagingMethodName?.[0] ?? ''" :disabled="pendingTerms.length >= 1000 && !pendingFor(slot(protocol.id,null))" :pending="pendingFor(slot(protocol.id,null))" @edit="(id,label) => edit(slot(protocol.id,null),id,label,protocol.fbbiId?.[0] ?? '',protocol.imagingMethodName?.[0] ?? '')" @discard="emit('discard',slot(protocol.id,null))" @assign="(id,label) => emit('applyTerm',{type:'assign-imaging-method',entityId:protocol.id,identifier:id,label},slot(protocol.id,null))" />
      <Dependents :view="view" :references="references.get(protocol.id) ?? []" :label="`acquisition protocol ${index + 1}`" />
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete acquisition protocol ${index + 1}`" :disabled="(references.get(protocol.id)?.length ?? 0) > 0" @click="emit('change',{type:'delete-entity',entityId:protocol.id})">Delete acquisition protocol</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add','acquisition-protocol')">Add acquisition protocol</button>
  </section>
</template>
