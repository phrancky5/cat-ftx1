<template>
  <div class="pb-container">
    <header class="pb-header">
      <div class="pb-title-wrap">
        <h2 class="pb-title">Preset Editor</h2>
        <span class="pb-subtitle">Edits <code>cat-presets.json</code></span>
      </div>
      <div class="pb-header-actions">
        <button
          class="pb-help-btn"
          @click="openHelp"
          title="CAT command reference (FTX-1 manual page 4 + quick-reference table)"
          aria-label="Open CAT command reference"
        >?</button>
        <button class="pb-close" @click="onClose" aria-label="Close">✕</button>
      </div>
    </header>

    <div class="pb-body">
      <!-- ── Left: preset list ─────────────────────────────────────────── -->
      <aside class="pb-list">
        <h3 class="pb-section-title">Presets</h3>
        <div class="pb-list-items">
          <div
            v-for="p in presets"
            :key="p.id"
            class="pb-list-item"
            :class="{ active: isExisting && form.id === p.id }"
            @click="loadPresetIntoForm(p)"
          >
            <span class="pb-dot" :style="{ background: p.color || '#6b7280' }" />
            <span class="pb-list-label" :title="p.description ?? p.label">{{ p.label }}</span>
            <span class="pb-list-count" :title="`${p.commands.length} command${p.commands.length === 1 ? '' : 's'}`">{{ p.commands.length }}</span>
            <button
              class="pb-list-del"
              title="Delete preset"
              @click.stop="deletePreset(p.id)"
            >✕</button>
          </div>
          <div v-if="presets.length === 0" class="pb-list-empty">
            No presets yet. Click <strong>+ New Preset</strong> to add one.
          </div>
        </div>
        <button
          class="pb-btn pb-btn-primary pb-new-btn"
          :disabled="busy"
          @click="startNewPreset"
        >+ New Preset</button>
      </aside>

      <!-- ── Right: editor ─────────────────────────────────────────────── -->
      <section class="pb-editor">
        <!-- Metadata -->
        <div class="pb-form-row">
          <label class="pb-field">
            <span class="pb-field-label">ID (slug) *</span>
            <input
              v-model.trim="form.id"
              type="text"
              placeholder="e.g. aprs-on"
              :disabled="isExisting"
              maxlength="40"
              spellcheck="false"
              @input="validateId"
            />
            <small v-if="idError" class="pb-err">{{ idError }}</small>
          </label>
          <label class="pb-field">
            <span class="pb-field-label">Label *</span>
            <input
              v-model="form.label"
              type="text"
              placeholder="e.g. APRS ON"
              maxlength="80"
              spellcheck="false"
            />
          </label>
        </div>

        <div class="pb-form-row">
          <label class="pb-field pb-field-wide">
            <span class="pb-field-label">Description</span>
            <input
              v-model="form.description"
              type="text"
              placeholder="What this preset does"
              maxlength="200"
              spellcheck="false"
            />
          </label>
          <label class="pb-field pb-field-color">
            <span class="pb-field-label">Color</span>
            <div class="pb-color-pick">
              <input
                type="color"
                :value="form.color || '#f59e0b'"
                @input="form.color = ($event.target as HTMLInputElement).value"
              />
              <code class="pb-color-code">{{ form.color || '#f59e0b' }}</code>
            </div>
          </label>
        </div>

        <!-- ── Toggle switch (binary 0/1 commands) ───────────────────── -->
        <div
          class="pb-toggle-row"
          :class="{ 'pb-toggle-row--invalid': form.toggle && !toggleValidation.ok }"
        >
          <label class="pb-toggle-check">
            <input type="checkbox" v-model="form.toggle" />
            <span class="pb-toggle-text">
              <span class="pb-toggle-title">Toggle switch (on/off button)</span>
              <span class="pb-toggle-sub">
                Renders this preset as a single button with a green/red LED.
                The button reads the radio's current state and sends the
                opposite value. Eligible commands: a single binary <code>0</code>/<code>1</code>
                parameter — e.g. <code>BI</code>, <code>LK</code>, <code>MX</code>,
                <code>ST</code>, <code>TS</code>, <code>VX</code>.
              </span>
            </span>
          </label>

          <!-- Cosmetic sub-option: pick the visual style for the toggle.
               Only relevant when the parent toggle option is enabled. -->
          <label
            class="pb-toggle-check pb-toggle-style-check"
            :class="{ 'pb-toggle-style-check--disabled': !form.toggle }"
          >
            <input
              type="checkbox"
              v-model="form.toggleSwitch"
              :disabled="!form.toggle"
            />
            <span class="pb-toggle-text">
              <span class="pb-toggle-title">Use rocket-switch visual style</span>
              <span class="pb-toggle-sub">
                Cosmetic. When ticked, this toggle preset is drawn as a
                physical bat-handle switch on a dark panel; when un-ticked
                it uses the standard flat button with a small green/red LED.
                Set per preset so you can mix plain on/off buttons and
                fancy switches in the same grid.
              </span>
            </span>
          </label>

          <p
            v-if="form.toggle && !toggleValidation.ok"
            class="pb-toggle-err"
            role="alert"
          >
            <span class="pb-toggle-err-icon">✗</span>
            {{ toggleValidation.reason }}
          </p>
        </div>

        <!-- Command sequence -->
        <div class="pb-cmd-section">
          <div class="pb-cmd-header">
            <h3 class="pb-section-title">CAT command sequence</h3>
            <div class="pb-cmd-tools">
              <span v-if="!advancedRaw" class="pb-cmd-count">
                {{ steps.length }} step{{ steps.length === 1 ? '' : 's' }}
              </span>
              <label class="pb-raw-toggle" title="Switch to plain-text editing for unknown commands">
                <input type="checkbox" v-model="advancedRaw" @change="onToggleRaw" />
                <span>Raw mode</span>
              </label>
            </div>
          </div>

          <!-- Friendly step editor -->
          <div v-if="!advancedRaw" class="pb-steps">
            <div
              class="pb-steps-headrow"
              :class="{ 'pb-steps-grid--timing': presetTimingEnabled }"
              v-if="steps.length > 0"
            >
              <span class="pb-h pb-h-pos">#</span>
              <span class="pb-h pb-h-cmd">Command</span>
              <span class="pb-h pb-h-param">Parameter</span>
              <template v-if="presetTimingEnabled">
                <span class="pb-h pb-h-delay" title="Pause after this step (ms)">Delay</span>
                <span class="pb-h pb-h-await" title="Wait for radio reply before next step">Await</span>
              </template>
              <span class="pb-h pb-h-preview">Sent to radio</span>
              <span class="pb-h pb-h-validate" title="Validation against the FTX-1 CAT manual">✓</span>
              <span class="pb-h pb-h-act"></span>
            </div>
            <p v-if="presetTimingEnabled" class="pb-timing-hint">
              Step timing is <strong>on</strong> (Settings). Use for slow rigs (e.g. Kenwood @ 4800&nbsp;bps) or low-power hosts.
              Default gap: {{ presetDefaultDelayMs }}&nbsp;ms when a step leaves Delay empty.
            </p>

            <div v-if="steps.length === 0" class="pb-steps-empty">
              No steps yet. Click <strong>+ Add command</strong> below.
            </div>

            <div
              v-for="(s, idx) in steps"
              :key="s.key"
              class="pb-step-row"
              :class="[
                `pb-step-row--${stepValidations[idx]?.level ?? 'ok'}`,
                { 'pb-steps-grid--timing': presetTimingEnabled },
              ]"
              :data-step-key="s.key"
            >
              <span class="pb-step-pos">{{ idx + 1 }}</span>

              <div class="pb-step-cmd-cell">
                <input
                  :value="s.code"
                  type="text"
                  maxlength="2"
                  spellcheck="false"
                  class="pb-step-code"
                  placeholder="XX"
                  :title="defFor(s.code)?.description ?? 'Two-letter CAT command code (click ▾ to browse)'"
                  @input="onCodeInput(s, $event)"
                  @focus="openPicker(s.key, false)"
                  @click="openPicker(s.key, false)"
                  @keydown="onPickerKey(s, $event)"
                />
                <button
                  type="button"
                  class="pb-step-browse"
                  title="Browse commands by category"
                  @click="openPicker(s.key, true)"
                >▾</button>
                <span
                  v-if="defFor(s.code)"
                  class="pb-step-name"
                  :title="defFor(s.code)!.description"
                >{{ defFor(s.code)!.name }}</span>
                <span
                  v-else-if="s.code.length === 2"
                  class="pb-step-name pb-step-name--custom"
                  title="Custom / unknown command — parameter is free-form text"
                >Custom command</span>
                <span
                  v-else
                  class="pb-step-name pb-step-name--hint"
                >Click to browse</span>
              </div>

              <div class="pb-step-param-cell">
                <input
                  v-if="paramTypeOf(s.code) !== 'none'"
                  v-model="s.param"
                  type="text"
                  spellcheck="false"
                  class="pb-step-param-input"
                  :placeholder="paramPlaceholder(s.code)"
                  :title="paramTitle(s.code)"
                />
                <span v-else class="pb-step-param-none">— no parameter —</span>
                <small v-if="paramHintOf(s.code)" class="pb-step-hint">
                  {{ paramHintOf(s.code) }}
                </small>
              </div>

              <template v-if="presetTimingEnabled">
                <div class="pb-step-delay-cell">
                  <input
                    v-model.number="s.delayMs"
                    type="number"
                    min="0"
                    max="60000"
                    step="10"
                    class="pb-step-delay-input"
                    :title="`Pause after this command (default ${presetDefaultDelayMs} ms)`"
                  />
                </div>
                <label class="pb-step-await-cell" :title="'Wait for reply (' + s.code + ')'">
                  <input v-model="s.await" type="checkbox" />
                </label>
              </template>

              <code class="pb-step-preview" :title="`Will be sent as: ${rawOf(s)};`">{{ rawOf(s) }};</code>

              <span
                class="pb-step-validate"
                :class="`pb-step-validate--${stepValidations[idx]?.level ?? 'ok'}`"
                :title="validationTooltip(stepValidations[idx] ?? { level: 'ok', issues: [] })"
                @click="openHelp"
              >{{ validationBadge(stepValidations[idx]?.level ?? 'ok') }}</span>

              <div class="pb-step-actions">
                <button
                  class="pb-icon-btn"
                  :disabled="idx === 0"
                  title="Move up"
                  @click="moveStep(idx, -1)"
                >↑</button>
                <button
                  class="pb-icon-btn"
                  :disabled="idx === steps.length - 1"
                  title="Move down"
                  @click="moveStep(idx, 1)"
                >↓</button>
                <button
                  class="pb-icon-btn pb-icon-del"
                  title="Remove step"
                  @click="removeStep(idx)"
                >✕</button>
              </div>

              <!-- ── Custom command picker (per-row dropdown) ─────────── -->
              <div
                v-if="pickerStepKey === s.key"
                class="pb-picker"
                :class="`pb-picker--${pickerPos.placement}`"
                :style="{
                  top: pickerPos.top + 'px',
                  left: pickerPos.left + 'px',
                  width: pickerPos.width + 'px',
                  maxHeight: pickerPos.maxHeight + 'px',
                }"
                role="listbox"
                aria-label="Browse CAT commands"
              >
                <div class="pb-picker-header">
                  <input
                    ref="pickerFilterEl"
                    v-model="pickerFilter"
                    type="text"
                    class="pb-picker-filter"
                    placeholder="Filter (code, name, category, description…)"
                    spellcheck="false"
                    @input="pickerHighlightIndex = 0"
                    @keydown="onPickerKey(s, $event)"
                  />
                  <span class="pb-picker-count">{{ pickerFlat.length }} / {{ CAT_COMMANDS.length }}</span>
                  <button
                    type="button"
                    class="pb-picker-close"
                    title="Close picker"
                    @click="closePicker"
                  >✕</button>
                </div>

                <div ref="pickerListEl" class="pb-picker-list">
                  <template v-for="g in pickerGroups" :key="g.category">
                    <div class="pb-picker-group">{{ g.category }}</div>
                    <div
                      v-for="item in g.items"
                      :key="item.code"
                      class="pb-picker-item"
                      :class="{
                        'pb-picker-item--highlight':
                          pickerFlat[pickerHighlightIndex]?.code === item.code,
                        'pb-picker-item--readonly': !item.supports.set,
                      }"
                      role="option"
                      :aria-selected="pickerFlat[pickerHighlightIndex]?.code === item.code"
                      @mousedown.prevent="pickCommand(s, item)"
                      @mouseenter="pickerHighlightIndex = pickerFlat.findIndex((c) => c.code === item.code)"
                    >
                      <span class="pb-picker-code">{{ item.code }}</span>
                      <div class="pb-picker-info">
                        <div class="pb-picker-name">
                          {{ item.name }}
                          <span v-if="!item.supports.set" class="pb-picker-ro" title="Read-only command — has no SET form">read-only</span>
                        </div>
                        <div class="pb-picker-desc">{{ item.description }}</div>
                      </div>
                      <div class="pb-picker-meta">
                        <span
                          class="pb-picker-srai"
                          title="Set · Read · Answer · AI support"
                        >{{ supportsBadge(item.supports) }}</span>
                        <span class="pb-picker-page">p.{{ item.manualPage }}</span>
                      </div>
                    </div>
                  </template>
                  <div v-if="pickerFlat.length === 0" class="pb-picker-empty">
                    No commands match "{{ pickerFilter }}".
                  </div>
                </div>

                <div class="pb-picker-footer">
                  <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                  <span><kbd>Enter</kbd> select</span>
                  <span><kbd>Esc</kbd> close</span>
                  <button
                    type="button"
                    class="pb-picker-helplink"
                    @click="closePicker(); openHelp()"
                  >Open full reference ?</button>
                </div>
              </div>
            </div>

            <button class="pb-btn pb-btn-ghost pb-add-step" @click="addStep()">+ Add command</button>
          </div>

          <!-- Raw textarea mode -->
          <div v-else class="pb-raw-mode">
            <textarea
              v-model="rawText"
              class="pb-raw-textarea"
              spellcheck="false"
              rows="10"
              placeholder="One command per line (without trailing ;)&#10;&#10;Example:&#10;VS0&#10;BS113&#10;MD1A&#10;FB144800000&#10;FR00&#10;FT0"
            ></textarea>
            <small class="pb-raw-hint">
              One CAT command per line. The trailing <code>;</code> is appended automatically by the radio bridge.
            </small>
            <ul v-if="rawStepValidations.length > 0" class="pb-raw-issues">
              <li
                v-for="(r, i) in rawStepValidations"
                :key="i"
                class="pb-raw-issue-row"
                :class="`pb-raw-issue-row--${r.level}`"
                :title="validationTooltip(r)"
              >
                <span class="pb-raw-issue-badge">{{ validationBadge(r.level) }}</span>
                <span class="pb-raw-issue-line">line {{ i + 1 }}</span>
                <span class="pb-raw-issue-msg">
                  {{ r.issues[0]?.message ?? 'valid' }}
                </span>
              </li>
            </ul>
          </div>

          <!-- Validation summary -->
          <div
            v-if="validationSummary.errorCount + validationSummary.warningCount > 0"
            class="pb-validation-summary"
            :class="`pb-validation-summary--${validationSummary.worst}`"
          >
            <span class="pb-vs-badge">{{ validationBadge(validationSummary.worst) }}</span>
            <span>
              {{ validationSummary.errorCount }}
              error{{ validationSummary.errorCount === 1 ? '' : 's' }},
              {{ validationSummary.warningCount }}
              warning{{ validationSummary.warningCount === 1 ? '' : 's' }}
              <span v-if="validationSummary.errorCount > 0" class="pb-vs-extra">
                — fix errors to enable Save.
              </span>
              <span v-else class="pb-vs-extra">
                — warnings won't block save.
              </span>
            </span>
            <button class="pb-vs-help" @click="openHelp" title="Open the CAT command reference">
              Open reference ?
            </button>
          </div>
        </div>

        <!-- Footer actions -->
        <div class="pb-actions">
          <button
            class="pb-btn pb-btn-primary"
            :disabled="!canSave || busy"
            @click="save"
          >{{ busy ? 'Saving…' : '💾 Save' }}</button>
          <button
            class="pb-btn pb-btn-ghost"
            :disabled="busy"
            @click="resetForm"
          >Reset</button>
          <span
            v-if="status"
            class="pb-status"
            :class="statusKind ? 'pb-status--' + statusKind : ''"
          >{{ status }}</span>
        </div>
      </section>
    </div>

    <!-- ── Help modal (page 4 of the manual + quick reference) ─────────── -->
    <div v-if="showHelp" class="pb-help-overlay" @click.self="closeHelp">
      <div class="pb-help-panel" role="dialog" aria-modal="true" aria-label="CAT command reference">
        <header class="pb-help-header">
          <div>
            <h2 class="pb-help-title">CAT Command Reference</h2>
            <p class="pb-help-sub">FTX-1 Control-Command manual — page 4 (usage) + quick reference of all {{ CAT_COMMANDS.length }} catalogued commands.</p>
          </div>
          <button class="pb-close" @click="closeHelp" aria-label="Close help">✕</button>
        </header>

        <div class="pb-help-body">
          <!-- ── Page 4: usage primer ─────────────────────────────────── -->
          <section class="pb-help-section">
            <h3 class="pb-help-h3">Control Command structure</h3>
            <p>
              A computer control command is composed of an <strong>alphabetical command</strong>,
              <strong>various parameters</strong>, and the <strong>terminator</strong> that
              signals the end of the control command.
            </p>
            <pre class="pb-help-codeblock">FA   014250000   ;
