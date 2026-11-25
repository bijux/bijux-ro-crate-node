<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityField, ContributionKind, StudyRelationship, EntityView} from '@bijux/ro-crate-creator'

const props = defineProps<{view: DraftView}>()
const emit = defineEmits<{change: [change: DraftChange]; add: [kind: ContributionKind, relationship?: StudyRelationship]}>()
const authorIds = computed(() => props.view.study?.references?.author ?? [])
const people = computed(() => {
  const entries = props.view.entities.filter(entity => entity.kind === 'contributor')
  return [...authorIds.value.map(id => entries.find(entity => entity.id === id)).filter((entity): entity is EntityView => !!entity),
    ...entries.filter(entity => !authorIds.value.includes(entity.id))]
})
const affiliations = computed(() => props.view.entities.filter(entity => entity.kind === 'affiliation'))
function setField(id: string, field: EntityField, event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('change', {type: 'set-field', entityId: id, field, value: value || null})
}
function setRoles(id: string, event: Event) {
  const text = (event.target as HTMLInputElement).value
  emit('change', {type: 'set-roles', entityId: id, roles: text ? text.split(',').map(role => role.trim()) : []})
}
function toggleAffiliation(person: string, affiliation: string, event: Event) {
  emit('change', {type: (event.target as HTMLInputElement).checked ? 'add-reference' : 'remove-reference', sourceId: person, relationship: 'memberOf', targetId: affiliation})
}
function authorPosition(id: string): number {return authorIds.value.indexOf(id)}
</script>

<template>
  <section id="contributors" class="study-section" aria-labelledby="contributors-title">
    <h2 class="section-heading" tabindex="-1" id="contributors-title">Contributors and author order</h2>
    <p>Add the people who contributed to the study. Use the order controls to set the author sequence.</p>
    <p v-if="!people.length">No contributors added yet.</p>
    <fieldset v-for="(person, index) in people" :key="person.id" class="contribution-record">
      <legend>Contributor {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`person-name-${person.id}`">Contributor name {{ index + 1 }}</label><input :id="`person-name-${person.id}`" class="vf-form__input" :value="person.name ?? ''" @input="setField(person.id, 'name', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`person-email-${person.id}`">Email {{ index + 1 }}</label><input :id="`person-email-${person.id}`" class="vf-form__input" type="email" :value="person.email ?? ''" @input="setField(person.id, 'email', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`person-address-${person.id}`">Address {{ index + 1 }}</label><input :id="`person-address-${person.id}`" class="vf-form__input" :value="person.address ?? ''" @input="setField(person.id, 'address', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`person-website-${person.id}`">Website {{ index + 1 }}</label><input :id="`person-website-${person.id}`" class="vf-form__input" :value="person.website ?? ''" @input="setField(person.id, 'website', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`person-roles-${person.id}`">Roles {{ index + 1 }}</label><p class="vf-form__helper">Separate multiple roles with commas.</p><input :id="`person-roles-${person.id}`" class="vf-form__input" :value="person.role?.join(', ') ?? ''" @change="setRoles(person.id, $event)" /></div>
      <fieldset :aria-label="`Affiliations for contributor ${index + 1}`" class="reference-options">
        <legend>Affiliations</legend><p v-if="!affiliations.length">Add an affiliation below to link it here.</p>
        <div v-for="affiliation in affiliations" :key="affiliation.id"><label><input type="checkbox" :checked="person.references.memberOf?.includes(affiliation.id) ?? false" @change="toggleAffiliation(person.id, affiliation.id, $event)" /> {{ affiliation.name || 'Unnamed affiliation' }}</label></div>
      </fieldset>
      <div class="record-actions">
        <template v-if="authorPosition(person.id) >= 0">
          <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="authorPosition(person.id) === 0" :aria-label="`Move contributor ${index + 1} up`" @click="emit('change', {type: 'move-author', entityId: person.id, index: authorPosition(person.id) - 1})">Move up</button>
          <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="authorPosition(person.id) === authorIds.length - 1" :aria-label="`Move contributor ${index + 1} down`" @click="emit('change', {type: 'move-author', entityId: person.id, index: authorPosition(person.id) + 1})">Move down</button>
          <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Remove contributor ${index + 1} from author list`" @click="emit('change', {type: 'remove-reference', sourceId: './', relationship: 'author', targetId: person.id})">Remove from author list</button>
        </template>
        <button v-else type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Add contributor ${index + 1} to author list`" @click="emit('change', {type: 'add-reference', sourceId: './', relationship: 'author', targetId: person.id})">Add to author list</button>
        <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete contributor ${index + 1}`" @click="emit('change', {type: 'delete-entity', entityId: person.id})">Delete contributor</button>
      </div>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add', 'contributor', 'author')">Add contributor</button>
  </section>
</template>
