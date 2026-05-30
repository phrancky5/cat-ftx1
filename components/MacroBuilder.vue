<template>
  <div class="mb-overlay" @click.self="$emit('close')">
    <div class="mb-panel" role="dialog" aria-label="Macro Builder">
      <header class="mb-head">
        <div class="mb-head-title">
          <h2>Macro Builder</h2>
          <span class="mb-head-hint">Click a command on the left to add it as a step on the right</span>
        </div>
        <button class="mb-close" @click="$emit('close')" aria-label="Close">✕</button>
      </header>

      <div class="mb-body">
        <!-- ── Left: command library ─────────────────────────────────── -->
        <section class="mb-left">
          <div class="mb-left-controls">
            <input
              v-model="commandFilter"
              type="text"
              placeholder="filter…"
              class="mb-filter"
              spellcheck="false"
            >
            <select v-model="selectedCategory" class="mb-cat">
              <option value="">all</option>
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
            <button
              class="mb-newcmd-btn"
              @click="openNewCommand"
              title="Define a new CAT command"
            >+ New cmd</button>
          </div>

          <ul class="mb-cmd-list">
            <li
              v-for="cmd in filteredCommands"
              :key="cmd.id"
              class="mb-cmd-row"
              :title="cmd.description ?? cmd.name"
              @click="addStep(cmd)"
            >
              <span class="mb-cmd-cat">{{ cmd.category }}</span>
              <span class="mb-cmd-name">{{ cmd.name }}</span>
              <code class="mb-cmd-tpl">{{ cmd.raw_template }}</code>
              <button
                v-if="!cmd.is_builtin"
                class="mb-cmd-del"
                title="Delete custom command"
                @click.stop="deleteCommand(cmd)"
              >✕</button>
            </li>
            <li v-if="filteredCommands.length === 0 && commands.length === 0" class="mb-cmd-empty">
              No commands yet — click <strong>+ New cmd</strong> to add one.
            </li>
            <li v-else-if="filteredCommands.length === 0" class="mb-cmd-empty">
              No commands match the current filter.
            </li>
          </ul>
        </section>

        <!-- ── Right: current macro ──────────────────────────────────── -->
        <section class="mb-right">
          <div class="mb-saved-row">
            <select
              class="mb-saved-select"
              :value="editing.id ?? ''"
              @change="onSavedSelect(($event.target as HTMLSelectElement).value)"
            >
              <option value="">+ New macro</option>
              <option v-for="m in macros" :key="m.id" :value="m.id">
                {{ m.name }} ({{ m.step_count }})
              </option>
            </select>
            <input
              v-model="editing.name"
              class="mb-macro-name"
              placeholder="Macro name *"
              maxlength="64"
              spellcheck="false"
            >
            <button
              v-if="editing.id"
              class="mb-del-macro"
              title="Delete this macro"
              @click="deleteMacro"
            >Delete</button>
          </div>

          <input
            v-model="editing.description"
            class="mb-macro-desc"
            placeholder="Description (optional)"
            maxlength="200"
          >

          <ol class="mb-steps">
            <li v-if="editing.steps.length === 0" class="mb-steps-empty">
              Click a command on the left to add a step.
            </li>
            <li
              v-for="(step, idx) in editing.steps"
              :key="idx"
              class="mb-step"
            >
              <span class="mb-step-pos">{{ idx + 1 }}.</span>
              <span class="mb-step-name" :title="step.commandName">{{ step.commandName }}</span>
              <code class="mb-step-tpl" :title="step.template">{{ step.preview }}</code>
              <input
                v-if="step.hasParam"
                v-model.number="step.param_value"
                type="number"
                class="mb-step-param"
                :placeholder="step.paramLabel || 'value'"
                :title="step.paramLabel || 'parameter'"
                @input="rerenderPreview(step)"
              >
              <span v-else class="mb-step-param mb-step-param--na" title="No parameter">—</span>
              <input
                v-model.number="step.delay_ms"
                type="number"
                min="0"
                max="60000"
                step="50"
                class="mb-step-delay"
                title="Delay after step (ms)"
              >
              <span class="mb-step-await" :title="step.expectsResponse ? 'Awaits radio reply' : ''">{{ step.expectsResponse ? '⏱' : '' }}</span>
              <button class="mb-step-btn" :disabled="idx === 0" title="Move up"   @click="moveStep(idx, -1)">↑</button>
              <button class="mb-step-btn" :disabled="idx === editing.steps.length - 1" title="Move down" @click="moveStep(idx, 1)">↓</button>
              <button class="mb-step-btn mb-step-del" title="Remove" @click="removeStep(idx)">✕</button>
            </li>
          </ol>

          <div class="mb-actions">
            <button class="mb-act-btn mb-act-save"  :disabled="!canSave || busy" @click="save">💾 Save</button>
            <button class="mb-act-btn mb-act-run"   :disabled="!canRun  || busy" @click="run">{{ running ? 'Running…' : '▶ Run' }}</button>
            <button class="mb-act-btn"              :disabled="editing.steps.length === 0 || busy" @click="clearSteps">Clear steps</button>
            <span class="mb-status" :class="statusClass">{{ status }}</span>
          </div>

          <!-- Run results -->
          <div v-if="runResults" class="mb-results">
            <h3>Last run · {{ runResults.ok ? 'OK' : 'FAILED' }}</h3>
            <ul>
              <li
                v-for="r in runResults.results"
                :key="r.position"
                :class="r.ok ? 'mb-res-ok' : 'mb-res-err'"
              >
                <span class="mb-res-pos">{{ r.position + 1 }}.</span>
                <code>{{ r.raw_command }}</code>
                <span v-if="r.awaited && r.response != null">→ <code>{{ r.response }}</code></span>
                <span v-if="r.error" class="mb-res-msg">{{ r.error }}</span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <!-- New command mini-dialog -->
      <div v-if="showNewCommand" class="mb-mini-overlay" @click.self="showNewCommand = false">
        <div class="mb-mini-panel" role="dialog" aria-label="New CAT command">
          <h3>New CAT command</h3>
          <label>
            <span>Name *</span>
            <input v-model="newCmd.name" maxlength="80" spellcheck="false">
          </label>
          <label>
            <span>Category *</span>
            <input v-model="newCmd.category" maxlength="40" placeholder="e.g. mode, dsp, frequency" spellcheck="false">
          </label>
          <label>
            <span>Template *</span>
            <input v-model="newCmd.raw_template" placeholder="e.g. MD02; or FA{hz:09d};" spellcheck="false">
          </label>
          <label>
            <span>Param type</span>
            <select v-model="newCmd.param_type">
              <option value="none">none</option>
              <option value="int">int (zero-padded)</option>
            </select>
          </label>
          <label v-if="newCmd.param_type === 'int'">
            <span>Param label</span>
            <input v-model="newCmd.param_label" placeholder="e.g. Frequency (Hz)">
          </label>
          <label v-if="newCmd.param_type === 'int'">
            <span>Param default</span>
            <input v-model="newCmd.param_default" placeholder="e.g. 14225000">
          </label>
          <label class="mb-mini-check">
            <input type="checkbox" v-model="newCmd.expects_response">
            <span>Expects response from radio</span>
          </label>
          <label>
            <span>Description</span>
            <input v-model="newCmd.description" maxlength="200">
          </label>

          <div class="mb-mini-err" v-if="newCmdErr">{{ newCmdErr }}</div>

          <div class="mb-mini-actions">
            <button class="mb-act-btn mb-act-save" @click="createCommand" :disabled="busy">Create</button>
            <button class="mb-act-btn" @click="showNewCommand = false">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// ── Types ────────────────────────────────────────────────────────────────