↑      ↑          ↑
Command Parameter Terminator</pre>

            <p>There are three forms in CAT:</p>
            <ul class="pb-help-list">
              <li><strong>Set</strong> command — sets a particular condition <em>(to the FTX-1)</em>.</li>
              <li><strong>Read</strong> command — reads an answer <em>(from the FTX-1)</em>.</li>
              <li><strong>Answer</strong> command — radio transmits a condition <em>(from the FTX-1)</em>.</li>
            </ul>

            <p>Example with FA (MAIN-side frequency):</p>
            <ul class="pb-help-list">
              <li>Set 14.250000 MHz → host sends <code>FA014250000;</code></li>
              <li>Read the frequency → host sends <code>FA;</code></li>
              <li>Radio replies → <code>FA014250000;</code></li>
            </ul>

            <h3 class="pb-help-h3">Alphabetical commands</h3>
            <p>
              Every command starts with <strong>2 alphabetical characters</strong>
              (case-insensitive; this UI auto-uppercases them).
            </p>

            <h3 class="pb-help-h3">Parameters</h3>
            <p>
              Parameters specify the information needed to implement the command.
              The number of digits is fixed per command. Common mistakes
              (using the IF-shift parameter <code>IS00+1000</code> as the reference):
            </p>
            <table class="pb-help-mistakes">
              <thead><tr><th>Input</th><th>Why it's wrong</th></tr></thead>
              <tbody>
                <tr><td><code>IS001000;</code></td><td>Missing direction sign (+/−)</td></tr>
                <tr><td><code>IS00+100;</code></td><td>Not enough digits (3 instead of 4)</td></tr>
                <tr><td><code>IS00_+_1000;</code></td><td>Unnecessary characters between fields</td></tr>
                <tr><td><code>IS00+10000;</code></td><td>Too many digits (5 instead of 4)</td></tr>
              </tbody>
            </table>
            <p class="pb-help-note">
              <strong>Note:</strong> If a parameter doesn't apply to the FTX-1, the digits
              should be filled using any character except ASCII control codes (00–1Fh)
              and the terminator (<code>;</code>).
            </p>

            <h3 class="pb-help-h3">Terminator</h3>
            <p>
              Every command ends with a semicolon (<code>;</code>). This editor appends
              the terminator automatically when sending — you only enter the code +
              parameter.
            </p>
          </section>

          <!-- ── Quick reference table ───────────────────────────────── -->
          <section class="pb-help-section">
            <h3 class="pb-help-h3">Quick reference — {{ CAT_COMMANDS.length }} commands</h3>
            <div class="pb-help-toolbar">
              <input
                v-model="helpFilter"
                type="text"
                placeholder="Filter (code, name, category, description…)"
                class="pb-help-filter"
              />
              <span class="pb-help-legend">
                <code>S</code> = Set,
                <code>R</code> = Read,
                <code>A</code> = Answer,
                <code>I</code> = AI (auto-info)
              </span>
            </div>

            <div class="pb-help-tablewrap">
              <table class="pb-help-table">
                <thead>
                  <tr>
                    <th class="pb-help-th" @click="setHelpSort('code')">
                      Code
                      <span class="pb-help-sortmark">
                        {{ helpSortKey === 'code' ? (helpSortDir === 'asc' ? '▲' : '▼') : '' }}
                      </span>
                    </th>
                    <th class="pb-help-th" @click="setHelpSort('name')">
                      Name
                      <span class="pb-help-sortmark">
                        {{ helpSortKey === 'name' ? (helpSortDir === 'asc' ? '▲' : '▼') : '' }}
                      </span>
                    </th>
                    <th class="pb-help-th" @click="setHelpSort('category')">
                      Category
                      <span class="pb-help-sortmark">
                        {{ helpSortKey === 'category' ? (helpSortDir === 'asc' ? '▲' : '▼') : '' }}
                      </span>
                    </th>
                    <th class="pb-help-th-nosort">SRAI</th>
                    <th class="pb-help-th-nosort">Shape</th>
                    <th class="pb-help-th" @click="setHelpSort('manualPage')">
                      Page
                      <span class="pb-help-sortmark">
                        {{ helpSortKey === 'manualPage' ? (helpSortDir === 'asc' ? '▲' : '▼') : '' }}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in helpRows" :key="r.code" :title="r.description">
                    <td class="pb-help-code">{{ r.code }}</td>
                    <td>{{ r.name }}</td>
                    <td class="pb-help-cat">{{ r.category }}</td>
                    <td class="pb-help-srai">{{ supportsBadge(r.supports) }}</td>
                    <td class="pb-help-shape"><code>{{ r.shape }}</code></td>
                    <td class="pb-help-page">{{ r.manualPage }}</td>
                  </tr>
                  <tr v-if="helpRows.length === 0">
                    <td colspan="6" class="pb-help-empty">No commands match "{{ helpFilter }}".</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer class="pb-help-footer">
          <span class="pb-help-foot-note">
            Source: Yaesu "CAT Operation Reference Manual" (FTX-1) — <code>docs/CAT-FTX1.pdf</code>
          </span>
          <button class="pb-btn pb-btn-primary" @click="closeHelp">Close</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  CAT_COMMANDS,
  findCommand,
  isBinaryToggleCommand,
  legacyParamHint,
  legacyParamLabel,
  legacyParamType,
  setFormShape,
  summariseSteps,
  validateStep,
  type CommandDef,
  type ValidationResult,
} from './cat-commands-ftx1'
import {
  parsePresetCommandEntry,
  type PresetCommandEntry,
} from './preset-command-utils'

