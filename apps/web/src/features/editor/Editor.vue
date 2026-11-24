<script setup lang="ts">
import {computed, shallowRef, ref} from 'vue'
import {inspectDraft, type StudyField} from '@bijux/ro-crate-creator'
import {newEditor, changeStudy, exportMetadata} from './document'

const draft = shallowRef(newEditor())
const view = computed(() => inspectDraft(draft.value))
const issues = ref<string[]>([])
const reviewOpen = ref(false)
function createStudy() {
  try {draft.value = changeStudy(draft.value, {type: 'add-study'})}
  catch (error) {issues.value = [String(error)]}
}
function setField(field: StudyField, event: Event) {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  try {draft.value = changeStudy(draft.value, {type: 'set-field', entityId: './', field, value: value || null}); issues.value = []}
  catch (error) {issues.value = [String(error)]}
}
function download() {
  const result = exportMetadata(draft.value)
  if (result.status === 'blocked') {issues.value = result.issues.map(issue => issue.message); reviewOpen.value = true; return}
  const metadata = result.metadata
  const url = URL.createObjectURL(new Blob([metadata], {type: 'application/ld+json'}))
  const link = document.createElement('a')
  link.href = url; link.download = 'ro-crate-metadata.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
</script>

<template>
  <div class="shell">
    <header class="topbar"><a class="brand" href="/"><span class="brand-mark">b</span><span>bijux <small>STUDY WORKSPACE</small></span></a><span class="local-badge"><span class="dot"></span> Local workspace</span></header>
    <div class="workspace">
      <aside class="sidebar" aria-label="Study navigation">
        <p class="eyebrow">YOUR WORKSPACE</p><h2>Study editor</h2><p class="side-copy">Describe your study and prepare its metadata.</p>
        <nav aria-label="Study sections"><a class="active" href="#study"><span>01</span> Study details</a><a href="#export"><span>02</span> Export</a></nav>
        <div class="sidebar-note"><strong>Working locally</strong><p>This draft is held in this browser tab and is not saved. Download your metadata before leaving.</p></div>
      </aside>
      <main id="study" class="main">
        <div class="breadcrumb">WORKSPACE <span>/</span> STUDY DETAILS</div>
        <div class="heading" :class="{compact: view.study}"><div><p class="eyebrow">{{ view.study ? 'STUDY DETAILS' : 'AUTHOR YOUR STUDY' }}</p><h1 v-if="view.study">{{ view.study.name || 'Untitled study' }}</h1><h1 v-else>Give your study<br /><em>a clear beginning.</em></h1><p class="intro">{{ view.study ? 'Describe the research behind your data.' : 'Start with the essentials. You can add detail as your study takes shape.' }}</p></div><span class="step">01 <span>/ 02</span></span></div>
        <div class="status" role="status"><span class="status-icon">i</span><div><strong>Not saved</strong><p>Your changes live in this tab only. Download your metadata before closing it.</p></div></div>
        <section v-if="!view.study" class="card welcome"><p class="eyebrow">A NEW STUDY</p><h2>Start with the story.</h2><p>Create a study to give your data a name, a description and a license.</p><button class="primary" @click="createStudy">Create study <span>→</span></button></section>
        <section v-else class="card form-card" aria-labelledby="details-title"><div class="section-heading"><div><p class="eyebrow">THE ESSENTIALS</p><h2 id="details-title">Study details</h2><p>These details help others understand your research.</p></div><span class="section-number">01</span></div>
          <label for="title">Study title <span>What are you investigating?</span></label><input id="title" :value="view.study.name ?? ''" placeholder="e.g. Imaging cell division in zebrafish" @input="setField('name', $event)" />
          <label for="description">Description <span>A short, useful overview of the study.</span></label><textarea id="description" rows="5" :value="view.study.description ?? ''" placeholder="Describe the purpose and context of your study…" @input="setField('description', $event)"></textarea>
          <label for="license">License <span>Use a license URL if you have one.</span></label><input id="license" :value="view.study.license ?? ''" placeholder="https://creativecommons.org/licenses/by/4.0/" @input="setField('license', $event)" />
        </section>
        <section id="export" class="export"><div><p class="eyebrow">TAKE YOUR WORK WITH YOU</p><h2>Export metadata</h2><p>Download your current RO-Crate metadata as a JSON file. Image files are not included.</p></div><button class="primary" @click="download">Download metadata <span>↓</span></button></section>
      </main>
      <aside class="review" aria-label="Study guidance"><button class="review-toggle" :aria-expanded="reviewOpen" @click="reviewOpen = !reviewOpen">Study guidance <span>{{ reviewOpen ? '−' : '+' }}</span></button><div class="review-content" :class="{open: reviewOpen}"><p class="eyebrow">AT A GLANCE</p><h2>Your study</h2><p class="review-copy">A little context makes research easier to discover and reuse.</p><div class="review-line"><span>Study</span><strong>{{ view.study?.name || 'Untitled' }}</strong></div><div class="review-line"><span>Storage</span><strong>Not saved</strong></div><div class="guidance"><span>✳</span><p>There is no need to complete everything now. Start with what you know.</p></div><div v-if="issues.length" role="alert"><h3>Needs attention</h3><ul><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul></div></div></aside>
    </div>
  </div>
</template>
