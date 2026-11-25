<script setup lang="ts">
import {computed} from 'vue'
import type {DraftView, IncomingReference} from '@bijux/ro-crate-creator'
import {displayName, recordHref, sectionFor, type ScientificSection} from './records'
const emit = defineEmits<{navigate:[section:ScientificSection, entityId:string | null]}>()
const props = defineProps<{view: DraftView; references: readonly IncomingReference[]; label: string}>()
const dependents = computed(() => props.references.map(reference => {
  const entity = props.view.entities.find(item => item.id === reference.sourceId)
  return {key:`${reference.sourceId}:${reference.relationship}`, name:entity ? displayName(entity,props.view) : reference.sourceId, href:entity ? recordHref(entity.id) : '#export', section:entity ? sectionFor(entity) : 'export' as const, entityId:entity?.id ?? null}
}))
</script>
<template>
  <div role="group" :aria-label="`Dependents of ${label}`">
    <p>Used by {{ dependents.length }} record{{ dependents.length === 1 ? '' : 's' }}.</p>
    <ul v-if="dependents.length" class="vf-list">
      <li v-for="dependent in dependents" :key="dependent.key"><a class="vf-link" :href="dependent.href" @click.prevent="emit('navigate',dependent.section,dependent.entityId)">{{ dependent.name }}</a></li>
    </ul>
  </div>
</template>
