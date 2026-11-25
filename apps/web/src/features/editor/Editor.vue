<script setup lang="ts">
import {computed, shallowRef, ref, onMounted, onUnmounted, nextTick} from 'vue'
import {applyChanges, inspectDraft, inspectIncomingReferences, type StudyField, type DraftChange, type ChangeResult, type BulkResult, type EntityKind, type ContributionKind, type StudyRelationship} from '@bijux/ro-crate-creator'
import {newEditor, changeStudy, exportMetadata, applyEditorChange, addContribution} from './document'
import ContributorsPanel from './contributions/ContributorsPanel.vue'
import AffiliationsPanel from './contributions/AffiliationsPanel.vue'
import PublicationsPanel from './contributions/PublicationsPanel.vue'
import FundingPanel from './contributions/FundingPanel.vue'
import BiosamplesPanel from './scientific/BiosamplesPanel.vue'
import SpecimensPanel from './scientific/SpecimensPanel.vue'
import ProtocolsPanel from './scientific/ProtocolsPanel.vue'
import DatasetsPanel from './scientific/DatasetsPanel.vue'
import {recordId, sectionFor} from './scientific/records'

const sections = [
  {id: 'study', label: 'Study details'},
  {id: 'biosamples', label: 'Biosamples'},
  {id: 'specimens', label: 'Specimens'},
  {id: 'protocols', label: 'Protocols'},
  {id: 'datasets', label: 'Datasets'},
  {id: 'contributors', label: 'Contributors'},
  {id: 'affiliations', label: 'Affiliations'},
  {id: 'publications', label: 'Publications'},
  {id: 'funding', label: 'Funding'},
  {id: 'export', label: 'Export metadata'},
] as const
type Section = typeof sections[number]['id']
const activeSection = ref<Section>('study')
const main = ref<HTMLElement | null>(null)
const activeLabel = computed(() => sections.find(section => section.id === activeSection.value)?.label ?? 'Study details')
function syncSection(focus = false) {
  const fragment = window.location.hash.slice(1)
  const slash = fragment.indexOf('/')
  const sectionId = slash < 0 ? fragment : fragment.slice(0, slash)
  const section = sections.find(item => item.id === sectionId)
  activeSection.value = section && (view.value.study || section.id === 'study' || section.id === 'export') ? section.id : 'study'
  let entityId: string | null = null
  if (slash >= 0 && section && activeSection.value === section.id) {
    try {
      const id = decodeURIComponent(fragment.slice(slash + 1))
      const entity = view.value.entities.find(item => item.id === id)
      if (entity && sectionFor(entity) === section.id) entityId = id
    } catch { /* Invalid fragments fall back to the section heading. */ }
  }
  if (focus) void nextTick(() => {
    const target = entityId ? document.getElementById(recordId(entityId)) : null
    if (target) target.focus()
    else main.value?.querySelector<HTMLElement>('.section-heading')?.focus()
  })
}
function onHashChange() {syncSection(true)}
onMounted(() => {syncSection(window.location.hash.includes('/')); window.addEventListener('hashchange', onHashChange)})
onUnmounted(() => window.removeEventListener('hashchange', onHashChange))