interface Command {
  id: number
  rig_id: string
  name: string
  category: string
  raw_template: string
  param_label: string | null
  param_type: 'none' | 'int'
  param_default: string | null
  expects_response: number
  description: string | null
  is_builtin: number
}
interface MacroSummary {
  id: number
  rig_id: string
  name: string
  description: string | null
  step_count: number
}
interface EditingStep {
  command_id: number
  commandName: string
  template: string
  hasParam: boolean
  paramLabel: string
  expectsResponse: boolean
  param_value: number | string | null
  delay_ms: number
  preview: string
}
interface EditingMacro {
  id: number | null
  name: string
  description: string
  steps: EditingStep[]
}
interface RunResults {
  ok: boolean
  results: Array<{
    position: number
    raw_command: string
    ok: boolean
    awaited: boolean
    response?: string | null
    error?: string
  }>
}

const props = defineProps<{ openMacroId?: number | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

// ── State ────────────────────────────────────────────────────────────────
const commands = ref<Command[]>([])
const macros = ref<MacroSummary[]>([])

const commandFilter = ref('')
const selectedCategory = ref('')

const editing = ref<EditingMacro>(emptyMacro())

const running = ref(false)
const busy = ref(false)
const status = ref('')
const statusClass = ref('')
const runResults = ref<RunResults | null>(null)

const showNewCommand = ref(false)
const newCmd = ref(emptyNewCmd())
const newCmdErr = ref<string | null>(null)

// ── Local-only helpers (mirror server template engine) ──────────────────
const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^}]*))?\}/g
function hasPlaceholder(tpl: string): boolean {
  return Array.from(tpl.matchAll(PLACEHOLDER_RE)).length === 1
}
function previewTemplate(tpl: string, value: number | string | null | undefined): string {
  const matches = Array.from(tpl.matchAll(PLACEHOLDER_RE))
  if (matches.length === 0) return tpl
  if (matches.length > 1) return tpl + '  (multi-param unsupported)'
  const [whole, , spec] = matches[0]
  if (value == null || value === '') return tpl.replace(whole, '?')
  const intSpec = /^(0?)(\d+)d$/.exec(spec ?? '')
  if (intSpec) {
    const width = Number.parseInt(intSpec[2], 10)
    const n = Number(value)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return tpl.replace(whole, '?')
    const formatted = String(n).padStart(width, '0')
    if (formatted.length > width) return tpl.replace(whole, '?')
    return tpl.replace(whole, formatted)
  }
  return tpl.replace(whole, String(value))
}

