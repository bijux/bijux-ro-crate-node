<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityKind, EntityView, IncomingReference} from '@bijux/ro-crate-creator'
import Dependents from './Dependents.vue'
import TermControl from '../vocabulary/TermControl.vue'
import {recordId} from './records'
import {editableTermSlot, sameTermSlot, type PendingTerm, type TermSlot} from '../../../drafts/pending.js'
const props = defineProps<{view:DraftView; references:ReadonlyMap<string,readonly IncomingReference[]>; pendingTerms:readonly PendingTerm[]; entityText:(id:string, field:string, fallback:string) => string}>()
const emit = defineEmits<{change:[change:DraftChange, raw?:string]; add:[kind:EntityKind]; pending:[term:PendingTerm]; discard:[slot:TermSlot]; applyTerm:[change:DraftChange,slot:TermSlot]}>()
const samples = computed(() => props.view.entities.filter(entity => entity.kind === 'biosample'))
function taxa(sample:EntityView):EntityView[] {return (sample.references.organismClassification ?? []).filter(id => editableTermSlot(props.view,slot(sample.id,id))).flatMap(id => {const entity = props.view.entities.find(item => item.id === id && item.kind === 'taxon'); return entity ? [entity] : []})}
function identifier(id:string):string {const match = /^https?:\/\/purl\.obolibrary\.org\/obo\/NCBITaxon_(\d+)$/.exec(id); return match ? `NCBITaxon:${match[1]}` : id}
function slot(entityId:string, previousId:string | null):TermSlot {return {kind:'taxonomy',entityId,previousId}}
function pendingFor(current:TermSlot):PendingTerm | undefined {return props.pendingTerms.find(item => sameTermSlot(item,current))}
function edit(current:TermSlot, identifier:string, label:string, originalId:string, originalLabel:string) {if (identifier === originalId && label === originalLabel) emit('discard',current); else emit('pending',{...current,identifier,label})}
function field(id: string, key: 'name' | 'description', event: Event) {emit('change',{type:'set-field',entityId:id,field:key,value:(event.target as HTMLInputElement).value || null},(event.target as HTMLInputElement).value)}
</script>
<template>
  <section id="biosamples" class="study-section" aria-labelledby="biosamples-title">
    <h2 id="biosamples-title" class="section-heading" tabindex="-1">Biosamples</h2><p>Add the biological material used by specimens.</p>
    <p v-if="!samples.length">No biosamples added yet.</p>
    <fieldset v-for="(sample,index) in samples" :id="recordId(sample.id)" :key="sample.id" class="contribution-record" tabindex="-1">
      <legend>Biosample {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`sample-name-${index}`">Biosample name {{ index + 1 }}</label><input :id="`sample-name-${index}`" class="vf-form__input" :value="entityText(sample.id, 'name', sample.name ?? '')" @input="field(sample.id,'name',$event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`sample-description-${index}`">Biosample description {{ index + 1 }}</label><textarea :id="`sample-description-${index}`" class="vf-form__input" :value="entityText(sample.id, 'description', sample.description ?? '')" @input="field(sample.id,'description',$event)"></textarea></div>
      <div v-for="(taxon,termIndex) in taxa(sample)" :key="taxon.id">
        <p>This Taxon record is referenced by {{ (references.get(taxon.id) ?? []).length }} known biosample(s). Changing its label affects every reference; imported metadata may contain other references.</p>
        <TermControl :document="view" kind="taxonomy" :control-id="`organism-${index}-${termIndex}`" :title="`Organism ${termIndex + 1} for biosample ${index + 1}`" :identifier="identifier(taxon.id)" :label="taxon.scientificName ?? ''" :disabled="pendingTerms.length >= 1000 && !pendingFor(slot(sample.id,taxon.id))" :pending="pendingFor(slot(sample.id,taxon.id))" @edit="(id,label) => edit(slot(sample.id,taxon.id),id,label,identifier(taxon.id),taxon.scientificName ?? '')" @discard="emit('discard',slot(sample.id,taxon.id))" @assign="(id,label) => emit('applyTerm',{type:'assign-organism',entityId:sample.id,previousId:taxon.id,identifier:id,label},slot(sample.id,taxon.id))" />
      </div>
      <TermControl :document="view" :key="`${sample.id}-${taxa(sample).length}`" kind="taxonomy" :control-id="`organism-new-${index}`" :title="`Add organism to biosample ${index + 1}`" identifier="" label="" :disabled="pendingTerms.length >= 1000 && !pendingFor(slot(sample.id,null))" :pending="pendingFor(slot(sample.id,null))" @edit="(id,label) => edit(slot(sample.id,null),id,label,'','')" @discard="emit('discard',slot(sample.id,null))" @assign="(id,label) => emit('applyTerm',{type:'assign-organism',entityId:sample.id,previousId:null,identifier:id,label},slot(sample.id,null))" />
      <Dependents :view="view" :references="references.get(sample.id) ?? []" :label="`biosample ${index + 1}`" />
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete biosample ${index + 1}`" :disabled="(references.get(sample.id)?.length ?? 0) > 0" @click="emit('change',{type:'delete-entity',entityId:sample.id})">Delete biosample</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add','biosample')">Add biosample</button>
  </section>
</template>
