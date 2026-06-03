<template>
  <section class="mcc-section">
    <div class="mcc-head">
      <span class="mcc-label">CAT Command</span>
      <button
        type="button"
        class="mcc-help-btn"
        title="CAT command reference (FTX-1 manual + examples)"
        aria-label="Open CAT command reference"
        @click="showHelp = true"
      >?</button>
      <span v-if="response" class="mcc-response" :title="response">→ {{ response }}</span>
      <label class="mcc-terminal-toggle">
        <input v-model="catTerminalOpen" type="checkbox" />
        <span>Live CAT Terminal</span>
      </label>
      <button
        type="button"
        class="btn btn-primary btn-sm mcc-head-send"
        :disabled="!canSend"
        @click="emitSend"
      >Send</button>
    </div>

    <div
      ref="anchorRef"
      class="mcc-editor"
      :class="`mcc-editor--${validation.level}`"
    >
      <div class="mcc-row mcc-row--code">
        <input
          v-model="code"
          type="text"
          maxlength="2"
          spellcheck="false"
          class="mcc-code"
          placeholder="XX"
          :title="defFor(code)?.description ?? 'Two-letter CAT command code (click ▾ to browse)'"
          @input="onCodeInput"
          @focus="openPicker(false)"
          @click="openPicker(false)"
          @keydown="onInputKeydown"
        />
        <button
          type="button"
          class="mcc-browse"
          title="Browse commands by category"
          @click="openPicker(true)"
        >▾</button>
        <span
          v-if="defFor(code)"
          class="mcc-name"
          :title="defFor(code)!.description"
        >{{ defFor(code)!.name }}</span>
        <span
          v-else-if="code.length === 2"
          class="mcc-name mcc-name--custom"
          title="Custom / unknown command"
        >Custom command</span>
        <span v-else class="mcc-name mcc-name--hint">Click ▾ to browse</span>
      </div>

      <div class="mcc-row mcc-row--param">
        <input
          v-if="paramTypeOf(code) !== 'none'"
          v-model="param"
          type="text"
          spellcheck="false"
          class="mcc-param"
          :placeholder="paramPlaceholder(code)"
          :title="paramLabelOf(code) ?? 'Command parameter'"
          @input="onParamInput"
          @keydown="onInputKeydown"
        />
        <span v-else class="mcc-param-none">— no parameter —</span>
        <small v-if="paramHintOf(code)" class="mcc-hint">{{ paramHintOf(code) }}</small>
        <small v-else-if="code.length === 2" class="mcc-hint mcc-hint--shape">
          Example: <code>{{ exampleShape(code) }}</code>
        </small>
      </div>

      <div class="mcc-row mcc-row--footer">
        <code class="mcc-preview" :title="`Will be sent as: ${preview};`">{{ preview }};</code>
        <span
          class="mcc-validate"
          :class="`mcc-validate--${validation.level}`"
          :title="validationTooltip(validation)"
          @click="showHelp = true"
        >{{ validationBadge(validation.level) }}</span>
      </div>

      <div
        v-if="historyOpen && historyNewestFirst.length > 0"
        ref="historyListRef"
        class="mcc-history"
        role="listbox"
        aria-label="Recent CAT commands"
      >
        <div class="mcc-history-title">Recent commands (↑↓ navigate · Enter use · Esc close)</div>
        <div
          v-for="(entry, i) in historyNewestFirst"
          :key="`${entry}-${i}`"
          class="mcc-history-item"
          :class="{ 'mcc-history-item--highlight': i === historyHighlightIndex }"
          role="option"
          :aria-selected="i === historyHighlightIndex"
          @mousedown.prevent="selectHistoryIndex(i)"
        >
          <code>{{ entry }};</code>
        </div>
      </div>

      <p
        v-if="validation.issues.length > 0"
        class="mcc-issue"
        :class="`mcc-issue--${validation.level}`"
      >{{ validation.issues[0].message }}</p>
    </div>

    <CatCommandPicker
      :open="pickerOpen"
      :anchor-el="anchorRef"
      :focus-filter-on-open="pickerFocusFilter"
      @pick="onPick"
      @close="closePicker"
      @open-help="closePicker(); showHelp = true"
    />

    <CatCommandReferenceModal
      v-model="showHelp"
      selectable
      @select="onPick"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import CatCommandPicker from '~/components/CatCommandPicker.vue'
import CatCommandReferenceModal from '~/components/CatCommandReferenceModal.vue'
import {
  manualCatCommandBody,
  normalizeManualCatCommand,
  parseManualCatCommand,
  validateStep,
  type CommandDef,
} from '~/components/cat-commands-ftx1'
import {
  applyPickedCommand,
  defFor,
  exampleShape,
  paramHintOf,
  paramLabelOf,
  paramPlaceholder,
  paramTypeOf,
  validationBadge,
  validationTooltip,
} from '~/composables/useCatCommandUi'

const model = defineModel<string>({ default: '' })
const catTerminalOpen = defineModel<boolean>('catTerminalOpen', { default: false })

defineProps<{
  /** Last radio reply shown in the card header (e.g. `FA014250000;`). */
  response?: string
}>()