// ── Derived ──────────────────────────────────────────────────────────────
const categories = computed(() => {
  const set = new Set<string>()
  for (const c of commands.value) set.add(c.category)
  return Array.from(set).sort()
})

const filteredCommands = computed(() => {
  const q = commandFilter.value.trim().toLowerCase()
  const cat = selectedCategory.value
  return commands.value.filter((c) => {
    if (cat && c.category !== cat) return false
    if (!q) return true
    return c.name.toLowerCase().includes(q)
        || c.raw_template.toLowerCase().includes(q)
        || (c.description ?? '').toLowerCase().includes(q)
  })
})

const canSave = computed(() => editing.value.name.trim() !== '' && editing.value.steps.length > 0)
const canRun  = computed(() => editing.value.id != null && editing.value.steps.length > 0)

// ── Lifecycle ────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([loadCommands(), loadMacros()])
  if (props.openMacroId) await loadMacro(props.openMacroId)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !showNewCommand.value) {
    e.preventDefault()
    emit('close')
  }
}

// ── Loaders ──────────────────────────────────────────────────────────────
async function loadCommands() {
  const data = await $fetch<{ commands: Command[] }>('/api/cat-commands')
  commands.value = data.commands
}
async function loadMacros() {
  const data = await $fetch<{ macros: MacroSummary[] }>('/api/macros')
  macros.value = data.macros
}

async function loadMacro(id: number) {
  type Resp = { macro: MacroSummary, steps: Array<{
    position: number
    command_id: number
    raw_command: string
    param_value: string | null
    delay_ms: number
    command_name: string | null
    command_template: string | null
  }> }
  const data = await $fetch<Resp>(`/api/macros/${id}`)
  editing.value = {
    id: data.macro.id,
    name: data.macro.name,
    description: data.macro.description ?? '',
    steps: data.steps.map((s) => {
      const tpl = s.command_template ?? s.raw_command
      const has = hasPlaceholder(tpl)
      return {
        command_id: s.command_id,
        commandName: s.command_name ?? '(deleted command)',
        template: tpl,
        hasParam: has,
        paramLabel: '',
        expectsResponse: false, // server doesn't return this on steps; refreshed via cmd lookup below
        param_value: s.param_value ?? '',
        delay_ms: s.delay_ms,
        preview: s.raw_command,
      }
    }),
  }
  // Backfill paramLabel / expectsResponse from the commands cache.
  for (const step of editing.value.steps) {
    const cmd = commands.value.find((c) => c.id === step.command_id)
    if (cmd) {
      step.paramLabel = cmd.param_label ?? ''
      step.expectsResponse = !!cmd.expects_response
    }
  }
  setStatus('', '')
  runResults.value = null
}

