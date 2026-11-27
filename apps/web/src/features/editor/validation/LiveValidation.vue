<script setup lang="ts">
import {computed} from 'vue'
import type {ValidationStatus} from './coordinator'

const props = defineProps<{status: ValidationStatus}>()
const findings = computed(() => {
  const issues = props.status.result?.report.issues
  return issues ? (['CRITICAL', 'ERROR', 'WARNING'] as const).flatMap(severity => issues[severity]) : []
})
</script>

<template>
  <section aria-label="Live validation">
    <p role="status">Validation: {{ status.state }}<span v-if="status.message"> — {{ status.message }}</span></p>
    <template v-if="status.result">
      <p v-if="status.result.status === 'incomplete'">Validation stopped at {{ status.result.stage }}: {{ status.result.reason }}</p>
      <p v-if="findings.length">{{ findings.length }} error or warning finding(s) in the current validation result.</p>
      <ul v-if="findings.length" class="vf-list"><li v-for="(finding, index) in findings.slice(0, 5)" :key="index">{{ finding.severity }}: {{ finding.message }}<span v-if="finding.location_description"> — {{ finding.location_description }}</span></li></ul>
      <p v-if="findings.length > 5">Showing the first five findings.</p>
    </template>
    <p><a class="vf-link" href="#validation">View validation details</a></p>
  </section>
</template>