interface Preset {
  id: string
  label: string
  color?: string
  icon?: string
  description?: string
  commands: PresetCommandEntry[]
  /**
   * Marks this preset as a binary 0/1 toggle switch. The on-screen
   * button shows a green/red LED, reads the radio's current state and
   * sends the opposite value on every click. Enforced to have exactly
   * one step whose 2-letter code passes `isBinaryToggleCommand`.
   */
  toggle?: boolean
  /**
   * Cosmetic only. When `true` AND `toggle === true`, the on-screen
   * button is drawn as a physical bat-handle toggle switch (industrial
   * panel look) instead of the default flat button + small LED. Ignored
   * when `toggle` is not set. Missing field ⇒ flat-button look, so
   * existing presets keep their current appearance.
   */
  toggleSwitch?: boolean
}

interface Step {
  key: number
  code: string
  param: string
  /** Pause after this step (ms) when preset timing is enabled in settings. */
  delayMs: number
  /** Wait for radio reply before the next step. */
  await: boolean
}

// ── Catalogue access — defFor() preserved as the single in-template helper
// so the existing template bindings continue to work. paramTypeOf /
// paramHintOf / paramLabelOf / paramDefaultOf are the derived helpers the
// rest of the UI consumes (back-compat shims over the new catalogue).
function defFor(code: string): CommandDef | null {
  return findCommand(code)
}
function paramTypeOf(code: string): 'none' | 'digits' | 'text' {
  const d = findCommand(code)
  return d ? legacyParamType(d) : 'text'
}
function paramHintOf(code: string): string | undefined {
  const d = findCommand(code)
  return d ? legacyParamHint(d) : undefined
}
function paramLabelOf(code: string): string | undefined {
  const d = findCommand(code)
  return d ? legacyParamLabel(d) : undefined
}
function paramDefaultOf(code: string): string | undefined {
  return findCommand(code)?.paramDefault
}

const props = withDefaults(defineProps<{
  openPresetId?: string | number | null
  /** From settings — when false, per-step delay/await are stored but ignored at run time. */
  presetTimingEnabled?: boolean
  presetDefaultDelayMs?: number
}>(), {
  presetTimingEnabled: false,
  presetDefaultDelayMs: 100,
})

const emit = defineEmits<{
  close: []
  saved: []
}>()

// ── State ──────────────────────────────────────────────────────────────
const presets = ref<Preset[]>([])
const form = ref({
  id: '',
  label: '',
  description: '',
  color: '#f59e0b',
  icon: '',
  // When true, the on-screen PresetButton renders as a toggle switch.
  // Constraint: exactly one step whose 2-letter code passes
  // `isBinaryToggleCommand` (BI, LK, MX, ST, TS, VX as of writing).
  toggle: false,
  // Cosmetic only. When true (and `toggle` is also true) the on-screen
  // button is drawn as a physical bat-handle switch instead of the
  // flat button + small LED. Has no effect when `toggle` is false.
  toggleSwitch: false,
})
const steps = ref<Step[]>([])
const isExisting = ref(false)
const idError = ref('')
const busy = ref(false)
const status = ref('')
const statusKind = ref<'' | 'ok' | 'err'>('')
const advancedRaw = ref(false)
const rawText = ref('')

// Help modal + reference-table sort state
const showHelp = ref(false)
const helpSortKey = ref<'code' | 'name' | 'category' | 'manualPage'>('code')
const helpSortDir = ref<'asc' | 'desc'>('asc')
const helpFilter = ref('')

