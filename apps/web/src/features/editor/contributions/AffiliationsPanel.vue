<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityField, ContributionKind, StudyRelationship} from '@bijux/ro-crate-creator'
const props = defineProps<{view: DraftView}>()
const emit = defineEmits<{change: [change: DraftChange]; add: [kind: ContributionKind, relationship?: StudyRelationship]}>()
const affiliations = computed(() => props.view.entities.filter(entity => entity.kind === 'affiliation'))
function setField(id: string, field: EntityField, event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('change', {type: 'set-field', entityId: id, field, value: value || null})
}
function usage(id: string): number {return props.view.entities.filter(entity => entity.kind === 'contributor' && entity.references.memberOf?.includes(id)).length}
</script>
<template>
  <section id="affiliations" class="study-section" aria-labelledby="affiliations-title">
    <h2 class="section-heading" tabindex="-1" id="affiliations-title">Affiliations</h2><p>Affiliations can be shared by several contributors.</p>
    <p v-if="!affiliations.length">No affiliations added yet.</p>
    <fieldset v-for="(affiliation, index) in affiliations" :key="affiliation.id" class="contribution-record">
      <legend>Affiliation {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`affiliation-name-${affiliation.id}`">Affiliation name {{ index + 1 }}</label><input :id="`affiliation-name-${affiliation.id}`" class="vf-form__input" :value="affiliation.name ?? ''" @input="setField(affiliation.id, 'name', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`affiliation-address-${affiliation.id}`">Affiliation address {{ index + 1 }}</label><input :id="`affiliation-address-${affiliation.id}`" class="vf-form__input" :value="affiliation.address ?? ''" @input="setField(affiliation.id, 'address', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`affiliation-website-${affiliation.id}`">Affiliation website {{ index + 1 }}</label><input :id="`affiliation-website-${affiliation.id}`" class="vf-form__input" :value="affiliation.website ?? ''" @input="setField(affiliation.id, 'website', $event)" /></div>
      <p>Used by {{ usage(affiliation.id) }} contributor(s).</p>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete affiliation ${index + 1}`" @click="emit('change', {type: 'delete-entity', entityId: affiliation.id})">Delete affiliation</button>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add', 'affiliation')">Add affiliation</button>
  </section>
</template>