const draft = shallowRef(newEditor())
const view = computed(() => inspectDraft(draft.value))
const dependencies = computed(() => new Map(view.value.entities.map(entity => [entity.id, inspectIncomingReferences(draft.value,entity.id)])))
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
function receive(result: ChangeResult | BulkResult) {
  if (result.status === 'applied') {draft.value = result.draft; issues.value = []; return}
  const count = 'references' in result ? result.references?.length ?? 0 : 0
  issues.value = result.issues.map(issue => issue.message + (count ? ` (${count} reference${count === 1 ? '' : 's'}).` : ''))
  reviewOpen.value = true
}
function change(change: DraftChange) {receive(applyEditorChange(draft.value, change))}
function addScientific(kind: EntityKind) {receive(applyEditorChange(draft.value,{type:'add-entity',kind}))}
function batch(changes: readonly DraftChange[]) {receive(applyChanges(draft.value,changes))}
function add(kind: ContributionKind, relationship?: StudyRelationship) {receive(addContribution(draft.value, kind, relationship))}
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
  <div class="application">
    <header class="application-header">
      <div class="vf-body application-header__inner">
        <p class="application-header__title">Study authoring</p>
        <span class="application-header__status">Local workspace</span>
      </div>
    </header>
    <nav class="vf-navigation vf-navigation--main application-navigation" aria-label="Mobile study sections">
      <div class="vf-body">
        <ul class="vf-navigation__list vf-list application-navigation__list">
          <li v-for="section in sections.filter(item => view.study || item.id === 'study' || item.id === 'export')" :key="section.id" class="vf-navigation__item"><a class="vf-navigation__link" :href="`#${section.id}`" :aria-current="activeSection === section.id ? 'page' : undefined">{{ section.label }}</a></li>
        </ul>
      </div>
    </nav>
    <div class="vf-body workspace">
      <aside class="workspace-navigation" aria-label="Study navigation">
        <h2>Study editor</h2>
        <p>Describe your study and prepare its metadata.</p>
        <nav aria-label="Study sections">
          <ul class="vf-list">
            <li v-for="section in sections.filter(item => view.study || item.id === 'study' || item.id === 'export')" :key="section.id"><a class="vf-link" :class="{'current-section': activeSection === section.id}" :href="`#${section.id}`" :aria-current="activeSection === section.id ? 'page' : undefined">{{ section.label }}</a></li>
          </ul>
        </nav>
        <div class="workspace-note"><strong>Working locally</strong><p>This draft is held in this browser tab and is not saved. Download your metadata before leaving.</p></div>
      </aside>
      <main ref="main" class="vf-content workspace-main">
        <p class="workspace-breadcrumb">Workspace / {{ activeLabel }}</p>
        <h1 v-if="view.study">{{ view.study.name || 'Untitled study' }}</h1>
        <h1 v-else>Create a study</h1>
        <p v-if="!view.study">Start with the title, description and license for your study.</p>
        <p v-else>Describe the research behind your data.</p>
        <div class="local-status" role="status"><strong>Not saved</strong><p>Your changes live in this tab only. Download your metadata before closing it.</p></div>
        <section v-if="activeSection === 'study' && !view.study" class="study-section">
          <h2 class="section-heading" tabindex="-1">Study details</h2>
          <p>Create a study to add its metadata.</p>
          <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="createStudy">Create study</button>
        </section>
        <section v-else-if="activeSection === 'study' && view.study" class="study-section" aria-labelledby="details-title">
          <h2 id="details-title" class="section-heading" tabindex="-1">Study details</h2>
          <p>These details help others understand your research.</p>
          <div class="vf-form__item"><label class="vf-form__label" for="title">Study title</label><p id="title-help" class="vf-form__helper">What are you investigating?</p><input id="title" class="vf-form__input" :value="view.study.name ?? ''" aria-describedby="title-help" placeholder="e.g. Imaging cell division in zebrafish" @input="setField('name', $event)" /></div>
          <div class="vf-form__item"><label class="vf-form__label" for="description">Description</label><p id="description-help" class="vf-form__helper">A short, useful overview of the study.</p><textarea id="description" class="vf-form__input" rows="5" :value="view.study.description ?? ''" aria-describedby="description-help" @input="setField('description', $event)"></textarea></div>
          <div class="vf-form__item"><label class="vf-form__label" for="license">License</label><p id="license-help" class="vf-form__helper">Use a license URL if you have one.</p><input id="license" class="vf-form__input" :value="view.study.license ?? ''" aria-describedby="license-help" placeholder="https://creativecommons.org/licenses/by/4.0/" @input="setField('license', $event)" /></div>
          <div class="vf-form__item"><label class="vf-form__label" for="funding-statement">Funding statement</label><p id="funding-statement-help" class="vf-form__helper">Describe support for the study, if applicable.</p><textarea id="funding-statement" class="vf-form__input" rows="3" :value="view.study.fundingStatement ?? ''" aria-describedby="funding-statement-help" @input="setField('fundingStatement', $event)"></textarea></div>
        </section>
        <template v-if="view.study">
          <BiosamplesPanel v-if="activeSection === 'biosamples'" :view="view" :references="dependencies" @change="change" @add="addScientific" />
          <SpecimensPanel v-if="activeSection === 'specimens'" :view="view" :references="dependencies" @change="change" @add="addScientific" />
          <ProtocolsPanel v-if="activeSection === 'protocols'" :view="view" :references="dependencies" @change="change" @add="addScientific" />
          <DatasetsPanel v-if="activeSection === 'datasets'" :view="view" :references="dependencies" @change="change" @batch="batch" @add="addScientific" />
          <ContributorsPanel v-if="activeSection === 'contributors'" :view="view" @change="change" @add="add" />
          <AffiliationsPanel v-if="activeSection === 'affiliations'" :view="view" @change="change" @add="add" />
          <PublicationsPanel v-if="activeSection === 'publications'" :view="view" @change="change" @add="add" />
          <FundingPanel v-if="activeSection === 'funding'" :view="view" @change="change" @add="add" />
        </template>
        <section v-if="activeSection === 'export'" id="export" class="export-section">
          <h2 class="section-heading" tabindex="-1">Export metadata</h2><p>Download your current RO-Crate metadata as a JSON file. Image files are not included.</p>
          <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="download">Download metadata</button>
        </section>
      </main>
      <aside class="review" aria-label="Study guidance">
        <button class="vf-button vf-button--secondary vf-button--sm app-button review-toggle" type="button" :aria-expanded="reviewOpen" aria-controls="study-guidance" @click="reviewOpen = !reviewOpen">Study guidance <span aria-hidden="true">{{ reviewOpen ? '−' : '+' }}</span></button>
        <div id="study-guidance" class="review-content" :class="{open: reviewOpen}">
          <h2>Study guidance</h2><p>A little context makes research easier to discover and reuse.</p>
          <dl><div><dt>Study</dt><dd>{{ view.study?.name || 'Untitled' }}</dd></div><div><dt>Storage</dt><dd>Not saved</dd></div></dl>
          <p>There is no need to complete everything now. Start with what you know.</p>
          <div v-if="issues.length" role="alert"><h3>Needs attention</h3><ul><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul></div>
        </div>
      </aside>
    </div>
  </div>
</template>