// ── Command picker (custom dropdown over the 2-letter code input) ─────
// Only one picker is rendered at a time — bound to the step whose code
// input is currently focused / clicked.
const pickerStepKey = ref<number | null>(null)
const pickerFilter = ref('')
const pickerHighlightIndex = ref(0)
const pickerFilterEl = ref<HTMLInputElement | null>(null)
const pickerListEl = ref<HTMLElement | null>(null)

// Viewport-anchored position for the picker. We use position: fixed so
// the dropdown escapes the editor's overflow-y: auto clipping. The
// values here are recomputed on open + on every scroll/resize while
// the picker is open.
interface PickerPos {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'below' | 'above'
}
const pickerPos = ref<PickerPos>({ top: 0, left: 0, width: 0, maxHeight: 420, placement: 'below' })

// Display order — mirrors the CommandCategory union in the catalogue.
const CATEGORY_ORDER: ReadonlyArray<string> = [
  'frequency', 'vfo', 'mode', 'band',
  'filter', 'memory', 'power', 'audio',
  'ptt', 'tuner', 'menu', 'status', 'misc',
]

const pickerGroups = computed<Array<{ category: string; items: CommandDef[] }>>(() => {
  const q = pickerFilter.value.trim().toLowerCase()
  const matches = CAT_COMMANDS.filter((c) => !q
    || c.code.toLowerCase().includes(q)
    || c.name.toLowerCase().includes(q)
    || c.category.toLowerCase().includes(q)
    || c.description.toLowerCase().includes(q))
  const buckets = new Map<string, CommandDef[]>()
  for (const c of matches) {
    if (!buckets.has(c.category)) buckets.set(c.category, [])
    buckets.get(c.category)!.push(c)
  }
  return CATEGORY_ORDER
    .filter((cat) => buckets.has(cat))
    .map((cat) => ({ category: cat, items: buckets.get(cat)! }))
})

// Flat list across all groups, in render order — used for ↑/↓ keyboard nav.
const pickerFlat = computed<CommandDef[]>(() =>
  pickerGroups.value.flatMap((g) => g.items),
)

let stepKeyCounter = 0
const nextKey = () => ++stepKeyCounter

// ── Validation ─────────────────────────────────────────────────────────
// Per-step results (in step order). For raw mode we parse each line on the
// fly so the operator gets the same red/yellow indicator everywhere.
const stepValidations = computed<ValidationResult[]>(() =>
  steps.value.map((s) => validateStep(s.code, s.param)),
)

const rawStepValidations = computed<ValidationResult[]>(() => {
  if (!advancedRaw.value) return []
  return rawText.value
    .split(/\r?\n/)
    .map((s) => s.replace(/;\s*$/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2).toUpperCase()
      const param = line.slice(2)
      return validateStep(code, param)
    })
})

const validationSummary = computed(() => {
  const source = advancedRaw.value
    ? rawText.value
        .split(/\r?\n/)
        .map((s) => s.replace(/;\s*$/, '').trim())
        .filter(Boolean)
        .map((line) => ({ code: line.slice(0, 2).toUpperCase(), param: line.slice(2) }))
    : steps.value.map((s) => ({ code: s.code, param: s.param }))
  return summariseSteps(source)
})

const hasValidationErrors = computed(() => validationSummary.value.errorCount > 0)

// ── Toggle-mode validation ─────────────────────────────────────────────
// A preset marked `toggle: true` is only legal when it consists of
// exactly one step whose 2-letter code passes `isBinaryToggleCommand`
// (i.e. has a single binary 0/1 enum parameter). Anything else would
// produce a broken on-screen toggle button, so we surface this as a
// hard error and block save.
type ToggleValidation =
  | { ok: true }
  | { ok: false; reason: string }

const toggleValidation = computed<ToggleValidation>(() => {
  if (!form.value.toggle) return { ok: true }
  // In raw mode the "steps" view may not be up to date; use whichever
  // source the operator is currently editing.
  const commands: Array<{ code: string; param: string }> = advancedRaw.value
    ? rawText.value
        .split(/\r?\n/)
        .map((s) => s.replace(/;\s*$/, '').trim())
        .filter(Boolean)
        .map((line) => ({ code: line.slice(0, 2).toUpperCase(), param: line.slice(2) }))
    : steps.value.map((s) => ({ code: s.code, param: s.param }))
  if (commands.length === 0) {
    return { ok: false, reason: 'Toggle presets need exactly one command — add a step.' }
  }
  if (commands.length > 1) {
    return { ok: false, reason: `Toggle presets need exactly one command; this preset has ${commands.length}. Remove the extras or disable toggle mode.` }
  }
  const code = commands[0].code
  if (!/^[A-Z]{2}$/.test(code)) {
    return { ok: false, reason: 'Toggle presets need a known 2-letter command code.' }
  }
  if (!isBinaryToggleCommand(code)) {
    const def = findCommand(code)
    const name = def ? `${code} (${def.name})` : code
    return { ok: false, reason: `${name} is not a binary 0/1 toggle command. Toggle-eligible commands have a single ON/OFF parameter — e.g. BI, LK, MX, ST, TS, VX.` }
  }
  return { ok: true }
})

// ── Computed ───────────────────────────────────────────────────────────
const canSave = computed(() => {
  if (!form.value.id.trim() || !form.value.label.trim()) return false
  if (idError.value) return false
  if (!toggleValidation.value.ok) return false
  if (advancedRaw.value) {
    const lines = rawText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    if (lines.length === 0) return false
    // Block on any hard error from the validator (per user policy).
    return !hasValidationErrors.value
  }
  if (steps.value.length === 0) return false
  if (!steps.value.every((s) => /^[A-Z]{2}$/.test(s.code))) return false
  return !hasValidationErrors.value
})

// ── Help modal — sortable reference table ──────────────────────────────
const helpRows = computed(() => {
  const q = helpFilter.value.trim().toLowerCase()
  const rows = CAT_COMMANDS.filter((c) => {
    if (!q) return true
    return (
      c.code.toLowerCase().includes(q)
      || c.name.toLowerCase().includes(q)
      || c.category.toLowerCase().includes(q)
      || c.description.toLowerCase().includes(q)
    )
  }).map((c) => ({
    code: c.code,
    name: c.name,
    category: c.category,
    supports: c.supports,
    shape: setFormShape(c),
    description: c.description,
    manualPage: c.manualPage,
  }))

  const key = helpSortKey.value
  const dir = helpSortDir.value === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
  return rows
})

function setHelpSort(key: 'code' | 'name' | 'category' | 'manualPage') {
  if (helpSortKey.value === key) {
    helpSortDir.value = helpSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    helpSortKey.value = key
    helpSortDir.value = 'asc'
  }
}

function supportsBadge(s: { set: boolean; read: boolean; answer: boolean; ai: boolean }): string {
  return (
    (s.set ? 'S' : '·')
    + (s.read ? 'R' : '·')
    + (s.answer ? 'A' : '·')
    + (s.ai ? 'I' : '·')
  )
}

function openHelp() { showHelp.value = true }
function closeHelp() { showHelp.value = false }

// ── Picker control ─────────────────────────────────────────────────────
// Recompute the picker's viewport-anchored geometry. The anchor is the
// step row whose key matches pickerStepKey (located via a data attribute
// so we don't need to thread refs through the v-for). The picker prefers
// to open *below* the anchor; if there isn't at least ~220 px of room
// there it flips upward, which is critical on short laptop viewports
// where the modal already eats 90% of the height.
const PICKER_IDEAL_HEIGHT = 480
const PICKER_MIN_BELOW = 220
const PICKER_MARGIN = 12

function recomputePickerPos() {
  const stepKey = pickerStepKey.value
  if (stepKey === null) return
  const anchor = document.querySelector<HTMLElement>(`.pb-step-row[data-step-key="${stepKey}"]`)
  if (!anchor) return
  const rect = anchor.getBoundingClientRect()
  const vh = window.innerHeight
  const spaceBelow = vh - rect.bottom - PICKER_MARGIN
  const spaceAbove = rect.top - PICKER_MARGIN

  let placement: 'below' | 'above'
  let top: number
  let maxHeight: number

  if (spaceBelow >= PICKER_MIN_BELOW || spaceBelow >= spaceAbove) {
    placement = 'below'
    maxHeight = Math.max(160, Math.min(PICKER_IDEAL_HEIGHT, spaceBelow))
    top = rect.bottom + 4
  } else {
    placement = 'above'
    maxHeight = Math.max(160, Math.min(PICKER_IDEAL_HEIGHT, spaceAbove))
    top = rect.top - maxHeight - 4
  }

  pickerPos.value = {
    top,
    left: rect.left,
    width: rect.width,
    maxHeight,
    placement,
  }
}

