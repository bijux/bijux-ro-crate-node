import {decodeCrateReference} from '@bijux/ro-crate-core'
import {fromDirectory, ValidationSession} from '../../packages/validator/dist/browser.js'

const element = id => document.getElementById(id)
const controller = new ValidationSession()
const descriptor = 'ro-crate-metadata.json'
const limit = 1048576
let selected = new Map()
let manifestRead = 0
let declaredPath

async function textOf(value) {
  if (typeof value === 'string') return value
  return value ? value.text() : undefined
}

async function loadManifest(path) {
  const revision = controller.snapshot().revision
  const read = ++manifestRead
  const editor = element('manifest-editor')
  editor.disabled = true
  editor.value = ''
  const file = selected.get(path)
  if (file === undefined || (typeof file !== 'string' && file.size > limit)) return
  const current = () => controller.snapshot().revision === revision && read === manifestRead && element('manifest-path').value === path
  try {
    const text = await textOf(file)
    if (!current()) return
    editor.value = text
    editor.disabled = false
  } catch {
    if (current()) element('editor-help').textContent = 'The selected manifest could not be opened for editing. Reselect the files to try again.'
  }
}

function declaredManifest(text) {
  try {
    const graph = JSON.parse(text)['@graph']
    const file = graph?.find(entity => [entity['@type']].flat().some(type =>
      type === 'bia:FileList' || type === 'http://bia/FileList'))
    return file ? decodeCrateReference(file['@id']) : undefined
  } catch {return undefined}
}

async function refreshManifest(text) {
  const path = declaredManifest(text)
  const picker = element('manifest-path')
  if (path && selected.has(path) && (path !== declaredPath || !picker.value)) {
    if (![...picker.options].some(option => option.value === path)) picker.add(new Option(path, path))
    picker.value = path
  }
  declaredPath = path
  await loadManifest(picker.value)
}

async function select(files) {
  selected = files
  declaredPath = undefined
  manifestRead++
  controller.select(files)
  const revision = controller.snapshot().revision
  element('selected-files').textContent = `${files.size} selected files`
  const editor = element('metadata-editor')
  editor.disabled = true
  editor.value = ''
  const picker = element('manifest-path')
  picker.replaceChildren(new Option('Choose a selected manifest', ''))
  for (const path of files.keys()) {
    if (path !== descriptor && /\.(?:tsv|csv|txt)$/i.test(path)) picker.add(new Option(path, path))
  }
  element('manifest-editor').value = ''
  element('manifest-editor').disabled = true
  try {
    const metadata = files.get(descriptor)
    if (!metadata || metadata.size > limit) {
      element('editor-help').textContent = 'Large or missing metadata is validated without the bounded text editor.'
      return
    }
    const text = await textOf(metadata)
    if (controller.snapshot().revision !== revision) return
    editor.value = text
    editor.disabled = false
    await refreshManifest(text)
  } catch {
    if (controller.snapshot().revision === revision) controller.cancel()
  }
}

controller.subscribe(snapshot => {
  const {state, result, eligible} = snapshot
  element('result').dataset.state = state
  element('result').setAttribute('aria-busy', String(['editing', 'validating'].includes(state)))
  element('continue').disabled = !eligible
  element('cancel-validation').disabled = !['editing', 'validating'].includes(state)
  element('validate-now').disabled = !selected.size
  element('result-title').textContent = {
    idle: 'Ready to check', editing: 'Waiting for your edits…', validating: 'Checking your crate…',
    valid: 'Validation passed', invalid: 'Validation found errors', incomplete: 'Validation could not finish',
  }[state]
  element('result-description').textContent = result?.status === 'incomplete' ? result.reason :
    eligible ? 'The current selected bytes passed validation.' : 'Repair the current metadata or manifest to continue.'
  element('submission-status').textContent = eligible ? 'Ready when you are.' : 'Complete current validation to continue.'
  element('issues').replaceChildren()
  const issues = Object.entries(result?.report.issues ?? {}).flatMap(([level, values]) =>
    values.map(issue => ({...issue, level})))
  for (const issue of issues.slice(0, 200)) {
    const container = document.createElement('div')
    container.className = 'issue'
    for (const [tag, text] of [['strong', issue.level], ['p', issue.message], ['p', issue.location_description]]) {
      if (text === null) continue
      const row = document.createElement(tag)
      row.textContent = text
      container.append(row)
    }
    element('issues').append(container)
  }
  if (issues.length > 200) {
    const note = document.createElement('p')
    note.textContent = `Showing 200 of ${issues.length} findings. The complete report retains every finding.`
    element('issues').append(note)
  }
  element('raw-result').hidden = !result
  element('report-json').textContent = result ? JSON.stringify(result, null, 2) : ''
})

element('directory-picker').addEventListener('change', event => {
  try {select(fromDirectory(event.target.files))}
  catch {select(new Map())}
})
element('file-picker').addEventListener('change', event => {
  const files = new Map()
  for (const file of event.target.files) {
    if (files.has(file.name)) {select(new Map()); return}
    files.set(file.name, file)
  }
  select(files)
})
element('metadata-editor').addEventListener('input', event => {
  selected.set(descriptor, event.target.value)
  controller.edit(descriptor, event.target.value)
  refreshManifest(event.target.value)
})
element('manifest-path').addEventListener('change', event => loadManifest(event.target.value))
element('manifest-editor').addEventListener('input', event => {
  const path = element('manifest-path').value
  if (!path) return
  selected.set(path, event.target.value)
  controller.edit(path, event.target.value)
})
element('cancel-validation').addEventListener('click', () => controller.cancel())
element('validate-now').addEventListener('click', () => {
  controller.revalidate()
  loadManifest(element('manifest-path').value)
})
element('submission-form').addEventListener('submit', event => {
  event.preventDefault()
  if (!controller.snapshot().eligible) return
  const detail = controller.continue()
  document.dispatchEvent(new CustomEvent('cratevalidated', {detail}))
  element('submission-status').textContent = 'The current validated snapshot is ready for your application.'
})
window.addEventListener('pagehide', event => {
  if (event.persisted) controller.cancel()
  else controller.dispose()
})
window.addEventListener('pageshow', event => {
  if (event.persisted && selected.size) {
    controller.revalidate()
    loadManifest(element('manifest-path').value)
  }
})
