<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityField, ContributionKind, StudyRelationship} from '@bijux/ro-crate-creator'
const props = defineProps<{view: DraftView}>()
const emit = defineEmits<{change: [change: DraftChange]; add: [kind: ContributionKind, relationship?: StudyRelationship]}>()
const publications = computed(() => props.view.entities.filter(entity => entity.kind === 'publication'))
function setField(id: string, field: EntityField, event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('change', {type: 'set-field', entityId: id, field, value: value || null})
}
</script>
<template>
  <section id="publications" class="study-section" aria-labelledby="publications-title">
    <h2 id="publications-title">Publications</h2><p>Add publications related to this study. Publication year is not editable here.</p>
    <p v-if="!publications.length">No publications added yet.</p>
    <fieldset v-for="(publication, index) in publications" :key="publication.id" class="contribution-record">
      <legend>Publication {{ index + 1 }}</legend>
      <div class="vf-form__item"><label class="vf-form__label" :for="`publication-title-${publication.id}`">Publication title {{ index + 1 }}</label><input :id="`publication-title-${publication.id}`" class="vf-form__input" :value="publication.name ?? ''" @input="setField(publication.id, 'name', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`publication-authors-${publication.id}`">Publication authors {{ index + 1 }}</label><input :id="`publication-authors-${publication.id}`" class="vf-form__input" :value="publication.authorNames ?? ''" @input="setField(publication.id, 'authorNames', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`publication-doi-${publication.id}`">Publication DOI {{ index + 1 }}</label><input :id="`publication-doi-${publication.id}`" class="vf-form__input" :value="publication.doi ?? ''" @input="setField(publication.id, 'doi', $event)" /></div>
      <div class="vf-form__item"><label class="vf-form__label" :for="`publication-pubmed-${publication.id}`">Publication PubMed ID {{ index + 1 }}</label><input :id="`publication-pubmed-${publication.id}`" class="vf-form__input" :value="publication.pubmedId ?? ''" @input="setField(publication.id, 'pubmedId', $event)" /></div>
      <div class="record-actions"><button v-if="view.study?.references?.relatedPublication?.includes(publication.id)" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Unlink publication ${index + 1}`" @click="emit('change', {type: 'remove-reference', sourceId: './', relationship: 'relatedPublication', targetId: publication.id})">Unlink publication</button><button v-else type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Link publication ${index + 1}`" @click="emit('change', {type: 'add-reference', sourceId: './', relationship: 'relatedPublication', targetId: publication.id})">Link publication</button><button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Delete publication ${index + 1}`" @click="emit('change', {type: 'delete-entity', entityId: publication.id})">Delete publication</button></div>
    </fieldset>
    <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="emit('add', 'publication', 'relatedPublication')">Add publication</button>
  </section>
</template>
