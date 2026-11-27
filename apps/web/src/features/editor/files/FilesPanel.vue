<script setup lang="ts">
import {computed, ref, shallowRef, watch} from 'vue'
import type {DraftDocument, DraftView} from '@bijux/ro-crate-creator'
import {stageFiles, listingFiles, inventoryRows, previewAssignment, type AssignmentPreview, type PendingFile} from './inventory'
import type {FileSelection} from './selection'
const props = defineProps<{draft:DraftDocument; view:DraftView; pending:readonly PendingFile[]; retrySelection:FileSelection | null; admitPending:(rows:readonly PendingFile[]) => boolean; applyAssignment:(preview:AssignmentPreview, selection:ReadonlySet<string>) => 'accepted' | 'rejected' | 'stale'}>()
const emit = defineEmits<{pending:[rows:readonly PendingFile[]]; 'retry-selection':[selection:FileSelection | null]}>()
const selected = ref(new Set<string>())
const filter = ref('')
const page = ref(0)
const dataset = ref('')
const specimen = ref('')
const preview = shallowRef<ReturnType<typeof previewAssignment> | null>(null)
const rows = computed(() => inventoryRows(props.view.files, props.pending))
const filtered = computed(() => rows.value.filter(row => row.path.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase())))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 50)))
const visible = computed(() => filtered.value.slice(page.value * 50, (page.value + 1) * 50))
const datasets = computed(() => props.view.entities.filter(entity => entity.kind === 'dataset'))
const specimens = computed(() => props.view.entities.filter(entity => entity.kind === 'specimen'))
const datasetLabel = computed(() => targetLabel(datasets.value.find(item => item.id === dataset.value)))
const specimenLabel = computed(() => targetLabel(specimens.value.find(item => item.id === specimen.value)))
function targetLabel(item: DraftView['entities'][number] | undefined) {
  if (!item) return ''
  const label = item.name || item.label
  return label ? `${label} (${item.id})` : item.id
}
watch([() => props.draft, () => props.pending, dataset, specimen, selected], () => {preview.value = null})
watch(filter, () => {page.value = 0})
watch(pages, value => {if (page.value >= value) page.value = value - 1})
function choose(event:Event, mode:'files' | 'directory') {
  retryFiles({input:event.target as HTMLInputElement,mode,issue:''})
}
function retryFiles(selection:FileSelection | null) {
  if (!selection) return
  try {
    const files = listingFiles(Array.from(selection.input.files ?? []), selection.mode)
    if (!props.admitPending(stageFiles(props.pending, files))) {
      emit('retry-selection', {...selection,issue:'The selected files were not added. Resolve the recovery issue, then retry the selected files.'})
      return
    }
    selection.input.value = ''; emit('retry-selection', null)
  } catch (error) {emit('retry-selection', {...selection,issue:error instanceof Error ? error.message : 'File listing could not be read.'})}
}

function toggle(id:string, checked:boolean) {const next = new Set(selected.value); if (checked) next.add(id); else next.delete(id); selected.value = next}
function togglePage(checked:boolean) {const next = new Set(selected.value); for (const row of visible.value) {if (checked) next.add(row.id); else next.delete(row.id)} selected.value = next}
function remove(id:string) {emit('pending', props.pending.filter(row => row.id !== id)); toggle(id, false)}
function prepare() {preview.value = previewAssignment(props.draft, props.pending, selected.value, dataset.value, specimen.value)}
function apply() {
  if (preview.value?.status !== 'ready') return
  const result = props.applyAssignment(preview.value, selected.value)
  if (result === 'stale') {preview.value = {status:'blocked', message:'The preview is out of date. Preview again.'}; return}
  if (result === 'accepted') {selected.value = new Set(); preview.value = null}
}
</script>
<template>
<section>
  <h2 class="section-heading" tabindex="-1">Files</h2>
  <p>List file names and sizes for the manifest. Selecting files here does not upload or include their contents. New entries are listed as images when assigned.</p>
  <div class="vf-form__item"><label class="vf-form__label" for="file-input">List files</label><input id="file-input" type="file" multiple @change="choose($event, 'files')" /></div>
  <div class="vf-form__item"><label class="vf-form__label" for="directory-input">List a directory</label><input id="directory-input" type="file" multiple v-bind="{webkitdirectory: ''}" @change="choose($event, 'directory')" /></div>
  <p v-if="retrySelection" role="alert">{{ retrySelection.issue }}</p>
  <button v-if="retrySelection" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="retryFiles(retrySelection)">Retry selected files</button>
  <div class="vf-form__item"><label class="vf-form__label" for="file-filter">Filter paths</label><input id="file-filter" v-model="filter" class="vf-form__input" /></div>
  <p>{{ selected.size }} selected; {{ filtered.length }} matching; {{ pending.length }} pending assignment.</p>
  <div class="file-table-scroll"><table class="vf-table"><thead><tr><th><label><input type="checkbox" :checked="visible.length > 0 && visible.every(row => selected.has(row.id))" @change="togglePage(($event.target as HTMLInputElement).checked)" /> Select page</label></th><th>Path</th><th>Size (bytes)</th><th>Status</th><th>Action</th></tr></thead><tbody>
  <tr v-for="row in visible" :key="row.id"><td><input type="checkbox" :aria-label="`Select ${row.path} ${row.id}`" :checked="selected.has(row.id)" @change="toggle(row.id, ($event.target as HTMLInputElement).checked)" /></td><td>{{ row.path }}</td><td>{{ row.size }}</td><td>{{ row.conflict ? 'Conflicting path' : row.pending ? 'Unassigned' : 'Assigned' }}</td><td><button v-if="row.pending" class="vf-button vf-button--secondary vf-button--sm app-button" type="button" :aria-label="`Remove listing ${row.path} ${row.id}`" @click="remove(row.id)">Remove listing</button></td></tr>
  </tbody></table></div>
  <div class="record-actions"><button class="vf-button vf-button--secondary vf-button--sm app-button" type="button" :disabled="page === 0" @click="page--">Previous page</button><span>Page {{ page + 1 }} of {{ pages }}</span><button class="vf-button vf-button--secondary vf-button--sm app-button" type="button" :disabled="page + 1 >= pages" @click="page++">Next page</button></div>
  <div class="vf-form__item"><label class="vf-form__label" for="file-dataset">Dataset for selected files</label><select id="file-dataset" v-model="dataset" class="vf-form__select"><option value="">Choose dataset</option><option v-for="item in datasets" :key="item.id" :value="item.id">{{ targetLabel(item) }}</option></select></div>
  <div class="vf-form__item"><label class="vf-form__label" for="file-specimen">Specimen for selected files</label><select id="file-specimen" v-model="specimen" class="vf-form__select"><option value="">Choose specimen</option><option v-for="item in specimens" :key="item.id" :value="item.id">{{ targetLabel(item) }}</option></select></div>
  <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" @click="prepare">Preview assignment</button>
  <div v-if="preview" role="status"><p v-if="preview.status === 'blocked'">{{ preview.message }}</p><template v-else><p>Assign {{ preview.count }} selected files to dataset {{ datasetLabel }} and specimen {{ specimenLabel }}.</p><button type="button" class="vf-button vf-button--primary vf-button--sm app-button" @click="apply">Apply assignment</button></template></div>
</section>
</template>