const emit = defineEmits<{
  send: [payload: { body: string; wire: string }]
}>()

const code = ref('')
const param = ref('')
const pickerOpen = ref(false)
const pickerFocusFilter = ref(false)
const showHelp = ref(false)
const anchorRef = ref<HTMLElement | null>(null)
const historyListRef = ref<HTMLElement | null>(null)
const syncingFromModel = ref(false)

const HISTORY_MAX = 40
const HISTORY_STORAGE_KEY = 'cat-ftx1-manual-cmd-history'

const history = ref<string[]>([])
const historyOpen = ref(false)
const historyHighlightIndex = ref(0)
const historyDraft = ref('')

const historyNewestFirst = computed(() => [...history.value].reverse())

const preview = computed(() => (code.value || '') + (param.value || ''))

const validation = computed(() => {
  if (!/^[A-Z]{2}$/.test(code.value)) {
    if (!code.value && !param.value) {
      return { level: 'ok' as const, issues: [] }
    }
    return {
      level: 'error' as const,
      issues: [{ level: 'error' as const, message: 'Enter a 2-letter CAT command code.' }],
    }
  }
  return validateStep(code.value, param.value)
})

const canSend = computed(() => preview.value.trim().length >= 2 && validation.value.level !== 'error')

function syncModelFromParts() {
  if (syncingFromModel.value) return
  const body = preview.value.trim()
  model.value = body ? normalizeManualCatCommand(body) : ''
}

function loadPartsFromModel(raw: string) {
  syncingFromModel.value = true
  const parsed = parseManualCatCommand(raw)
  if (parsed) {
    code.value = parsed.code
    param.value = parsed.param
  } else {
    const body = manualCatCommandBody(raw)
    code.value = body.slice(0, 2)
    param.value = body.slice(2)
  }
  syncingFromModel.value = false
}

watch(model, (v) => loadPartsFromModel(v), { immediate: true })
watch([code, param], syncModelFromParts)

function loadHistoryFromStorage() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      history.value = parsed
        .filter((e): e is string => typeof e === 'string')
        .map((e) => e.replace(/;+$/, '').trim())
        .filter(Boolean)
        .slice(-HISTORY_MAX)
    }
  } catch { /* ignore corrupt storage */ }
}

function saveHistoryToStorage() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.value))
  } catch { /* ignore quota errors */ }
}

function recordSentCommand(wire: string) {
  const body = wire.replace(/;+$/, '').trim()
  if (!body) return
  history.value = history.value.filter((h) => h !== body)
  history.value.push(body)
  if (history.value.length > HISTORY_MAX) {
    history.value = history.value.slice(-HISTORY_MAX)
  }
  saveHistoryToStorage()
}

function applyHistoryBody(body: string) {
  loadPartsFromModel(body ? normalizeManualCatCommand(body) : '')
  syncModelFromParts()
}

function exitHistoryBrowse(restoreDraft: boolean) {
  historyOpen.value = false
  historyHighlightIndex.value = 0
  if (restoreDraft) {
    if (historyDraft.value) applyHistoryBody(historyDraft.value)
    else if (!code.value && !param.value) resetFields()
  }
  historyDraft.value = ''
}

function selectHistoryIndex(index: number) {
  const entry = historyNewestFirst.value[index]
  if (!entry) return
  historyHighlightIndex.value = index
  applyHistoryBody(entry)
}

function openHistoryBrowse() {
  if (history.value.length === 0) return
  closePicker()
  if (!historyOpen.value) {
    historyDraft.value = preview.value.trim()
      ? manualCatCommandBody(model.value)
      : ''
    historyOpen.value = true
    historyHighlightIndex.value = 0
    selectHistoryIndex(0)
  }
  scrollHistoryHighlightIntoView()
}

function scrollHistoryHighlightIntoView() {
  nextTick(() => {
    const el = historyListRef.value?.querySelector('.mcc-history-item--highlight') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function onHistoryArrowUp() {
  if (!historyOpen.value) {
    openHistoryBrowse()
    return
  }
  const next = Math.min(
    historyHighlightIndex.value + 1,
    historyNewestFirst.value.length - 1,
  )
  if (next !== historyHighlightIndex.value) {
    selectHistoryIndex(next)
    scrollHistoryHighlightIntoView()
  }
}

function onHistoryArrowDown() {
  if (!historyOpen.value) return
  if (historyHighlightIndex.value > 0) {
    selectHistoryIndex(historyHighlightIndex.value - 1)
    scrollHistoryHighlightIntoView()
  } else {
    exitHistoryBrowse(true)
  }
}

function onCodeInput(ev: Event) {
  exitHistoryBrowse(false)
  const el = ev.target as HTMLInputElement
  code.value = el.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
  if (paramTypeOf(code.value) === 'none') param.value = ''
  else if (!param.value) {
    const dflt = defFor(code.value)?.paramDefault
    if (dflt) param.value = dflt
  }
}

function onParamInput(ev: Event) {
  exitHistoryBrowse(false)
  param.value = (ev.target as HTMLInputElement).value.toUpperCase()
}

function openPicker(focusFilter: boolean) {
  pickerFocusFilter.value = focusFilter
  pickerOpen.value = true
}

function closePicker() {
  pickerOpen.value = false
}

function onPick(def: CommandDef) {
  applyPickedCommand(code, param, def)
  closePicker()
}

function onInputKeydown(ev: KeyboardEvent) {
  if (pickerOpen.value) {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      ev.stopPropagation()
      closePicker()
    }
    return
  }
  if (historyOpen.value) {
    if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      onHistoryArrowUp()
      return
    }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      onHistoryArrowDown()
      return
    }
    if (ev.key === 'Escape') {
      ev.preventDefault()
      ev.stopPropagation()
      exitHistoryBrowse(true)
      return
    }
    if (ev.key === 'Enter') {
      ev.preventDefault()
      exitHistoryBrowse(false)
      return
    }
  } else if (ev.key === 'ArrowUp' && history.value.length > 0) {
    ev.preventDefault()
    onHistoryArrowUp()
    return
  }
  if (ev.key === 'Enter' && !showHelp.value) {
    ev.preventDefault()
    emitSend()
  }
}

