<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
interface Submission {readonly title:string; readonly id:string; readonly accession:string | null; readonly status:string}
const props = defineProps<{items:readonly Submission[]}>()
const query = ref('')
const ready = ref(false)
onMounted(() => {ready.value = true})
const visible = computed(() => {
  const term = query.value.trim().toLowerCase()
  return props.items.filter(item => [item.title, item.id, item.accession ?? '', item.status].some(value => value.toLowerCase().includes(term)))
})
</script>
<template>
  <section aria-labelledby="submissions-heading">
    <div class="heading"><div><h1 id="submissions-heading">My submissions</h1><p>View sample submissions or create a local study.</p></div><a class="vf-button vf-button--primary" href="/">Create study</a></div>
    <div class="list-panel">
      <label class="vf-form__label" for="submission-search">Search submissions</label>
      <input id="submission-search" v-model="query" :disabled="!ready" class="vf-form__input" type="search" />
      <div class="table-scroll" role="region" tabindex="0" aria-label="Submission table">
        <table><thead><tr><th scope="col">Submission</th><th scope="col">Submission ID</th><th scope="col">Accession ID</th><th scope="col">Status</th></tr></thead>
          <tbody><tr v-for="item in visible" :key="item.id"><td>{{ item.title }}</td><td>{{ item.id }}</td><td>{{ item.accession ?? '—' }}</td><td>{{ item.status }}</td></tr></tbody>
        </table>
      </div>
      <p role="status">{{ visible.length }} {{ visible.length === 1 ? 'sample submission' : 'sample submissions' }} shown.</p>
    </div>
  </section>
</template>
<style scoped>
  .heading { display: flex; justify-content: space-between; align-items: end; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; }
  h1 { margin: 0; }
  .heading p { margin-bottom: 0; }
  button:disabled { background: #e6ebf1; color: #435467; box-shadow: none; border-color: #c4ceda; }
  .list-panel { border: 1px solid #d3dde8; border-radius: .35rem; padding: 1.25rem; }
  input { max-width: 24rem; margin-bottom: 1rem; }
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; text-align: left; min-width: 40rem; }
  th, td { padding: .8rem; border-bottom: 1px solid #d3dde8; }
  th { background: #edf2f8; }
</style>
