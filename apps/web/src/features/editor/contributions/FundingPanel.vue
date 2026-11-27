<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityField, ContributionKind, StudyRelationship} from '@bijux/ro-crate-creator'
const props = defineProps<{view: DraftView; entityText:(id:string, field:string, fallback:string) => string}>()
const emit = defineEmits<{change: [change: DraftChange, raw?:string]; add: [kind: ContributionKind, relationship?: StudyRelationship]}>()
const grants = computed(() => props.view.entities.filter(entity => entity.kind === 'grant'))
const bodies = computed(() => props.view.entities.filter(entity => entity.kind === 'funding-body'))
function setField(id: string, field: EntityField, event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('change', {type: 'set-field', entityId: id, field, value: value || null}, value)
}
function toggleBody(grant: string, body: string, event: Event) {
  emit('change', {type: (event.target as HTMLInputElement).checked ? 'add-reference' : 'remove-reference', sourceId: grant, relationship: 'funder', targetId: body})
}
function usage(id: string): number {return grants.value.filter(grant => grant.references.funder?.includes(id)).length}
</script>
<template>
  <section id="funding" class="study-section" aria-labelledby="funding-title">
    <h2 class="section-heading" tabindex="-1" id="funding-title">Funding</h2><p>Add grants and funding bodies, then link each grant to its funder.</p>
    <h3>Funding bodies</h3><p v-if="!bodies.length">No funding bodies added yet.</p>
    <fieldset v-for="(body, index) in bodies" :key="body.id" class="contribution-record">
      <legend>Funding body {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`body-name-${body.id}`">Funding body name {{ index + 1 }}</label><input :id="`body-name-${body.id}`" class="vf-form__input" :value="entityText(body.id, 'name', body.name ?? '')" @input="setField(body.id, 'name', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`body-identifier-${body.id}`">Funding body identifier {{ index + 1 }}</label><input :id="`body-identifier-${body.id}`" class="vf-form__input" :value="entityText(body.id, 'identifier', body.identifier ?? '')" @input="setField(body.id, 'identifier', $event)" /></div>
      <p>Used by {{ usage(body.id) }} grant(s).</p>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete funding body ${index + 1}`" @click="emit('change', {type: 'delete-entity', entityId: body.id})">Delete funding body</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add', 'funding-body')">Add funding body</button>
    <h3>Grants</h3><p v-if="!grants.length">No grants added yet.</p>
    <fieldset v-for="(grant, index) in grants" :key="grant.id" class="contribution-record">
      <legend>Grant {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`grant-name-${grant.id}`">Grant name {{ index + 1 }}</label><input :id="`grant-name-${grant.id}`" class="vf-form__input" :value="entityText(grant.id, 'name', grant.name ?? '')" @input="setField(grant.id, 'name', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`grant-identifier-${grant.id}`">Grant identifier {{ index + 1 }}</label><input :id="`grant-identifier-${grant.id}`" class="vf-form__input" :value="entityText(grant.id, 'identifier', grant.identifier ?? '')" @input="setField(grant.id, 'identifier', $event)" /></div>
      <fieldset :aria-label="`Funding bodies for grant ${index + 1}`" class="reference-options"><legend>Funding bodies</legend><p v-if="!bodies.length">Add a funding body to link it here.</p><div v-for="body in bodies" :key="body.id"><label><input type="checkbox" :checked="grant.references.funder?.includes(body.id) ?? false" @change="toggleBody(grant.id, body.id, $event)" /> {{ body.name || 'Unnamed funding body' }} ({{ body.id }})</label></div></fieldset>
      <div class="record-actions"><button v-if="view.study?.references?.funding?.includes(grant.id)" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Unlink grant ${index + 1}`" @click="emit('change', {type: 'remove-reference', sourceId: './', relationship: 'funding', targetId: grant.id})">Unlink grant</button><button v-else type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Link grant ${index + 1}`" @click="emit('change', {type: 'add-reference', sourceId: './', relationship: 'funding', targetId: grant.id})">Link grant</button><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete grant ${index + 1}`" @click="emit('change', {type: 'delete-entity', entityId: grant.id})">Delete grant</button></div>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add', 'grant', 'funding')">Add grant</button>
  </section>
</template>