function onDocumentMouseDown(ev: MouseEvent) {
  const target = ev.target as HTMLElement | null
  if (!target?.closest) return
  if (pickerOpen.value) {
    if (target.closest('.cat-pick')) return
    if (target.closest('.mcc-code')) return
    if (target.closest('.mcc-browse')) return
    closePicker()
  }
  if (historyOpen.value) {
    if (target.closest('.mcc-history')) return
    if (target.closest('.mcc-code')) return
    if (target.closest('.mcc-param')) return
    exitHistoryBrowse(true)
  }
}

function onDocumentKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return
  if (showHelp.value) {
    showHelp.value = false
    return
  }
  if (historyOpen.value) {
    exitHistoryBrowse(true)
    return
  }
  if (pickerOpen.value) closePicker()
}

function resetFields() {
  syncingFromModel.value = true
  code.value = ''
  param.value = ''
  model.value = ''
  syncingFromModel.value = false
  closePicker()
  exitHistoryBrowse(false)
}

function emitSend() {
  const wire = normalizeManualCatCommand(preview.value)
  if (!wire || validation.value.level === 'error') return
  model.value = wire
  emit('send', {
    body: wire.replace(/;+$/, '').trim(),
    wire,
  })
}

onMounted(() => {
  loadHistoryFromStorage()
  document.addEventListener('mousedown', onDocumentMouseDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})

defineExpose({ emitSend, canSend, resetFields, recordSentCommand })
</script>

<style scoped>
.mcc-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 14px;
}

.mcc-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.mcc-response {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--green, #10b981);
  padding: 3px 8px;
  background: rgba(63, 185, 80, 0.08);
  border-radius: 4px;
  max-width: min(320px, 40vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mcc-terminal-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  white-space: nowrap;
}

.mcc-terminal-toggle input {
  cursor: pointer;
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.mcc-terminal-toggle:hover {
  color: var(--text);
}

.mcc-head-send {
  flex-shrink: 0;
}

.mcc-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.mcc-help-btn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.mcc-help-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.mcc-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.mcc-editor--error { border-color: var(--red, #ef4444); }
.mcc-editor--warn { border-color: var(--amber, #f59e0b); }

.mcc-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.mcc-row--param {
  align-items: flex-start;
}

.mcc-row--footer {
  justify-content: flex-start;
}

.mcc-code {
  width: 44px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 1px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 5px 4px;
}

.mcc-code:focus { outline: 2px solid var(--accent); }

.mcc-browse {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.mcc-browse:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.mcc-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  flex: 1 1 120px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mcc-name--custom { color: var(--amber, #f59e0b); }
.mcc-name--hint { color: var(--text-muted); font-weight: 400; font-style: italic; }

.mcc-param {
  flex: 1 1 160px;
  min-width: 120px;
  font-family: var(--font-mono);
  font-size: 13px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 5px 10px;
}

.mcc-param:focus { outline: 2px solid var(--accent); }

.mcc-param-none {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.mcc-hint {
  flex: 1 1 100%;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}

.mcc-hint--shape code {
  font-family: var(--font-mono);
  color: var(--accent);
}

.mcc-preview {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--green, #10b981);
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 4px;
  padding: 3px 8px;
}

.mcc-validate {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 14px;
  cursor: help;
  border: 1px solid var(--border);
  background: var(--surface);
}

.mcc-validate--ok { color: var(--green, #10b981); }
.mcc-validate--warn { color: var(--amber, #f59e0b); }
.mcc-validate--error { color: var(--red, #ef4444); }

.mcc-history {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  max-height: 160px;
  overflow-y: auto;
}

.mcc-history-title {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
}

.mcc-history-item {
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.mcc-history-item:last-child {
  border-bottom: none;
}

.mcc-history-item:hover,
.mcc-history-item--highlight {
  background: rgba(88, 166, 255, 0.12);
}

.mcc-history-item code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--green, #10b981);
}

.mcc-issue {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
}

.mcc-issue--warn { color: var(--amber, #f59e0b); }
.mcc-issue--error { color: var(--red, #ef4444); }
</style>