function openPicker(stepKey: number, focusFilter = false) {
  if (pickerStepKey.value === stepKey) {
    // Idempotent re-open — keep existing filter text. If the caller
    // explicitly wants the filter focused (e.g. the ▾ browse button),
    // honour that even on re-open.
    if (focusFilter) nextTick(() => pickerFilterEl.value?.focus())
    return
  }
  pickerStepKey.value = stepKey
  pickerFilter.value = ''
  pickerHighlightIndex.value = 0
  // Position is computed AFTER the picker is rendered (v-if flips to
  // true on the next tick) so getBoundingClientRect of the anchor is
  // accurate even if the step row was just created.
  nextTick(() => {
    recomputePickerPos()
    if (focusFilter) pickerFilterEl.value?.focus()
  })
}

function closePicker() {
  pickerStepKey.value = null
  pickerFilter.value = ''
  pickerHighlightIndex.value = 0
}

function pickCommand(step: Step, def: CommandDef) {
  step.code = def.code
  // Mirror the prefill rules from onCodeInput so picking is equivalent
  // to typing the code by hand.
  if (paramTypeOf(def.code) === 'none') {
    step.param = ''
  } else if (!step.param) {
    const dflt = paramDefaultOf(def.code)
    if (dflt) step.param = dflt
  }
  closePicker()
}

function onPickerKey(step: Step, ev: KeyboardEvent) {
  // Only act when this step's picker is the one currently open. This
  // matters because the handler is also bound to the .pb-step-code
  // input, where ↑/↓/Enter/Esc are otherwise no-ops.
  if (pickerStepKey.value !== step.key) return
  const items = pickerFlat.value
  if (ev.key === 'ArrowDown') {
    ev.preventDefault()
    if (items.length === 0) return
    pickerHighlightIndex.value = (pickerHighlightIndex.value + 1) % items.length
    scrollHighlightedIntoView()
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault()
    if (items.length === 0) return
    pickerHighlightIndex.value = (pickerHighlightIndex.value - 1 + items.length) % items.length
    scrollHighlightedIntoView()
  } else if (ev.key === 'Enter') {
    ev.preventDefault()
    const picked = items[pickerHighlightIndex.value]
    if (picked) pickCommand(step, picked)
  } else if (ev.key === 'Escape') {
    ev.preventDefault()
    ev.stopPropagation()       // don't bubble up and close the editor
    closePicker()
  }
}

