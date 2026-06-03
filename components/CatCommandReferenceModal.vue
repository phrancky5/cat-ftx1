<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="cat-ref-overlay"
      @click.self="close"
    >
      <div
        class="cat-ref-panel"
        role="dialog"
        aria-modal="true"
        aria-label="CAT command reference"
      >
        <header class="cat-ref-header">
          <div>
            <h2 class="cat-ref-title">CAT Command Reference</h2>
            <p class="cat-ref-sub">
              FTX-1 Control-Command manual — page 4 (usage) + quick reference of all {{ CAT_COMMANDS.length }} catalogued commands.
            </p>
          </div>
          <button class="cat-ref-close" type="button" aria-label="Close" @click="close">✕</button>
        </header>

        <div class="cat-ref-body">
          <section class="cat-ref-section">
            <h3 class="cat-ref-h3">Control Command structure</h3>
            <p>
              A computer control command is composed of an <strong>alphabetical command</strong>,
              <strong>various parameters</strong>, and the <strong>terminator</strong> that
              signals the end of the control command.
            </p>
            <pre class="cat-ref-codeblock">FA   014250000   ;
↑      ↑          ↑
Command Parameter Terminator</pre>

            <p>There are three forms in CAT:</p>
            <ul class="cat-ref-list">
              <li><strong>Set</strong> command — sets a particular condition <em>(to the FTX-1)</em>.</li>
              <li><strong>Read</strong> command — reads an answer <em>(from the FTX-1)</em>.</li>
              <li><strong>Answer</strong> command — radio transmits a condition <em>(from the FTX-1)</em>.</li>
            </ul>

            <p>Example with FA (MAIN-side frequency):</p>
            <ul class="cat-ref-list">
              <li>Set 14.250000 MHz → host sends <code>FA014250000;</code></li>
              <li>Read the frequency → host sends <code>FA;</code></li>
              <li>Radio replies → <code>FA014250000;</code></li>
            </ul>

            <h3 class="cat-ref-h3">Alphabetical commands</h3>
            <p>
              Every command starts with <strong>2 alphabetical characters</strong>
              (case-insensitive; this UI auto-uppercases them).
            </p>

            <h3 class="cat-ref-h3">Parameters</h3>
            <p>
              Parameters specify the information needed to implement the command.
              The number of digits is fixed per command. Common mistakes
              (using the IF-shift parameter <code>IS00+1000</code> as the reference):
            </p>
            <table class="cat-ref-mistakes">
              <thead><tr><th>Input</th><th>Why it's wrong</th></tr></thead>
              <tbody>
                <tr><td><code>IS001000;</code></td><td>Missing direction sign (+/−)</td></tr>
                <tr><td><code>IS00+100;</code></td><td>Not enough digits (3 instead of 4)</td></tr>
                <tr><td><code>IS00_+_1000;</code></td><td>Unnecessary characters between fields</td></tr>
                <tr><td><code>IS00+10000;</code></td><td>Too many digits (5 instead of 4)</td></tr>
              </tbody>
            </table>
            <p class="cat-ref-note">
              <strong>Note:</strong> If a parameter doesn't apply to the FTX-1, the digits
              should be filled using any character except ASCII control codes (00–1Fh)
              and the terminator (<code>;</code>).
            </p>

            <h3 class="cat-ref-h3">Terminator</h3>
            <p>
              Every command ends with a semicolon (<code>;</code>). This app appends
              the terminator automatically when sending — you only enter the code +
              parameter.
            </p>
          </section>

          <section class="cat-ref-section">
            <h3 class="cat-ref-h3">Quick reference — {{ CAT_COMMANDS.length }} commands</h3>
            <div class="cat-ref-toolbar">
              <input
                v-model="helpFilter"
                type="text"
                placeholder="Filter (code, name, category, description…)"
                class="cat-ref-filter"
                spellcheck="false"
              />
              <span class="cat-ref-legend">
                <code>S</code> = Set,
                <code>R</code> = Read,
                <code>A</code> = Answer,
                <code>I</code> = AI (auto-info)
              </span>
            </div>

            <div class="cat-ref-tablewrap">
              <table class="cat-ref-table">
                <thead>
                  <tr>
                    <th class="cat-ref-th" @click="setHelpSort('code')">
                      Code
                      <span class="cat-ref-sortmark">{{ helpSortKey === 'code' ? (helpSortDir === 'asc' ? '▲' : '▼') : '' }}</span>
                    </th>
                    <th class="cat-ref-th" @click="setHelpSort('name')">
                      Name
                      <span class="cat-ref-sortmark">{{ helpSortKey === 'name' ? (helpSortDir === 'asc' ? '▲' : '▼') : '' }}</span>
                    </th>
                    <th class="cat-ref-th" @click="setHelpSort('category')">
                      Category
                      <span class="cat-ref-sortmark">{{ helpSortKey === 'category' ? (helpSortDir === 'asc' ? '▲' : '▼') : '' }}</span>
                    </th>
                    <th class="cat-ref-th-nosort">SRAI</th>
                    <th class="cat-ref-th-nosort">Example shape</th>
                    <th class="cat-ref-th" @click="setHelpSort('manualPage')">
                      Page
                      <span class="cat-ref-sortmark">{{ helpSortKey === 'manualPage' ? (helpSortDir === 'asc' ? '▲' : '▼') : '' }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="r in helpRows"
                    :key="r.code"
                    class="cat-ref-row"
                    :title="r.description + (selectable ? '\n\nClick to use this command.' : '')"
                    @click="selectable ? onRowClick(r.def) : undefined"
                  >
                    <td class="cat-ref-code">{{ r.code }}</td>
                    <td>{{ r.name }}</td>
                    <td class="cat-ref-cat">{{ r.category }}</td>
                    <td class="cat-ref-srai">{{ supportsBadge(r.supports) }}</td>
                    <td class="cat-ref-shape"><code>{{ r.shape }}</code></td>
                    <td class="cat-ref-page">{{ r.manualPage }}</td>
                  </tr>
                  <tr v-if="helpRows.length === 0">
                    <td colspan="6" class="cat-ref-empty">No commands match "{{ helpFilter }}".</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="selectable" class="cat-ref-select-hint">Click a row to load that command into the editor.</p>
          </section>
        </div>

        <footer class="cat-ref-footer">
          <span class="cat-ref-foot-note">
            Source: Yaesu "CAT Operation Reference Manual" (FTX-1) — <code>docs/CAT-FTX1.pdf</code>
          </span>
          <button type="button" class="cat-ref-btn-primary" @click="close">Close</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { CAT_COMMANDS, type CommandDef } from './cat-commands-ftx1'
import { supportsBadge, useCatCommandHelpTable } from '~/composables/useCatCommandUi'

const open = defineModel<boolean>({ required: true })

withDefaults(defineProps<{
  /** When true, clicking a table row emits `select` and closes the modal. */
  selectable?: boolean
}>(), {
  selectable: false,
})

const emit = defineEmits<{
  select: [def: CommandDef]
}>()

const { helpSortKey, helpSortDir, helpFilter, helpRows, setHelpSort } = useCatCommandHelpTable()

function close() {
  open.value = false
}

function onRowClick(def: CommandDef) {
  emit('select', def)
  close()
}
</script>

<style scoped>
.cat-ref-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
}