function onSavedSelect(val: string) {
  if (!val) {
    editing.value = emptyMacro()
    runResults.value = null
    return
  }
  loadMacro(Number(val))
}

// ── Step ops ─────────────────────────────────────────────────────────────
function addStep(cmd: Command) {
  const has = hasPlaceholder(cmd.raw_template)
  const initial = has ? (cmd.param_default ?? '') : ''
  editing.value.steps.push({
    command_id: cmd.id,
    commandName: cmd.name,
    template: cmd.raw_template,
    hasParam: has,
    paramLabel: cmd.param_label ?? '',
    expectsResponse: !!cmd.expects_response,
    param_value: has ? (initial === '' ? '' : Number(initial)) : '',
    delay_ms: 100,
    preview: previewTemplate(cmd.raw_template, has ? initial : null),
  })
  runResults.value = null
}

function rerenderPreview(step: EditingStep) {
  step.preview = previewTemplate(step.template, step.param_value)
}

function removeStep(idx: number) {
  editing.value.steps.splice(idx, 1)
  runResults.value = null
}

function moveStep(idx: number, dir: -1 | 1) {
  const swap = idx + dir
  if (swap < 0 || swap >= editing.value.steps.length) return
  const arr = editing.value.steps
  const tmp = arr[idx]; arr[idx] = arr[swap]; arr[swap] = tmp
}

function clearSteps() {
  editing.value.steps = []
  runResults.value = null
}

function emptyMacro(): EditingMacro {
  return { id: null, name: '', description: '', steps: [] }
}
function emptyNewCmd() {
  return {
    name: '', category: '', raw_template: '',
    param_type: 'none' as 'none' | 'int',
    param_label: '', param_default: '',
    expects_response: false, description: '',
  }
}

// ── Save / Run / Delete ──────────────────────────────────────────────────
async function save() {
  if (!canSave.value || busy.value) return
  busy.value = true
  setStatus('Saving…', '')
  try {
    const payload: Record<string, unknown> = {
      name: editing.value.name.trim(),
      description: editing.value.description.trim() || null,
      steps: editing.value.steps.map((s) => ({
        command_id: s.command_id,
        param_value: s.hasParam ? (s.param_value === '' ? null : s.param_value) : null,
        delay_ms: Number(s.delay_ms) || 0,
      })),
    }
    if (editing.value.id == null) {
      const r = await $fetch<{ id: number }>('/api/macros', { method: 'POST', body: payload })
      editing.value.id = r.id
      setStatus(`Saved "${editing.value.name}"`, 'ok')
    } else {
      await $fetch(`/api/macros/${editing.value.id}`, { method: 'PUT', body: payload })
      setStatus(`Updated "${editing.value.name}"`, 'ok')
    }
    await loadMacros()
    emit('saved')
  } catch (e: any) {
    setStatus(extractError(e), 'err')
  } finally {
    busy.value = false
  }
}

async function run() {
  if (!canRun.value || busy.value) return
  busy.value = true
  running.value = true
  setStatus('Running…', '')
  runResults.value = null
  try {
    const r = await $fetch<RunResults>(`/api/macros/${editing.value.id}/run`, { method: 'POST', body: {} })
    runResults.value = r
    setStatus(r.ok ? 'Run OK' : 'Run failed', r.ok ? 'ok' : 'err')
  } catch (e: any) {
    setStatus(extractError(e), 'err')
  } finally {
    running.value = false
    busy.value = false
  }
}