function scrollHighlightedIntoView() {
  nextTick(() => {
    const el = pickerListEl.value?.querySelector('.pb-picker-item--highlight') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function onDocumentMouseDown(ev: MouseEvent) {
  if (pickerStepKey.value === null) return
  const target = ev.target as HTMLElement | null
  if (!target || !target.closest) return
  // Click inside the picker itself or on a code-input keeps it open.
  if (target.closest('.pb-picker')) return
  if (target.closest('.pb-step-code')) return
  closePicker()
}

// ── Lifecycle ──────────────────────────────────────────────────────────
onMounted(async () => {
  await loadAllPresets()
  const wantId = props.openPresetId == null ? null : String(props.openPresetId)
  const initial = wantId ? presets.value.find((p) => p.id === wantId) : null
  if (initial) loadPresetIntoForm(initial)
  else startNewPreset()
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('mousedown', onDocumentMouseDown)
  // Keep the picker pinned to its anchor as the user scrolls the
  // editor or resizes the window. `capture: true` catches scrolls on
  // any nested scroll container (e.g. .pb-editor, .pb-list).
  window.addEventListener('resize', recomputePickerPos)
  document.addEventListener('scroll', recomputePickerPos, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('mousedown', onDocumentMouseDown)
  window.removeEventListener('resize', recomputePickerPos)
  document.removeEventListener('scroll', recomputePickerPos, true)
})

watch(
  () => props.openPresetId,
  (newId) => {
    if (newId == null) return
    const target = presets.value.find((p) => p.id === String(newId))
    if (target) loadPresetIntoForm(target)
  },
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    // Priority: picker → help modal → editor. The picker handler also
    // catches Escape locally (it stops propagation) so this fallback
    // only fires when no input inside the picker was focused.
    if (pickerStepKey.value !== null) {
      e.preventDefault()
      closePicker()
    } else if (showHelp.value) {
      e.preventDefault()
      closeHelp()
    } else {
      e.preventDefault()
      onClose()
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
function rawOf(s: Step): string {
  return (s.code || '') + (s.param || '')
}

function paramPlaceholder(code: string): string {
  return paramHintOf(code) ?? paramLabelOf(code) ?? 'value'
}

function paramTitle(code: string): string {
  const d = defFor(code)
  if (!d) return 'Custom parameter'
  return paramLabelOf(code) ?? d.name
}

function validationBadge(level: 'ok' | 'warn' | 'error'): string {
  if (level === 'error') return '✗'
  if (level === 'warn')  return '⚠'
  return '✓'
}

function validationTooltip(r: ValidationResult): string {
  if (r.issues.length === 0) return 'Valid against the FTX-1 CAT manual.'
  return r.issues.map((i) => `${i.level.toUpperCase()}: ${i.message}`).join('\n')
}

function parseRawToStep(raw: string): Step {
  const trimmed = raw.replace(/;\s*$/, '').trim()
  return {
    key: nextKey(),
    code: trimmed.slice(0, 2).toUpperCase(),
    param: trimmed.slice(2),
    delayMs: props.presetDefaultDelayMs,
    await: false,
  }
}

function parseCommandToStep(entry: PresetCommandEntry): Step {
  const parsed = parsePresetCommandEntry(entry)
  const trimmed = parsed.command
  return {
    key: nextKey(),
    code: trimmed.slice(0, 2).toUpperCase(),
    param: trimmed.slice(2),
    delayMs: parsed.delayMs ?? props.presetDefaultDelayMs,
    await: parsed.await,
  }
}

function serializeCommands(): PresetCommandEntry[] {
  if (advancedRaw.value) {
    return rawText.value
      .split(/\r?\n/)
      .map((s) => s.replace(/;\s*$/, '').trim())
      .filter(Boolean)
  }
  const defDelay = props.presetDefaultDelayMs
  return steps.value.map((s) => {
    const cmd = rawOf(s).trim()
    if (!s.await && s.delayMs === defDelay) return cmd
    const o: { command: string, delayMs?: number, await?: boolean } = { command: cmd }
    if (s.delayMs !== defDelay) o.delayMs = s.delayMs
    if (s.await) o.await = true
    return o
  })
}

function onCodeInput(s: Step, ev: Event) {
  const el = ev.target as HTMLInputElement
  const cleaned = el.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
  s.code = cleaned
  el.value = cleaned
  // If the picker is open for this step, mirror typed letters into the
  // filter so the operator sees a live-narrowed list.
  if (pickerStepKey.value === s.key) {
    pickerFilter.value = cleaned
    pickerHighlightIndex.value = 0
  }
  // If this command takes no parameter, clear any stale value.
  if (paramTypeOf(cleaned) === 'none') s.param = ''
  // Prefill default parameter only if current is empty.
  else if (!s.param) {
    const dflt = paramDefaultOf(cleaned)
    if (dflt) s.param = dflt
  }
}

// ── Data ───────────────────────────────────────────────────────────────
async function loadAllPresets() {
  try {
    const data = await $fetch<{ presets: Preset[] }>('/api/json-presets')
    presets.value = Array.isArray(data?.presets) ? data.presets : []
  } catch (err) {
    setStatus(extractError(err), 'err')
  }
}

function startNewPreset() {
  isExisting.value = false
  form.value = { id: '', label: '', description: '', color: '#f59e0b', icon: '', toggle: false, toggleSwitch: false }
  steps.value = []
  rawText.value = ''
  advancedRaw.value = false
  idError.value = ''
  setStatus('', '')
}

function loadPresetIntoForm(p: Preset) {
  isExisting.value = true
  form.value = {
    id: p.id,
    label: p.label,
    description: p.description ?? '',
    color: p.color ?? '#f59e0b',
    icon: p.icon ?? '',
    toggle: p.toggle === true,
    toggleSwitch: p.toggleSwitch === true,
  }
  steps.value = (p.commands ?? []).map(parseCommandToStep)
  rawText.value = (p.commands ?? []).map((c) =>
    typeof c === 'string' ? c : c.command,
  ).join('\n')
  advancedRaw.value = false
  idError.value = ''
  setStatus('', '')
}

function validateId() {
  const id = form.value.id.trim()
  if (!id) { idError.value = ''; return }
  if (!/^[a-z0-9][a-z0-9\-]*$/.test(id)) {
    idError.value = 'Lowercase letters, digits and hyphens only (must start with a letter/digit).'
    return
  }
  if (!isExisting.value && presets.value.some((p) => p.id === id)) {
    idError.value = 'A preset with this ID already exists.'
    return
  }
  idError.value = ''
}

function addStep(code = '', param = '') {
  const c = code.toUpperCase()
  const stepKey = nextKey()
  steps.value.push({
    key: stepKey,
    code: c,
    param: param || (paramDefaultOf(c) ?? ''),
    delayMs: props.presetDefaultDelayMs,
    await: false,
  })
  // Empty step → auto-open the picker so the operator can immediately
  // browse / search. Skipped if the step was created with a known code
  // (e.g. when loading a preset). Focus the filter input because the
  // code input has not been focused yet.
  if (!c) {
    nextTick(() => {
      // Make sure the newly-added row is on-screen first — otherwise
      // the picker would anchor to a row that's below the editor's
      // current scroll window. `block: 'center'` leaves room above
      // *and* below for the picker to expand into.
      const row = document.querySelector<HTMLElement>(`.pb-step-row[data-step-key="${stepKey}"]`)
      row?.scrollIntoView({ block: 'center', behavior: 'auto' })
      openPicker(stepKey, true)
    })
  }
}

function removeStep(i: number) {
  steps.value.splice(i, 1)
}

function moveStep(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= steps.value.length) return
  const tmp = steps.value[i]
  steps.value[i] = steps.value[j]
  steps.value[j] = tmp
}

function onToggleRaw() {
  if (advancedRaw.value) {
    rawText.value = steps.value.map(rawOf).filter(Boolean).join('\n')
  } else {
    const lines = rawText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    steps.value = lines.map(parseRawToStep)
  }
}

function resetForm() {
  if (!confirm('Discard changes?')) return
  if (isExisting.value) {
    const original = presets.value.find((p) => p.id === form.value.id)
    if (original) loadPresetIntoForm(original)
    else startNewPreset()
  } else {
    startNewPreset()
  }
}

function onClose() {
  emit('close')
}

async function deletePreset(id: string) {
  const preset = presets.value.find((p) => p.id === id)
  if (!preset) return
  if (!confirm(`Delete preset "${preset.label}"?`)) return
  busy.value = true
  setStatus('Deleting…', '')
  const snapshot = presets.value.slice()
  try {
    presets.value = presets.value.filter((p) => p.id !== id)
    await $fetch('/api/json-presets', { method: 'PUT', body: { presets: presets.value } })
    setStatus('Deleted.', 'ok')
    if (form.value.id === id) startNewPreset()
    emit('saved')
  } catch (err) {
    presets.value = snapshot
    setStatus(extractError(err), 'err')
  } finally {
    busy.value = false
  }
}

async function save() {
  if (!canSave.value || busy.value) return
  validateId()
  if (idError.value) return

  const commands = serializeCommands()
  if (commands.length === 0) {
    setStatus('At least one command is required.', 'err')
    return
  }

  const newPreset: Preset = {
    id: form.value.id.trim(),
    label: form.value.label.trim(),
    commands,
  }
  const desc = form.value.description.trim()
  if (desc) newPreset.description = desc
  if (form.value.color) newPreset.color = form.value.color
  if (form.value.icon) newPreset.icon = form.value.icon
  // Only persist `toggle: true` when set — keeps existing presets diff-clean.
  if (form.value.toggle) newPreset.toggle = true
  // `toggleSwitch` is purely cosmetic and only meaningful for toggle
  // presets. Persist it only when both flags are true so the JSON stays
  // tidy and non-toggle presets never accidentally carry a stale style
  // flag.
  if (form.value.toggle && form.value.toggleSwitch) newPreset.toggleSwitch = true

  busy.value = true
  setStatus('Saving…', '')
  const snapshot = presets.value.slice()
  try {
    const idx = presets.value.findIndex((p) => p.id === newPreset.id)
    if (idx >= 0) presets.value[idx] = newPreset
    else presets.value.push(newPreset)

    await $fetch('/api/json-presets', { method: 'PUT', body: { presets: presets.value } })
    setStatus(`Saved "${newPreset.label}".`, 'ok')
    isExisting.value = true
    emit('saved')
  } catch (err) {
    presets.value = snapshot
    setStatus(extractError(err), 'err')
  } finally {
    busy.value = false
  }
}

function setStatus(msg: string, kind: '' | 'ok' | 'err') {
  status.value = msg
  statusKind.value = kind
  if (kind === 'ok') {
    const captured = msg
    setTimeout(() => {
      if (status.value === captured) {
        status.value = ''
        statusKind.value = ''
      }
    }, 2500)
  }
}

function extractError(err: any): string {
  return (
    err?.data?.statusMessage ??
    err?.data?.message ??
    err?.statusMessage ??
    err?.message ??
    String(err)
  )
}
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────── */
.pb-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 12px;
  overflow: hidden;
  color: #e6edf3;
  font-family: inherit;
}

.pb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
  background: #161b22;
}

.pb-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pb-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.pb-subtitle {
  font-size: 11px;
  color: #8b949e;
}

.pb-subtitle code {
  background: #21262d;
  padding: 1px 6px;
  border-radius: 3px;
  color: #a5d6ff;
  font-size: 11px;
}

.pb-close {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}

.pb-close:hover {
  color: #e6edf3;
  background: #21262d;
}

.pb-body {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
}

/* ── Left list ──────────────────────────────────────────────────────── */
.pb-list {
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px;
  background: rgba(13, 17, 23, 0.5);
  min-height: 0;
}

.pb-section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  color: #c9d1d9;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.pb-list-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  min-height: 80px;
}

.pb-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 5px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}

.pb-list-item:hover {
  border-color: #58a6ff;
  background: rgba(56, 139, 253, 0.08);
}

.pb-list-item.active {
  border-color: #58a6ff;
  background: rgba(56, 139, 253, 0.16);
}

.pb-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.pb-list-label {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pb-list-count {
  flex-shrink: 0;
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: 10px;
  padding: 1px 6px;
  background: #21262d;
  border-radius: 10px;
  color: #8b949e;
}

.pb-list-del {
  flex-shrink: 0;
  background: none;
  border: none;
  color: #f85149;
  cursor: pointer;
  font-size: 13px;
  padding: 0 4px;
  opacity: 0;
  transition: opacity 0.12s;
}

.pb-list-item:hover .pb-list-del { opacity: 1; }
.pb-list-del:hover { color: #ff7b72; }

.pb-list-empty {
  padding: 12px 8px;
  font-size: 12px;
  color: #8b949e;
  text-align: center;
  font-style: italic;
}

.pb-new-btn {
  width: 100%;
  flex-shrink: 0;
}

/* ── Right editor ───────────────────────────────────────────────────── */
.pb-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 16px;
  background: rgba(13, 17, 23, 0.5);
  overflow-y: auto;
  min-height: 0;
}

.pb-form-row {
  display: flex;
  gap: 12px;
}

.pb-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.pb-field-wide { flex: 2; }
.pb-field-color { flex: 0 0 200px; }

.pb-field-label {
  font-size: 11px;
  font-weight: 600;
  color: #c9d1d9;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.pb-field input[type='text'] {
  padding: 8px 10px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 5px;
  color: #e6edf3;
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.12s;
}

.pb-field input[type='text']:focus {
  outline: none;
  border-color: #58a6ff;
}

.pb-field input[type='text']:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: #161b22;
}

.pb-err {
  font-size: 11px;
  color: #f85149;
}

.pb-color-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 5px;
}

/* ── Toggle-switch checkbox + invalid-state hint ────────────────────── */
.pb-toggle-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
}
.pb-toggle-row--invalid {
  border-color: #f85149;
  background: rgba(248, 81, 73, 0.06);
}
.pb-toggle-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.pb-toggle-check input[type='checkbox'] {
  margin-top: 2px;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* Cosmetic sub-option, indented under its parent toggle option so the
   hierarchy is clear. Greys out when the parent option is off. */
.pb-toggle-style-check {
  margin-top: 8px;
  margin-left: 26px; /* aligns with the parent checkbox's text */
  padding-left: 10px;
  border-left: 2px solid #30363d;
}
.pb-toggle-style-check--disabled {
  opacity: 0.45;
  cursor: default;
}
.pb-toggle-style-check--disabled input[type='checkbox'] {
  cursor: not-allowed;
}
.pb-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pb-toggle-title {
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
}
.pb-toggle-sub {
  font-size: 11px;
  color: #8b949e;
  line-height: 1.5;
}
.pb-toggle-sub code {
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: 10px;
  padding: 0 4px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 3px;
  color: #c9d1d9;
}
.pb-toggle-err {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  padding: 6px 8px;
  background: rgba(248, 81, 73, 0.08);
  border: 1px solid rgba(248, 81, 73, 0.35);
  border-radius: 4px;
  font-size: 11px;
  color: #f85149;
  line-height: 1.4;
}
.pb-toggle-err-icon {
  flex-shrink: 0;
  font-weight: 700;
  font-family: 'SF Mono', monospace;
  font-size: 12px;
  line-height: 1.2;
}

.pb-color-pick input[type='color'] {
  width: 36px;
  height: 28px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.pb-color-code {
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: 12px;
  color: #a5d6ff;
}

/* ── Command sequence ───────────────────────────────────────────────── */
.pb-cmd-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid #30363d;
  padding-top: 12px;
}

.pb-cmd-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pb-cmd-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pb-cmd-count {
  font-size: 11px;
  color: #8b949e;
  font-style: italic;
}

.pb-raw-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #c9d1d9;
  cursor: pointer;
  user-select: none;
}

