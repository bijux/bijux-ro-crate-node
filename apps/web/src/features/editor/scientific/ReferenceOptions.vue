<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, DraftChange, EntityKind, EntityView, Relationship} from '@bijux/ro-crate-creator'
import {displayName} from './records'
const props = defineProps<{view: DraftView; source: EntityView; relationship: Relationship; targetKind: EntityKind; title: string}>()
const emit = defineEmits<{change:[change:DraftChange]}>()
const targets = computed(() => props.view.entities.filter(entity => entity.kind === props.targetKind))
function toggle(id: string, event: Event) {
  emit('change',{type:(event.target as HTMLInputElement).checked ? 'add-reference' : 'remove-reference',sourceId:props.source.id,relationship:props.relationship,targetId:id})
}
</script>
<template>
  <fieldset class="reference-options" :aria-label="title">
    <legend>{{ title }}</legend>
    <p v-if="!targets.length">Add a record below to make it available here.</p>
    <div v-for="target in targets" :key="target.id"><label><input type="checkbox" :checked="source.references[relationship]?.includes(target.id) ?? false" @change="toggle(target.id,$event)" /> {{ displayName(target,view) }}</label></div>
  </fieldset>
</template>