async function deleteMacro() {
  if (editing.value.id == null || busy.value) return
  if (!confirm(`Delete macro "${editing.value.name}"?`)) return
  busy.value = true
  try {
    await $fetch(`/api/macros/${editing.value.id}`, { method: 'DELETE' })
    setStatus(`Deleted "${editing.value.name}"`, 'ok')
    editing.value = emptyMacro()
    runResults.value = null
    await loadMacros()
    emit('saved')
  } catch (e: any) {
    setStatus(extractError(e), 'err')
  } finally {
    busy.value = false
  }
}

// ── Custom-command dialog ────────────────────────────────────────────────
function openNewCommand() {
  newCmd.value = emptyNewCmd()
  newCmdErr.value = null
  showNewCommand.value = true
}

async function createCommand() {
  newCmdErr.value = null
  const c = newCmd.value
  if (!c.name.trim() || !c.category.trim() || !c.raw_template.trim()) {
    newCmdErr.value = 'name, category and template are required'
    return
  }
  busy.value = true
  try {
    await $fetch('/api/cat-commands', {
      method: 'POST',
      body: {
        name: c.name.trim(),
        category: c.category.trim(),
        raw_template: c.raw_template.trim(),
        param_label: c.param_label.trim() || null,
        param_type: c.param_type,
        param_default: c.param_default.trim() || null,
        expects_response: c.expects_response,
        description: c.description.trim() || null,
      },
    })
    showNewCommand.value = false
    await loadCommands()
    setStatus('Command added', 'ok')
  } catch (e: any) {
    newCmdErr.value = extractError(e)
  } finally {
    busy.value = false
  }
}

async function deleteCommand(cmd: Command) {
  if (cmd.is_builtin) return
  if (!confirm(`Delete custom command "${cmd.name}"?`)) return
  busy.value = true
  try {
    await $fetch(`/api/cat-commands/${cmd.id}`, { method: 'DELETE' })
    await loadCommands()
    setStatus(`Deleted "${cmd.name}"`, 'ok')
  } catch (e: any) {
    setStatus(extractError(e), 'err')
  } finally {
    busy.value = false
  }
}

// ── Misc ─────────────────────────────────────────────────────────────────
function setStatus(text: string, kind: '' | 'ok' | 'err') {
  status.value = text
  statusClass.value = kind === 'ok' ? 'mb-status--ok' : kind === 'err' ? 'mb-status--err' : ''
}

function extractError(e: any): string {
  return e?.data?.statusMessage
      ?? e?.data?.message
      ?? e?.statusMessage
      ?? e?.message
      ?? 'unknown error'
}
</script>

<style scoped>
.mb-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}

.mb-panel {
  flex: 1;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.mb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
}
.mb-head-title { display: flex; align-items: baseline; gap: 12px; }
.mb-head-title h2 {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text);
}
.mb-head-hint { font-size: 11px; color: var(--text-muted); }
.mb-close {
  background: none; border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer; padding: 0 4px;
}
.mb-close:hover { color: var(--text); }

/* Body grid */
.mb-body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(420px, 1.4fr);
  gap: 0;
  overflow: hidden;
}