.pb-raw-toggle input { cursor: pointer; }

.pb-steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pb-steps-headrow,
.pb-step-row {
  display: grid;
  grid-template-columns: 28px minmax(160px, 1fr) minmax(180px, 1.2fr) minmax(140px, 0.9fr) 28px 88px;
  gap: 8px;
  align-items: center;
}

.pb-steps-headrow.pb-steps-grid--timing,
.pb-step-row.pb-steps-grid--timing {
  grid-template-columns:
    28px minmax(140px, 1fr) minmax(160px, 1.1fr)
    72px 44px minmax(120px, 0.85fr) 28px 88px;
}

.pb-timing-hint {
  margin: 0 8px 8px;
  font-size: 11px;
  color: #8b949e;
  line-height: 1.4;
}

.pb-step-delay-input {
  width: 100%;
  max-width: 68px;
  padding: 4px 6px;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #e6edf3;
}

.pb-step-await-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.pb-step-await-cell input { cursor: pointer; }

.pb-steps-headrow {
  padding: 4px 8px;
  border-bottom: 1px solid #30363d;
}

.pb-h {
  font-size: 10px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.pb-steps-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #8b949e;
  font-style: italic;
  background: #0d1117;
  border: 1px dashed #30363d;
  border-radius: 5px;
}

.pb-step-row {
  position: relative;   /* anchors .pb-picker (absolute, full-row width) */
  padding: 6px 8px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 5px;
}

.pb-step-row:hover {
  border-color: #444c56;
}

.pb-step-pos {
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: 12px;
  color: #8b949e;
  text-align: center;
}

.pb-step-cmd-cell {
  position: relative;       /* hosts the ▾ browse button (.pb-step-browse) */
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}

.pb-step-code {
  width: 56px;
  padding: 6px 8px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #ffa657;
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  text-align: center;
}

.pb-step-code:focus {
  outline: none;
  border-color: #58a6ff;
}

.pb-step-name {
  font-size: 12px;
  color: #e6edf3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pb-step-name--custom {
  color: #ffa657;
  font-style: italic;
}

.pb-step-name--hint {
  color: #6e7681;
  font-style: italic;
}

.pb-step-param-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pb-step-param-input {
  width: 100%;
  padding: 6px 8px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #e6edf3;
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: 12px;
}

.pb-step-param-input:focus {
  outline: none;
  border-color: #58a6ff;
}

.pb-step-param-none {
  font-size: 11px;
  color: #6e7681;
  font-style: italic;
  padding: 6px 8px;
}

.pb-step-hint {
  font-size: 10px;
  color: #6e7681;
}

