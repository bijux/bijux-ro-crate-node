<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {evaluateVocabularyEvidence, type VocabularyAssessment, type VocabularyLookup} from '@bijux/ro-crate-validator/vocabulary'

const props = defineProps<{kind:'taxonomy' | 'imaging'; controlId:string; identifier:string; label:string; title:string; document:object; pending?:{readonly identifier:string; readonly label:string}; disabled?:boolean}>()
const emit = defineEmits<{assign:[identifier:string,label:string]; edit:[identifier:string,label:string]; discard:[]}>()
const identifier = computed(() => props.pending?.identifier ?? props.identifier)
const label = computed(() => props.pending?.label ?? props.label)
function input(field:'identifier' | 'label', event:Event) {
  const element = event.target as HTMLInputElement
  emit('edit',field === 'identifier' ? element.value : identifier.value,field === 'label' ? element.value : label.value)
  void nextTick(() => {element.value = field === 'identifier' ? identifier.value : label.value})
}
const assessment = ref<VocabularyAssessment | null>(null)
const suggestions = ref<Array<{identifier:string;label:string}>>([])
const message = ref('')
let sequence = 0
const dirty = computed(() => props.pending !== undefined)
watch(() => [props.identifier,props.label], () => {assessment.value = null; suggestions.value = []; message.value = ''; sequence++}, {flush:'sync'})
watch(() => props.document, () => {assessment.value = null; suggestions.value = []; message.value = ''; sequence++}, {flush:'sync'})
watch([identifier,label], () => {assessment.value = null; suggestions.value = []; message.value = ''; sequence++}, {flush:'sync'})
function assign() {if (label.value.trim()) emit('assign',identifier.value,label.value)}
async function request(mode:'search' | 'exact', value:string):Promise<unknown> {
  const query = new URLSearchParams({kind:props.kind,mode,value})
  const result = await fetch(`api/vocabulary?${query}`)
  if (!result.ok) throw Error('Vocabulary service unavailable')
  return result.json() as Promise<unknown>
}
async function search() {
  const version = ++sequence; assessment.value = null; suggestions.value = []; message.value = 'Searching…'
  try {
    const result = await request('search',label.value)
    if (version !== sequence) return
    if (!result || typeof result !== 'object' || !('status' in result) || result.status !== 'ok' || !('suggestions' in result) || !Array.isArray(result.suggestions)) throw Error('Unavailable')
    suggestions.value = result.suggestions.filter((item:unknown):item is {identifier:string;label:string} => !!item && typeof item === 'object' && 'identifier' in item && typeof item.identifier === 'string' && 'label' in item && typeof item.label === 'string').slice(0,10)
    message.value = suggestions.value.length ? 'Suggestions are not verified. Choose one and apply it before checking.' : 'No suggestions found.'
  } catch {if (version === sequence) message.value = 'Vocabulary service unavailable.'}
}
async function check() {
  if (dirty.value) return
  const version = ++sequence; assessment.value = null; suggestions.value = []; message.value = 'Checking…'
  if (!identifier.value.trim()) {assessment.value = {status:'descriptive'}; message.value = ''; return}
  try {
    const result = await request('exact',identifier.value)
    if (version !== sequence) return
    if (!result || typeof result !== 'object' || !('status' in result) || !['found','not-found','unavailable'].includes(String(result.status))) throw Error('Unavailable')
    assessment.value = evaluateVocabularyEvidence({identifier:identifier.value,label:label.value},result as VocabularyLookup)
    message.value = ''
  } catch {if (version === sequence) {assessment.value = {status:'unavailable'}; message.value = ''}}
}
</script>
<template>
  <fieldset class="contribution-record">
    <legend>{{ title }}</legend>
    <div class="vf-form__item"><label class="vf-form__label" :for="`${controlId}-label`">{{ title }} label</label><input :id="`${controlId}-label`" :value="label" class="vf-form__input" @input="input('label',$event)" :disabled="disabled" /></div>
    <div class="vf-form__item"><label class="vf-form__label" :for="`${controlId}-id`">{{ title }} identifier</label><input :id="`${controlId}-id`" :value="identifier" class="vf-form__input" @input="input('identifier',$event)" :disabled="disabled" :placeholder="kind === 'taxonomy' ? 'NCBITaxon:9606' : 'FBbi:00000246'" /></div>
    <p v-if="kind === 'imaging'">You may leave the identifier empty for a descriptive method.</p>
    <div class="button-row">
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="disabled || label.trim().length < 2" :aria-label="`Search suggestions for ${title}`" @click="search">Search suggestions</button>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="disabled || !dirty || !label.trim()" :aria-label="`Apply identifier and label for ${title}`" @click="assign">Apply identifier and label</button>
      <button v-if="dirty" type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :aria-label="`Discard changes for ${title}`" @click="emit('discard')">Discard changes</button>
      <button type="button" class="vf-button vf-button--secondary vf-button--sm app-button" :disabled="disabled || dirty || !label.trim()" :aria-label="`Check current value for ${title}`" @click="check">Check current value</button>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
    <ul v-if="suggestions.length">
      <li v-for="suggestion in suggestions" :key="suggestion.identifier"><button type="button" class="vf-button vf-button--link" @click="emit('edit',suggestion.identifier,suggestion.label)">{{ suggestion.label }} ({{ suggestion.identifier }})</button></li>
    </ul>
    <div v-if="assessment" role="status">
      <p v-if="assessment.status === 'verified'">Verified against the exact source term.</p>
      <p v-else-if="assessment.status === 'not-found'">Identifier not found in the source.</p>
      <p v-else-if="assessment.status === 'mismatch'">Identifier and label do not match the source's preferred label.</p>
      <p v-else-if="assessment.status === 'obsolete'">The source marks this term obsolete.</p>
      <p v-else-if="assessment.status === 'unavailable'">Vocabulary service unavailable; this value has not been verified.</p>
      <p v-else>Descriptive text; no identifier was checked.</p>
      <p v-if="assessment.observation">Source: {{ assessment.observation.source }}; identifier: {{ assessment.observation.identifier }}; checked: {{ assessment.observation.retrievedAt }}.</p>
      <p v-if="assessment.term">Source: {{ assessment.term.source }}; identifier: {{ assessment.term.identifier }}; label: {{ assessment.term.label }}; checked: {{ assessment.term.retrievedAt }}<span v-if="assessment.term.replacement">; replacement: {{ assessment.term.replacement }}</span><span v-if="assessment.term.version">; version: {{ assessment.term.version }}</span>.</p>
      <p v-if="assessment.term?.synonyms?.length">Source synonyms: {{ assessment.term.synonyms?.join(', ') }}. Synonyms are not accepted as preferred labels by this check.</p>
      <p>Agreement does not establish biological appropriateness or archive acceptance.</p>
    </div>
  </fieldset>
</template>
