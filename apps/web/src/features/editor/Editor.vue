<script setup lang="ts">
import {computed, shallowRef, ref, onMounted, onUnmounted, nextTick, watch} from 'vue'
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
import FilesPanel from './files/FilesPanel.vue'
import type {PendingFile} from './files/inventory'
import {zipSync, strToU8} from 'fflate'
import ValidationPanel from './validation/ValidationPanel.vue'
import {ValidationCoordinator, type ValidationStatus} from './validation/coordinator'
import {createValidationSession} from './validation/worker'
import {importCrate, type ImportResult} from '@bijux/ro-crate-creator'
import {encodeRecovery, decodeRecovery, RECOVERY_MAX_BYTES, type RecoveryResult} from '../../drafts/recovery-codec'
import {indexedRecoveryStore, type RecoveryStore, type RecoveryRecord} from '../../drafts/recovery-store'
import {RecoveryProgress} from '../../drafts/recovery-progress'
import RecoveryPanel from './RecoveryPanel.vue'

const sections = [
  {id: 'study', label: 'Study details'},
  {id: 'biosamples', label: 'Biosamples'},
  {id: 'specimens', label: 'Specimens'},
  {id: 'protocols', label: 'Protocols'},
  {id: 'datasets', label: 'Datasets'},
  {id: 'files', label: 'Files'},
  {id: 'contributors', label: 'Contributors'},
  {id: 'affiliations', label: 'Affiliations'},
  {id: 'publications', label: 'Publications'},
  {id: 'funding', label: 'Funding'},
  {id: 'validation', label: 'Validate crate'},
  {id: 'recovery', label: 'Local recovery'},
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
  activeSection.value = section && (view.value.study || section.id === 'study' || section.id === 'validation' || section.id === 'recovery' || section.id === 'export') ? section.id : 'study'
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
const pendingFiles = shallowRef<readonly PendingFile[]>([])
function applyFiles(next: typeof draft.value, pending: readonly PendingFile[]) {draft.value = next; pendingFiles.value = pending}
const view = computed(() => inspectDraft(draft.value))
const validationStatus = shallowRef<ValidationStatus>({state: 'blocked', eligible: false})
const payload = shallowRef<ReadonlyMap<string, Blob>>(new Map())
const missingPayload = computed(() => view.value.files.filter(file => !payload.value.has(file.path)).length)
let validation: ValidationCoordinator | undefined
onMounted(() => {
  validation = new ValidationCoordinator(createValidationSession(), status => {validationStatus.value = status})
  refreshValidation()
})
function refreshValidation() {
  if (!validation) return
  if (pendingFiles.value.length) validation.block('Assign or remove pending file listings before validation.')
  else validation.update(draft.value, payload.value)
}
watch([draft, pendingFiles], refreshValidation, {flush: 'sync'})
onUnmounted(() => validation?.dispose())
function selectPayload(files: ReadonlyMap<string, Blob>) {payload.value = new Map(files); refreshValidation()}
function rejectPayloadSelection(message: string) {payload.value = new Map(); validation?.block(message)}
function continueValidated() {
  if (!validation) return
  try {
    const snapshot = validation.continue()
    const metadata = snapshot.files.get('ro-crate-metadata.json')
    if (metadata === undefined) throw new Error('Validated metadata is missing')
    const bytes = metadata instanceof Uint8Array ? new Uint8Array(metadata) : metadata
    const blob = new Blob([bytes], {type: 'application/ld+json'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'ro-crate-metadata.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (error) {issues.value = [String(error)]; reviewOpen.value = true}
}
const recoveryRecords = shallowRef<readonly RecoveryRecord[]>([])
const recoveryListIssue = ref('')
let recoveryListRequest = 0
const recoveryStatus = ref('Recovery is starting.')
const recoveryProgress = new RecoveryProgress(status => {recoveryStatus.value = status})
const readOnlyMessage = ref('')
const readOnlyBackup = ref('')
let recoveryStore: RecoveryStore | undefined
let recoveryId = ''
let recoveryRevision: number | null = null
let recoveryTimer: ReturnType<typeof setTimeout> | undefined
let saveQueue = Promise.resolve()
let changed = false
function guardNavigation(event: BeforeUnloadEvent) {if (changed) {event.preventDefault(); event.returnValue = ''}}
async function refreshRecoveryRecords() {
  if (!recoveryStore) return
  const request = ++recoveryListRequest
  try {
    const records = await recoveryStore.list()
    if (request === recoveryListRequest) {recoveryRecords.value = records; recoveryListIssue.value = ''}
  } catch (error) {
    if (request === recoveryListRequest) recoveryListIssue.value = `Recovery copies could not be listed: ${String(error)}`
  }
}
function onRecoveryFocus() {if (activeSection.value === 'recovery') void refreshRecoveryRecords()}
watch(activeSection, section => {if (section === 'recovery') void refreshRecoveryRecords()})
onMounted(async () => {
  window.addEventListener('beforeunload', guardNavigation)
  window.addEventListener('focus', onRecoveryFocus)
  try {
    recoveryId = crypto.randomUUID()
    recoveryStore = indexedRecoveryStore(indexedDB)
    await refreshRecoveryRecords()
    if (recoveryProgress.current() === 0) recoveryStatus.value = recoveryListIssue.value || 'Changes will be saved as a separate recovery copy in this browser.'
  } catch (error) {if (recoveryProgress.current() === 0) recoveryStatus.value = `Browser recovery unavailable: ${String(error)}. Download a backup to keep your work.`}
})
onUnmounted(() => {window.removeEventListener('beforeunload', guardNavigation); window.removeEventListener('focus', onRecoveryFocus); clearTimeout(recoveryTimer)})
function scheduleRecovery() {
  changed = true
  const generation = recoveryProgress.changed()
  clearTimeout(recoveryTimer)
  recoveryTimer = setTimeout(() => {
    let backup: string
    try {backup = encodeRecovery({draft:draft.value, pending:pendingFiles.value})}
    catch (error) {recoveryProgress.failed(generation,error); return}
    saveQueue = saveQueue.then(async () => {
      if (!recoveryStore) throw Error('Browser storage is unavailable')
      const record = await recoveryStore.save(recoveryId, recoveryRevision, backup)
      recoveryRevision = record.revision
      recoveryProgress.saved(generation)
      void refreshRecoveryRecords()
    }).catch(error => {recoveryProgress.failed(generation,error); void refreshRecoveryRecords()})
  }, 500)
}
watch([draft, pendingFiles], scheduleRecovery, {flush:'sync'})
function saveText(text:string, name:string) {
  const url = URL.createObjectURL(new Blob([text], {type:'application/json'}))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
function downloadBackup() {
  try {saveText(encodeRecovery({draft:draft.value,pending:pendingFiles.value}), 'study-backup.json')}
  catch (error) {recoveryStatus.value = `Backup could not be created: ${String(error)}. Your work remains open.`}
}
function downloadReadOnly() {if (readOnlyBackup.value) saveText(readOnlyBackup.value, 'read-only-backup.json')}
async function adoptRecovery(result:RecoveryResult, original:string) {
  if (result.status === 'rejected') {recoveryStatus.value = `Recovery rejected: ${result.issues.join('; ')}`; return}
  if (result.status === 'read-only') {
    validation?.block('Read-only recovery requires selecting image files again.')
    payload.value = new Map()
    readOnlyBackup.value = original
    readOnlyMessage.value = `This backup is read-only: ${result.issues.join('; ')}. The current study remains open; download the read-only backup below.`
    return
  }
  if (!window.confirm('Replace the current study with this recovery copy? Download the current backup first if needed.')) return
  validation?.block('Recovery replaced the current draft. Select image files again.')
  payload.value = new Map()
  pendingFiles.value = result.pending
  draft.value = result.draft
  readOnlyMessage.value = ''; readOnlyBackup.value = ''
  recoveryStatus.value = 'Recovery opened. Image files need to be selected again.'
}
async function restoreRecord(record:RecoveryRecord) {await adoptRecovery(await decodeRecovery(record.backup), record.backup)}
async function removeRecord(record:RecoveryRecord) {
  if (!window.confirm('Delete this recovery copy? This cannot be undone.')) return
  try {
    if (!recoveryStore) throw Error('Browser storage is unavailable')
    await recoveryStore.remove(record.id,record.revision)
    await refreshRecoveryRecords()
    recoveryStatus.value = 'Recovery copy deleted.'
  } catch (error) {recoveryStatus.value = `Recovery copy could not be deleted: ${String(error)}`; await refreshRecoveryRecords()}
}
async function reopenBackup(file:File) {
  try {
    if (file.size > RECOVERY_MAX_BYTES) throw Error('Backup exceeds the size limit')
    const text = new TextDecoder('utf-8', {fatal:true}).decode(await file.arrayBuffer())
    await adoptRecovery(await decodeRecovery(text), text)
  } catch (error) {recoveryStatus.value = `Backup could not be opened: ${String(error)}`}
}
async function importMetadata(files:File[]) {
  try {
    if (files.length > 64 || files.reduce((total,file) => total + file.size,0) > 10 * 1024 * 1024) throw Error('Metadata selection exceeds the import limit')
    if (new Set(files.map(file => file.name)).size !== files.length) throw Error('Metadata filenames must be unique')
    const data = new Map(await Promise.all(files.map(async file => [file.name,new Uint8Array(await file.arrayBuffer())] as const)))
    const result:ImportResult = await importCrate(data, {metadataPaths:[...data.keys()]})
    if (result.status === 'rejected') {recoveryStatus.value = `Import rejected: ${result.issues.join('; ')}`; return}
    if (result.status === 'read-only') {
      const backup = encodeRecovery({readOnly:result,pending:[]})
      await adoptRecovery(await decodeRecovery(backup),backup)
      return
    }
    const backup = encodeRecovery({draft:result.draft,pending:[]})
    await adoptRecovery(await decodeRecovery(backup),backup)
  } catch (error) {recoveryStatus.value = `Metadata could not be imported: ${String(error)}`}
}
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
async function download() {
  const result = exportMetadata(draft.value)
  if (result.status === 'blocked') {issues.value = result.issues.map(issue => issue.message); reviewOpen.value = true; return}
  if (pendingFiles.value.length) {issues.value = ['Assign or remove all pending file listings before export.']; reviewOpen.value = true; return}
  const entries = [...result.files.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
  const multi = entries.length > 1
  const archiveEntries = await Promise.all(entries.map(async ([path, data]) => [path, typeof data === 'string' ? strToU8(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data)] as const))
  const bytes = multi ? new Uint8Array(zipSync(Object.fromEntries(archiveEntries), {mtime: new Date(1980, 0, 1)})) : result.metadata
  const url = URL.createObjectURL(new Blob([bytes], {type: multi ? 'application/zip' : 'application/ld+json'}))
  const link = document.createElement('a')
  link.href = url; link.download = multi ? 'ro-crate-metadata.zip' : 'ro-crate-metadata.json'; link.click()
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
          <li v-for="section in sections.filter(item => view.study || item.id === 'study' || item.id === 'validation' || item.id === 'recovery' || item.id === 'export')" :key="section.id" class="vf-navigation__item"><a class="vf-navigation__link" :href="`#${section.id}`" :aria-current="activeSection === section.id ? 'page' : undefined">{{ section.label }}</a></li>
        </ul>
      </div>
    </nav>
    <div class="vf-body workspace">
      <aside class="workspace-navigation" aria-label="Study navigation">
        <h2>Study editor</h2>
        <p>Describe your study and prepare its metadata.</p>
        <nav aria-label="Study sections">
          <ul class="vf-list">
            <li v-for="section in sections.filter(item => view.study || item.id === 'study' || item.id === 'validation' || item.id === 'recovery' || item.id === 'export')" :key="section.id"><a class="vf-link" :class="{'current-section': activeSection === section.id}" :href="`#${section.id}`" :aria-current="activeSection === section.id ? 'page' : undefined">{{ section.label }}</a></li>
          </ul>
        </nav>
        <div class="workspace-note"><strong>Working locally</strong><p>Recovery copies stay in this browser. Download a full backup to keep another copy.</p></div>
      </aside>
      <main ref="main" class="vf-content workspace-main">
        <p class="workspace-breadcrumb">Workspace / {{ activeLabel }}</p>
        <h1 v-if="view.study">{{ view.study.name || 'Untitled study' }}</h1>
        <h1 v-else>Create a study</h1>
        <p v-if="!view.study">Start with the title, description and license for your study.</p>
        <p v-else>Describe the research behind your data.</p>
        <div class="local-status" role="status"><strong>Local recovery</strong><p>{{ recoveryStatus }}</p></div>
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
          <FilesPanel v-if="activeSection === 'files'" :draft="draft" :view="view" :pending="pendingFiles" @pending="pendingFiles = $event" @apply="applyFiles" />
          <ContributorsPanel v-if="activeSection === 'contributors'" :view="view" @change="change" @add="add" />
          <AffiliationsPanel v-if="activeSection === 'affiliations'" :view="view" @change="change" @add="add" />
          <PublicationsPanel v-if="activeSection === 'publications'" :view="view" @change="change" @add="add" />
          <FundingPanel v-if="activeSection === 'funding'" :view="view" @change="change" @add="add" />
        </template>
        <ValidationPanel v-if="activeSection === 'validation'" :status="validationStatus" :missing-payload="missingPayload" :listed-payload="view.files.length" @selection="selectPayload" @selection-error="rejectPayloadSelection" @continue="continueValidated" />
        <RecoveryPanel v-if="activeSection === 'recovery'" :records="recoveryRecords" :list-issue="recoveryListIssue" :status="recoveryStatus" :read-only-message="readOnlyMessage" @restore="restoreRecord" @remove="removeRecord" @download="downloadBackup" @download-read-only="downloadReadOnly" @reopen="reopenBackup" @metadata="importMetadata" />
        <section v-if="activeSection === 'export'" id="export" class="export-section">
          <h2 class="section-heading" tabindex="-1">Export metadata</h2><p>Download your current RO-Crate metadata. When files are listed, the ZIP contains JSON-LD and the file-list TSV. Image contents are not included.</p>
          <button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="download">{{ view.files.length ? 'Download metadata ZIP' : 'Download metadata' }}</button>
        </section>
      </main>
      <aside class="review" aria-label="Study guidance">
        <button class="vf-button vf-button--secondary vf-button--sm app-button review-toggle" type="button" :aria-expanded="reviewOpen" aria-controls="study-guidance" @click="reviewOpen = !reviewOpen">Study guidance <span aria-hidden="true">{{ reviewOpen ? '−' : '+' }}</span></button>
        <div id="study-guidance" class="review-content" :class="{open: reviewOpen}">
          <h2>Study guidance</h2><p>A little context makes research easier to discover and reuse.</p>
          <dl><div><dt>Study</dt><dd>{{ view.study?.name || 'Untitled' }}</dd></div><div><dt>Storage</dt><dd>Browser recovery</dd></div></dl>
          <p>There is no need to complete everything now. Start with what you know.</p>
          <div v-if="issues.length" role="alert"><h3>Needs attention</h3><ul><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul></div>
        </div>
      </aside>
    </div>
  </div>
</template>