.pb-step-preview {
  padding: 6px 8px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #7ee787;
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pb-step-actions {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}

.pb-icon-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.pb-icon-btn:hover:not(:disabled) {
  background: #30363d;
  border-color: #58a6ff;
}

.pb-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pb-icon-del:hover:not(:disabled) {
  color: #ff7b72;
  border-color: #f85149;
}

.pb-add-step {
  align-self: flex-start;
  margin-top: 4px;
}

/* ── Raw mode ──────────────────────────────────────────────────────── */
.pb-raw-mode {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pb-raw-textarea {
  width: 100%;
  padding: 10px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 5px;
  color: #e6edf3;
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: 12px;
  resize: vertical;
  min-height: 180px;
}

.pb-raw-textarea:focus {
  outline: none;
  border-color: #58a6ff;
}

.pb-raw-hint {
  font-size: 11px;
  color: #8b949e;
}

.pb-raw-hint code {
  background: #21262d;
  padding: 0 4px;
  border-radius: 2px;
  color: #a5d6ff;
}

/* ── Buttons / actions ─────────────────────────────────────────────── */
.pb-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #30363d;
  margin-top: auto;
}

.pb-btn {
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, opacity 0.12s;
}

.pb-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pb-btn-primary {
  background: #1f6feb;
  color: #fff;
  border-color: #1f6feb;
}

.pb-btn-primary:hover:not(:disabled) {
  background: #388bfd;
  border-color: #388bfd;
}

.pb-btn-ghost {
  background: transparent;
  color: #e6edf3;
  border-color: #30363d;
}

.pb-btn-ghost:hover:not(:disabled) {
  background: #21262d;
  border-color: #58a6ff;
}

.pb-status {
  margin-left: auto;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.pb-status--ok {
  background: rgba(63, 185, 80, 0.18);
  color: #7ee787;
  border: 1px solid rgba(63, 185, 80, 0.35);
}

.pb-status--err {
  background: rgba(248, 81, 73, 0.18);
  color: #ff7b72;
  border: 1px solid rgba(248, 81, 73, 0.35);
}

/* ── Responsive: stack vertically on narrow modals ─────────────────── */
@media (max-width: 900px) {
  .pb-body { flex-direction: column; }
  .pb-list { flex: 0 0 auto; max-height: 220px; }
  .pb-form-row { flex-direction: column; gap: 10px; }
  .pb-field-color { flex: 1; }
  .pb-steps-headrow,
  .pb-step-row {
    grid-template-columns: 24px 1fr 24px 88px;
    grid-template-areas:
      'pos cmd validate act'
      'pos param param param'
      'pos preview preview preview';
  }
  .pb-step-pos { grid-area: pos; }
  .pb-step-cmd-cell { grid-area: cmd; }
  .pb-step-param-cell { grid-area: param; }
  .pb-step-preview { grid-area: preview; }
  .pb-step-validate { grid-area: validate; }
  .pb-step-actions { grid-area: act; }
  .pb-step-pos { grid-area: pos; align-self: start; padding-top: 6px; }
  .pb-step-cmd-cell { grid-area: cmd; }
  .pb-step-param-cell { grid-area: param; }
  .pb-step-preview { grid-area: preview; }
  .pb-step-actions { grid-area: act; }
  .pb-h-pos, .pb-h-cmd { display: inline; }
  .pb-h-param, .pb-h-preview, .pb-h-act, .pb-h-validate { display: none; }
}

/* ── New: header actions, validation badges, summary, help modal ─────── */

.pb-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pb-help-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #30363d;
  background: #21262d;
  color: #d1d5db;
  border-radius: 50%;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  font-family: inherit;
}
.pb-help-btn:hover {
  background: #30363d;
  border-color: #6e7681;
  color: #fff;
}

/* Per-step validation badge inside a step row. */
.pb-h-validate {
  text-align: center;
  font-size: 11px;
  color: #6e7681;
}

.pb-step-validate {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  font-size: 13px;
  cursor: help;
  user-select: none;
  border: 1px solid transparent;
}
.pb-step-validate--ok    { color: #3fb950; background: rgba(46, 160, 67, 0.12); border-color: rgba(46, 160, 67, 0.35); }
.pb-step-validate--warn  { color: #d29922; background: rgba(187, 128, 9, 0.16); border-color: rgba(187, 128, 9, 0.45); }
.pb-step-validate--error { color: #f85149; background: rgba(248, 81, 73, 0.16); border-color: rgba(248, 81, 73, 0.45); }

/* Optional row tint when an error exists, to make the bad row pop. */
.pb-step-row--error {
  border-color: rgba(248, 81, 73, 0.55) !important;
  background: rgba(248, 81, 73, 0.06) !important;
}
.pb-step-row--warn {
  border-color: rgba(187, 128, 9, 0.45) !important;
}

/* Footer-style summary bar above the Save row. */
.pb-validation-summary {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  border: 1px solid #30363d;
  background: #161b22;
  color: #c9d1d9;
}
.pb-validation-summary--warn {
  border-color: rgba(187, 128, 9, 0.55);
  background: rgba(187, 128, 9, 0.10);
}
.pb-validation-summary--error {
  border-color: rgba(248, 81, 73, 0.55);
  background: rgba(248, 81, 73, 0.10);
}
.pb-vs-badge {
  font-weight: 800;
  font-size: 15px;
}
.pb-validation-summary--warn  .pb-vs-badge { color: #d29922; }
.pb-validation-summary--error .pb-vs-badge { color: #f85149; }
.pb-vs-extra {
  margin-left: 4px;
  color: #8b949e;
}
.pb-vs-help {
  margin-left: auto;
  background: transparent;
  border: 1px solid #30363d;
  color: #d1d5db;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.pb-vs-help:hover {
  background: #30363d;
  border-color: #6e7681;
  color: #fff;
}

/* Raw-mode per-line issues list. */
.pb-raw-issues {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow: auto;
}
.pb-raw-issue-row {
  display: grid;
  grid-template-columns: 24px 70px 1fr;
  gap: 8px;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #161b22;
  border: 1px solid #30363d;
}
.pb-raw-issue-row--warn  { border-color: rgba(187, 128, 9, 0.45);  background: rgba(187, 128, 9, 0.08); }
.pb-raw-issue-row--error { border-color: rgba(248, 81, 73, 0.55); background: rgba(248, 81, 73, 0.08); }
.pb-raw-issue-badge {
  font-weight: 800;
  text-align: center;
}
.pb-raw-issue-row--ok    .pb-raw-issue-badge { color: #3fb950; }
.pb-raw-issue-row--warn  .pb-raw-issue-badge { color: #d29922; }
.pb-raw-issue-row--error .pb-raw-issue-badge { color: #f85149; }
.pb-raw-issue-line {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  color: #8b949e;
}
.pb-raw-issue-msg {
  color: #c9d1d9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Command picker (custom dropdown over the 2-letter code input) ───── */

.pb-step-browse {
  flex-shrink: 0;
  width: 22px;
  height: 28px;
  background: #21262d;
  border: 1px solid #30363d;
  color: #8b949e;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.pb-step-browse:hover {
  background: #30363d;
  border-color: #6e7681;
  color: #fff;
}

.pb-picker {
  position: fixed;             /* escapes .pb-editor's overflow-y: auto */
  /* top / left / width / max-height come from inline style bindings */
  z-index: 1200;               /* above .modal-overlay (1100) */
  background: #161b22;
  border: 1px solid #444c56;
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: inherit;
}

/* Visual hint that the picker is anchored upward (flipped because
   there's more room above the row than below). The shadow direction
   is reversed so the dropdown still appears to "come out of" the
   step row. */
.pb-picker--above {
  box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.55);
}

.pb-picker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #0d1117;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
}

.pb-picker-filter {
  flex: 1 1 auto;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  padding: 5px 8px;
  font-family: inherit;
  font-size: 13px;
  min-width: 0;
}
.pb-picker-filter:focus {
  outline: none;
  border-color: #58a6ff;
}

.pb-picker-count {
  flex-shrink: 0;
  font-size: 11px;
  color: #8b949e;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.pb-picker-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  background: none;
  border: 1px solid transparent;
  color: #8b949e;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0;
  font-family: inherit;
}
.pb-picker-close:hover {
  background: #30363d;
  color: #fff;
}

.pb-picker-list {
  flex: 1 1 auto;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #444c56 transparent;
}
.pb-picker-list::-webkit-scrollbar {
  width: 10px;
}
.pb-picker-list::-webkit-scrollbar-thumb {
  background: #444c56;
  border-radius: 5px;
}

.pb-picker-group {
  position: sticky;
  top: 0;
  background: #21262d;
  color: #58a6ff;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  padding: 5px 12px;
  border-bottom: 1px solid #30363d;
  z-index: 1;
}

.pb-picker-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 6px 12px;
  cursor: pointer;
  align-items: center;
  border-bottom: 1px solid #21262d;
  user-select: none;
}
.pb-picker-item:last-child {
  border-bottom: none;
}
.pb-picker-item--highlight {
  background: rgba(88, 166, 255, 0.14);
}
.pb-picker-item--readonly {
  opacity: 0.72;
}

.pb-picker-code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-weight: 700;
  font-size: 12px;
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.10);
  border: 1px solid rgba(88, 166, 255, 0.32);
  border-radius: 3px;
  padding: 3px 6px;
  text-align: center;
  letter-spacing: 1px;
  line-height: 1;
}

.pb-picker-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.pb-picker-name {
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}

.pb-picker-ro {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #d29922;
  background: rgba(187, 128, 9, 0.14);
  border: 1px solid rgba(187, 128, 9, 0.35);
  border-radius: 2px;
  padding: 0 4px;
  line-height: 14px;
  flex-shrink: 0;
}

.pb-picker-desc {
  font-size: 11px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pb-picker-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10px;
}

.pb-picker-srai {
  color: #d29922;
  letter-spacing: 1.5px;
}

.pb-picker-page {
  color: #6e7681;
  font-size: 9px;
}

.pb-picker-empty {
  padding: 20px;
  color: #8b949e;
  font-size: 12px;
  text-align: center;
  font-style: italic;
}

.pb-picker-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 12px;
  border-top: 1px solid #30363d;
  background: #0d1117;
  font-size: 11px;
  color: #8b949e;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.pb-picker-footer kbd {
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 3px;
  padding: 1px 5px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10px;
  color: #c9d1d9;
  margin: 0 2px 0 0;
  line-height: 14px;
  display: inline-block;
}

.pb-picker-helplink {
  margin-left: auto;
  background: transparent;
  border: 1px solid #30363d;
  color: #c9d1d9;
  border-radius: 3px;
  padding: 3px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
}
.pb-picker-helplink:hover {
  background: #30363d;
  border-color: #6e7681;
  color: #fff;
}

/* ── Help overlay (modal-on-modal) ─────────────────────────────────────── */
.pb-help-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  padding: 16px;
}
.pb-help-panel {
  width: min(960px, 100%);
  max-height: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 10px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  color: #c9d1d9;
}
.pb-help-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #30363d;
  background: #161b22;
  gap: 12px;
  flex-shrink: 0;
}
.pb-help-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}
.pb-help-sub {
  margin: 4px 0 0;
  color: #8b949e;
  font-size: 12px;
}
.pb-help-body {
  padding: 16px 20px 20px;
  overflow-y: auto;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-size: 13px;
  line-height: 1.55;
}
.pb-help-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pb-help-h3 {
  margin: 4px 0 2px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}
.pb-help-codeblock {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 10px 12px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  white-space: pre;
  color: #d1d5db;
  margin: 0;
  overflow-x: auto;
}
.pb-help-list {
  margin: 0;
  padding-left: 18px;
}
.pb-help-list li { margin: 2px 0; }
.pb-help-note {
  font-size: 12px;
  color: #8b949e;
  background: rgba(187, 128, 9, 0.08);
  border-left: 3px solid rgba(187, 128, 9, 0.55);
  padding: 8px 12px;
  border-radius: 4px;
  margin: 4px 0;
}
.pb-help-mistakes {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}
.pb-help-mistakes th,
.pb-help-mistakes td {
  border: 1px solid #30363d;
  padding: 6px 10px;
  text-align: left;
}
.pb-help-mistakes th {
  background: #161b22;
  color: #fff;
  font-weight: 600;
}
.pb-help-mistakes code {
  color: #f85149;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

/* Quick-reference table */
.pb-help-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.pb-help-filter {
  flex: 1 1 240px;
  min-width: 200px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 6px 10px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 13px;
}
.pb-help-filter:focus {
  outline: none;
  border-color: #58a6ff;
}
.pb-help-legend {
  font-size: 11px;
  color: #8b949e;
}
.pb-help-legend code {
  color: #d1d5db;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 3px;
  padding: 1px 4px;
  margin: 0 2px;
  font-size: 10px;
}
.pb-help-tablewrap {
  border: 1px solid #30363d;
  border-radius: 4px;
  overflow: auto;
  max-height: 360px;
}
.pb-help-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}
.pb-help-table thead {
  position: sticky;
  top: 0;
  background: #161b22;
  z-index: 1;
}
.pb-help-th,
.pb-help-th-nosort {
  padding: 6px 10px;
  text-align: left;
  font-weight: 600;
  color: #fff;
  border-bottom: 1px solid #30363d;
  white-space: nowrap;
}
.pb-help-th {
  cursor: pointer;
  user-select: none;
}
.pb-help-th:hover {
  background: rgba(88, 166, 255, 0.10);
}
.pb-help-sortmark {
  display: inline-block;
  min-width: 10px;
  color: #58a6ff;
}
.pb-help-table tbody tr {
  border-bottom: 1px solid #21262d;
}
.pb-help-table tbody tr:hover {
  background: rgba(88, 166, 255, 0.06);
}
.pb-help-table td {
  padding: 5px 10px;
  vertical-align: top;
}
.pb-help-code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-weight: 700;
  color: #58a6ff;
}
.pb-help-cat {
  color: #8b949e;
  font-size: 11px;
}
.pb-help-srai {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  color: #d29922;
  letter-spacing: 1px;
}
.pb-help-shape {
  font-size: 11px;
}
.pb-help-shape code {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 3px;
  padding: 1px 4px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.pb-help-page {
  text-align: right;
  color: #8b949e;
  width: 1%;
  white-space: nowrap;
}
.pb-help-empty {
  text-align: center;
  color: #8b949e;
  padding: 20px;
}
.pb-help-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #30363d;
  background: #161b22;
  flex-shrink: 0;
}
.pb-help-foot-note {
  font-size: 11px;
  color: #8b949e;
}
.pb-help-foot-note code {
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 3px;
  padding: 1px 4px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
</style>