/* ── Left pane ────────────────────────────────────────────────────────── */
.mb-left {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  overflow: hidden;
}
.mb-left-controls {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.mb-filter, .mb-cat {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  border-radius: 4px;
  outline: none;
}
.mb-filter { flex: 1; min-width: 0; }
.mb-cat { width: 120px; }
.mb-newcmd-btn {
  background: var(--surface2);
  color: var(--accent);
  border: 1px solid var(--border);
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.mb-newcmd-btn:hover { border-color: var(--accent); }

.mb-cmd-list {
  list-style: none;
  margin: 0; padding: 4px 0;
  overflow-y: auto;
}
.mb-cmd-row {
  display: grid;
  grid-template-columns: 64px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(80, 81, 82, 0.2);
  font-size: 12px;
}
.mb-cmd-row:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.mb-cmd-cat {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
}
.mb-cmd-name { color: var(--text); }
.mb-cmd-tpl {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
}
.mb-cmd-del {
  background: none; border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 0 4px;
}
.mb-cmd-del:hover { color: var(--red); }
.mb-cmd-empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Right pane ───────────────────────────────────────────────────────── */
.mb-right {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mb-saved-row {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  align-items: center;
}
.mb-saved-select, .mb-macro-name, .mb-macro-desc {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  border-radius: 4px;
  outline: none;
}
.mb-saved-select { width: 200px; }
.mb-macro-name { flex: 1; font-weight: 700; }
.mb-del-macro {
  background: var(--surface2);
  color: var(--red);
  border: 1px solid var(--red);
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 4px;
  cursor: pointer;
}
.mb-del-macro:hover { background: var(--red); color: var(--surface); }
.mb-macro-desc {
  margin: 8px 12px 0;
  width: calc(100% - 24px);
}

.mb-steps {
  list-style: none;
  margin: 8px 0;
  padding: 0 12px;
  overflow-y: auto;
  flex: 1;
}
.mb-steps-empty {
  padding: 30px 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}
.mb-step {
  display: grid;
  grid-template-columns: 28px 1.2fr 1fr 90px 70px 14px auto auto auto;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 4px;
  background: var(--surface2);
  font-size: 12px;
}
.mb-step-pos {
  font-family: var(--font-mono);
  color: var(--text-muted);
}
.mb-step-name { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mb-step-tpl {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mb-step-param, .mb-step-delay {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 3px;
  outline: none;
  width: 100%;
}
.mb-step-param:focus, .mb-step-delay:focus { border-color: var(--accent); }
.mb-step-param--na {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  opacity: 0.4;
  border-color: transparent;
  background: transparent;
}
.mb-step-await { color: var(--yellow); font-size: 11px; }
.mb-step-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  width: 22px;
  height: 22px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mb-step-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
}
.mb-step-btn:disabled { opacity: 0.3; cursor: default; }
.mb-step-btn.mb-step-del:hover:not(:disabled) {
  color: var(--red);
  border-color: var(--red);
}

/* Action bar */
.mb-actions {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  align-items: center;
}
.mb-act-btn {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  border-radius: 4px;
  cursor: pointer;
}
.mb-act-btn:hover:not(:disabled) { border-color: var(--accent); }
.mb-act-btn:disabled { opacity: 0.4; cursor: default; }
.mb-act-save {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
.mb-act-save:hover:not(:disabled) { filter: brightness(1.1); }
.mb-act-run { color: var(--green); border-color: var(--green); }
.mb-act-run:hover:not(:disabled) { background: var(--green); color: var(--bg); }
.mb-status {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.mb-status--ok  { color: var(--green); }
.mb-status--err { color: var(--red); }

/* Results */
.mb-results {
  border-top: 1px solid var(--border);
  background: var(--surface2);
  padding: 8px 12px;
  max-height: 200px;
  overflow-y: auto;
}
.mb-results h3 {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.mb-results ul { list-style: none; margin: 0; padding: 0; }
.mb-results li {
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 3px 6px;
  border-left: 2px solid transparent;
  margin-bottom: 2px;
}
.mb-res-ok  { border-left-color: var(--green); color: var(--text); }
.mb-res-err { border-left-color: var(--red);   color: var(--red); }
.mb-res-pos { display: inline-block; width: 24px; color: var(--text-muted); }
.mb-res-msg { color: var(--red); margin-left: 6px; }

/* New-command mini dialog */
.mb-mini-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mb-mini-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 18px 22px;
  width: min(440px, 90vw);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}
.mb-mini-panel h3 {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text);
  margin-bottom: 14px;
}
.mb-mini-panel label {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.mb-mini-panel label span {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.mb-mini-panel label input,
.mb-mini-panel label select {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  border-radius: 4px;
  outline: none;
}
.mb-mini-check {
  grid-template-columns: 110px 1fr !important;
}
.mb-mini-check input { width: 16px; height: 16px; justify-self: start; }
.mb-mini-err {
  margin: 8px 0;
  font-size: 11px;
  color: var(--red);
  font-family: var(--font-mono);
}
.mb-mini-actions {
  margin-top: 14px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
