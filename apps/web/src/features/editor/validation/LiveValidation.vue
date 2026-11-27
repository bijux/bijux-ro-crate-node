<script setup lang="ts">
import {computed} from 'vue'
import type {ValidationStatus} from './coordinator'

const props = defineProps<{status: ValidationStatus}>()
const findings = computed(() => {
  const issues = props.status.result?.report.issues
  return issues ? (['CRITICAL', 'ERROR', 'WARNING'] as const).flatMap(label => issues[label].map(issue => ({label, issue}))) : []
})
</script>

<template>
  <section aria-label="Live validation">
    <p role="status">Validation: {{ status.state }}<span v-if="status.message"> — {{ status.message }}</span><span v-if="status.result?.status === 'incomplete'"> — validation stopped early</span><span v-if="findings.length"> — {{ findings.length }} error or warning finding(s)</span></p>
    <template v-if="status.result">
      <p v-if="status.result.status === 'incomplete'">Validation stopped at {{ status.result.stage }}: {{ status.result.reason }}</p>
      <ul v-if="findings.length" class="vf-list"><li v-for="(finding, index) in findings.slice(0, 5)" :key="index">{{ finding.label }}: {{ finding.issue.message }}<span v-if="finding.issue.location_description"> — {{ finding.issue.location_description }}</span></li></ul>
      <p v-if="findings.length > 5">Showing the first five findings.</p>
    </template>
    <p><a class="vf-link" href="#validation">View validation details</a></p>
  </section>
</template>