.cat-ref-panel {
  width: min(960px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 10px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  color: #c9d1d9;
}

.cat-ref-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #30363d;
  background: #161b22;
  gap: 12px;
  flex-shrink: 0;
}

.cat-ref-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.cat-ref-sub {
  margin: 4px 0 0;
  color: #8b949e;
  font-size: 12px;
}

.cat-ref-close {
  background: transparent;
  border: 1px solid #30363d;
  color: #c9d1d9;
  border-radius: 4px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  flex-shrink: 0;
}

.cat-ref-close:hover {
  background: #30363d;
  color: #fff;
}

.cat-ref-body {
  padding: 16px 20px 20px;
  overflow-y: auto;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-size: 13px;
  line-height: 1.55;
}

.cat-ref-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cat-ref-h3 {
  margin: 4px 0 2px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.cat-ref-codeblock {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 10px 12px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  white-space: pre;
  color: #d1d5db;
  margin: 0;
}

.cat-ref-list {
  margin: 0;
  padding-left: 20px;
}

.cat-ref-list li { margin: 2px 0; }

.cat-ref-note {
  font-size: 12px;
  color: #8b949e;
  margin: 0;
}

.cat-ref-mistakes {
  border-collapse: collapse;
  font-size: 12px;
}

.cat-ref-mistakes th,
.cat-ref-mistakes td {
  border: 1px solid #30363d;
  padding: 6px 10px;
  text-align: left;
}

.cat-ref-mistakes th {
  background: #161b22;
  color: #8b949e;
}

.cat-ref-mistakes code {
  font-family: var(--font-mono, ui-monospace, monospace);
}

.cat-ref-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.cat-ref-filter {
  flex: 1 1 200px;
  min-width: 180px;
  background: #0d1117;
  border: 1px solid #30363d;
  color: #e6edf3;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 13px;
}

.cat-ref-filter:focus {
  outline: 2px solid #388bfd;
}

.cat-ref-legend {
  font-size: 11px;
  color: #8b949e;
}

.cat-ref-legend code {
  font-family: var(--font-mono, ui-monospace, monospace);
  color: #d29922;
}

.cat-ref-tablewrap {
  overflow: auto;
  max-height: 42vh;
  border: 1px solid #30363d;
  border-radius: 6px;
}

.cat-ref-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.cat-ref-table thead {
  position: sticky;
  top: 0;
  background: #161b22;
  z-index: 1;
}

.cat-ref-th,
.cat-ref-th-nosort {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid #30363d;
  color: #8b949e;
  font-weight: 600;
  white-space: nowrap;
}

.cat-ref-th {
  cursor: pointer;
  user-select: none;
}

.cat-ref-th:hover { color: #e6edf3; }

.cat-ref-sortmark {
  display: inline-block;
  width: 12px;
  margin-left: 2px;
}

.cat-ref-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #21262d;
  vertical-align: top;
}

.cat-ref-row {
  cursor: default;
}

.cat-ref-row:hover {
  background: rgba(88, 166, 255, 0.08);
}

.cat-ref-panel:has(.cat-ref-select-hint) .cat-ref-row {
  cursor: pointer;
}

.cat-ref-code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-weight: 700;
  color: #58a6ff;
}

.cat-ref-cat {
  color: #8b949e;
  text-transform: capitalize;
}

.cat-ref-srai {
  font-family: var(--font-mono, ui-monospace, monospace);
  color: #d29922;
  letter-spacing: 1px;
}

.cat-ref-shape code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  color: #a5d6ff;
}

.cat-ref-page {
  color: #6e7681;
  white-space: nowrap;
}

.cat-ref-empty {
  text-align: center;
  color: #8b949e;
  font-style: italic;
  padding: 16px !important;
}

.cat-ref-select-hint {
  margin: 0;
  font-size: 11px;
  color: #8b949e;
}

.cat-ref-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid #30363d;
  background: #161b22;
  flex-shrink: 0;
}

.cat-ref-foot-note {
  font-size: 11px;
  color: #8b949e;
}

.cat-ref-foot-note code {
  font-family: var(--font-mono, ui-monospace, monospace);
}

.cat-ref-btn-primary {
  background: #238636;
  border: 1px solid #2ea043;
  color: #fff;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
}

.cat-ref-btn-primary:hover {
  background: #2ea043;
}
</style>