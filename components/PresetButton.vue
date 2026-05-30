<template>
  <button
    class="preset-btn"
    :class="{
      'is-running': running,
      'is-ok': flashState === 'ok',
      'is-error': flashState === 'error',
      'is-toggle': isToggle,
      'is-toggle-switch': useSwitchStyle,
      [`is-toggle-${ledStatus}`]: isToggle,
    }"
    :style="btnStyle"
    :disabled="running || !connected"
    :title="buttonTitle"
    @click="onClick"
  >
    <!-- Toggle (switch style): industrial bat-handle switch panel
         replaces the accent bar + inline LED. The lever itself is the
         state indicator and mirrors the live radio state via SSE
         (LK/MX/ST/VX/BI/TS) or the local cache otherwise. Only used
         when the operator opted in via the "Use rocket-switch visual
         style" checkbox in the preset builder. -->
    <div
      v-if="useSwitchStyle"
      class="rocket-switch"
      :title="ledTitle"
      aria-hidden="true"
    >
      <span class="rs-label rs-label-on">ON</span>
      <div class="rs-housing">
        <span class="rs-screw rs-screw-tl"></span>
        <span class="rs-screw rs-screw-tr"></span>
        <span class="rs-screw rs-screw-bl"></span>
        <span class="rs-screw rs-screw-br"></span>
        <span class="rs-slot"></span>
        <span class="rs-lever">
          <span class="rs-lever-tip"></span>
          <span class="rs-lever-base"></span>
        </span>
      </div>
      <span class="rs-label rs-label-off">OFF</span>
    </div>

    <!-- Default (non-switch) look: original left accent bar — used for
         every non-toggle preset AND for toggle presets that didn't opt
         into the rocket-switch visual. -->
    <span
      v-else
      class="accent-bar"
      :style="{ background: preset.color ?? '#6b7280' }"
    />

    <span class="btn-body">
      <span class="btn-top">
        <!-- span class="btn-icon" v-if="preset.icon">{{ preset.icon }}</span -->
        <span class="btn-label">{{ preset.label }}</span>
        <!-- Toggle preset without the rocket-switch style still needs a
             state indicator — the original small LED dot. -->
        <span
          v-if="isToggle && !useSwitchStyle"
          class="btn-led"
          :class="`btn-led-${ledStatus}`"
          :title="ledTitle"
          aria-hidden="true"
        />
      </span>
      <span class="btn-desc" v-if="preset.description">{{ preset.description }}</span>
    </span>

    <!-- Status overlay (sequence-execute progress + flash) -->
    <Transition name="fade">
      <span v-if="running && !isToggle" class="status-overlay running">
        <span class="spinner">⟳</span> {{ progress }}
      </span>
      <span v-else-if="running && isToggle" class="status-overlay running">
        <span class="spinner">⟳</span>
      </span>
      <span v-else-if="flashState === 'ok'" class="status-overlay ok">✓ {{ okMessage }}</span>
      <span v-else-if="flashState === 'error'" class="status-overlay err">
        ✕ {{ errorMsg }}
      </span>
    </Transition>
  </button>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { isBinaryToggleCommand, TOGGLE_STATE_FIELDS } from './cat-commands-ftx1'
import {
  parsePresetCommandEntry,
  presetCommandCount,
  type PresetCommandEntry,
} from './preset-command-utils'

interface Preset {
  id: string
  label: string
  color?: string
  icon?: string
  description?: string
  commands: PresetCommandEntry[]
  /** When true, render as a binary 0/1 toggle switch. See cat-commands-ftx1.ts. */
  toggle?: boolean
  /**
   * Cosmetic only. When true (and `toggle` is also true), render as a
   * physical bat-handle switch on a dark panel; otherwise the flat
   * button + small LED is used. Has no effect when `toggle` is false.
   */
  toggleSwitch?: boolean
}

interface CommandResult {
  command: string
  response?: string
  error?: string
  ok: boolean
}

const props = defineProps<{
  preset: Preset
  connected: boolean
  /**
   * The full TransceiverState ref's `.value` (or `null` when disconnected).
   * The component looks up `TOGGLE_STATE_FIELDS[code]` for SSE-tracked
   * toggle commands (LK, MX, ST, VX) so the LED auto-reflects front-panel
   * changes. For untracked commands (BI, TS) we fall back to `localCache`.
   *
   * Loosely-typed on purpose — the source of truth is `TransceiverState`
   * in pages/index.vue, but importing it here would create a circular
   * dependency through the catalogue module.
   */
  state?: Record<string, unknown> | null
}>()

const emit = defineEmits<{
  executed: [results: CommandResult[]]
}>()

const running = ref(false)
const flashState = ref<'ok' | 'error' | null>(null)
const errorMsg = ref('')
const okMessage = ref('Ready')
const progress = ref('')
let flashTimer: ReturnType<typeof setTimeout> | null = null

// Local cache of the toggle state for commands the serial server does
// not track (BI, TS). Filled by a read on mount and refreshed after
// every click. `null` = unknown.
const localCache = ref<'0' | '1' | null>(null)

const btnStyle = computed(() => ({
  '--preset-color': props.preset.color ?? '#6b7280',
}))

// ── Toggle-mode plumbing ───────────────────────────────────────────────
/** First step's 2-letter code, or '' when missing. */
const commandStepCount = computed(() => presetCommandCount(props.preset.commands))

const toggleCode = computed<string>(() => {
  const first = props.preset.commands?.[0]
  return parsePresetCommandEntry(first).command.slice(0, 2).toUpperCase()
})

/** True when this preset is configured as a toggle AND the code is eligible. */
const isToggle = computed<boolean>(() =>
  props.preset.toggle === true && isBinaryToggleCommand(toggleCode.value),
)

/**
 * Cosmetic flag: render the toggle as a physical bat-handle switch
 * (`.rocket-switch`) instead of the default flat button + small LED.
 * Only relevant when `isToggle` is true; missing/false ⇒ flat-button
 * style. This keeps every existing toggle preset looking exactly as it
 * did before the switch visual was added — operators opt in per preset
 * via the builder.
 */
const useSwitchStyle = computed<boolean>(() =>
  isToggle.value && props.preset.toggleSwitch === true,
)

/**
 * Current radio value for the toggle command:
 *   '0' = OFF, '1' = ON, null = unknown.
 *
 * Every eligible toggle (LK/MX/ST/VX/BI/TS) is now SSE-tracked: the
 * serial server parses incoming AI frames for each code and exposes a
 * matching field on `TransceiverState` (lock, mox, split, vox, breakIn,
 * txWatch). The LED follows that field directly, including
 * front-panel-originated changes.
 *
 * `localCache` remains as a safety net for any future toggle command
 * added to the catalogue but not yet wired into the serial server.
 */
const currentValue = computed<'0' | '1' | null>(() => {
  if (!isToggle.value) return null
  const code = toggleCode.value
  const stateField = TOGGLE_STATE_FIELDS[code]
  if (stateField && props.state) {
    const v = (props.state as Record<string, unknown>)[stateField]
    if (v === true) return '1'
    if (v === false) return '0'
    return null
  }
  return localCache.value
})

/**
 * What the LED should display:
 *   'on'      — green (current state == '1')
 *   'off'     — red   (current state == '0')
 *   'unknown' — grey  (disconnected, or never read)
 *   'pending' — pulse (request in flight)
 */
const ledStatus = computed<'on' | 'off' | 'unknown' | 'pending'>(() => {
  if (running.value) return 'pending'
  if (!props.connected) return 'unknown'
  const v = currentValue.value
  if (v === '1') return 'on'
  if (v === '0') return 'off'
  return 'unknown'
})

const ledTitle = computed(() => {
  if (!props.connected) return 'Disconnected — state unknown'
  if (running.value) return 'Sending…'
  if (currentValue.value === '1') return `${toggleCode.value}: ON — click to turn OFF`
  if (currentValue.value === '0') return `${toggleCode.value}: OFF — click to turn ON`
  return `${toggleCode.value}: state unknown — click to read & toggle`
})

const buttonTitle = computed(() => {
  if (isToggle.value) return props.preset.description ?? `${toggleCode.value} toggle`
  return props.preset.description ?? props.preset.label
})

// ── Click dispatcher ──────────────────────────────────────────────────
function onClick() {
  if (running.value || !props.connected) return
  if (isToggle.value) {
    void executeToggle()
  } else {
    void executeSequence()
  }
}

// ── Sequence execution (existing behaviour) ────────────────────────────
async function executeSequence() {
  running.value = true
  flashState.value = null
  const total = commandStepCount.value
  progress.value = `0 / ${total}`

  let progressInterval: ReturnType<typeof setInterval> | null = null
  let step = 0
  progressInterval = setInterval(() => {
    if (step < total - 1) {
      step++
      progress.value = `${step} / ${total}`
    }
  }, 120)

  try {
    const data = await $fetch<{ ok: boolean; results: CommandResult[] }>('/api/preset-execute', {
      method: 'POST',
      body: { commands: props.preset.commands },
    })

    const failed = data.results.filter((r) => !r.ok)
    if (failed.length > 0) {
      flashState.value = 'error'
      errorMsg.value = `${failed[0].command}: ${failed[0].error}`
    } else {
      flashState.value = 'ok'
      okMessage.value = 'Ready'
    }
    emit('executed', data.results)
  } catch (e: any) {
    flashState.value = 'error'
    errorMsg.value = e.data?.message ?? e.message ?? 'Error'
  } finally {
    clearInterval(progressInterval!)
    running.value = false
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashState.value = null }, 3000)
  }
}

// ── Toggle execution ──────────────────────────────────────────────────
// Design notes:
//
// • We do NOT use `await: true` on the SET. The existing one-shot
//   toggles in pages/index.vue (LK, MX, VX, MOX, split, pre-amp, …)
//   also fire SETs without `await: true`. The HTTP call returns as
//   soon as the bytes leave the COM port; the radio's AI-mode echo
//   updates `state.*` via the SSE pipeline.
// • We do NOT issue a CAT read before the SET. For every supported
//   toggle code (LK/MX/ST/VX/BI/TS) the serial server already tracks
//   the state field directly, and on connect it issues an initial
//   query for each one. The LED is therefore correct from the moment
//   the connect handshake settles.
// • `localCache` covers the corner case of a future catalogue entry
//   that doesn't yet have a serial-server parser — the first click
//   defaults to `'1'` (the catalogue's paramDefault for every binary
//   toggle today) and subsequent clicks alternate.

async function executeToggle() {
  const code = toggleCode.value
  if (!code) return

  running.value = true
  flashState.value = null

  // Default direction when the radio state is genuinely unknown is '1'
  // (turn the function ON) — matches the typical preset naming
  // convention ("BI On", "MOX On", …) and the catalogue's paramDefault
  // for every binary-toggle command.
  const current = currentValue.value
  const next: '0' | '1' = current === '1' ? '0' : '1'

  try {
    // Fire-and-forget SET — same pattern as every other one-shot toggle
    // in pages/index.vue. The serial server returns as soon as the
    // bytes are on the wire; the new state propagates back via SSE
    // (tracked codes) or via the optimistic cache update below
    // (untracked codes).
    await $fetch('/api/command', {
      method: 'POST',
      body: { command: `${code}${next}` },
    })

    // SSE-tracked codes will overwrite this when the next delta arrives
    // — that's fine, the LED ends up at the radio-authoritative value.
    // For untracked codes this *is* the source of truth until the
    // operator clicks again.
    if (!TOGGLE_STATE_FIELDS[code]) {
      localCache.value = next
    }

    flashState.value = 'ok'
    okMessage.value = next === '1' ? 'ON' : 'OFF'

    emit('executed', [{
      command: `${code}${next}`,
      ok: true,
    }])
  } catch (e: any) {
    flashState.value = 'error'
    errorMsg.value = e.data?.message ?? e.message ?? 'Error'
  } finally {
    running.value = false
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashState.value = null }, 1500)
  }
}

// ── Lifecycle: invalidate the local cache across disconnects ──────────
// We intentionally do NOT issue a read on mount. On slow virtual-COM
// links the read can stall the page for seconds per toggle preset, and
// in the most common case (BI / TS) the radio firmware may not even
// answer the read. The LED starts grey ("unknown") and turns
// green/red on the first click. For SSE-tracked codes (LK/MX/ST/VX)
// the LED is correct from the moment the SSE state arrives.

watch(() => props.connected, (connected) => {
  if (!connected) {
    // Drop the cache — we no longer have any way to verify it.
    localCache.value = null
  }
})

// If the preset's command itself changes (the operator edited it in
// the builder), clear the cache so a stale BI/TS value doesn't leak
// across a code change.
watch(toggleCode, () => {
  localCache.value = null
})
</script>

<style scoped>
.preset-btn {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: #e6edf3;
  transition: border-color .15s, background .15s, opacity .15s;
  overflow: hidden;
  min-width: 100px;
  max-width: 260px;
  padding: 0;
}

.preset-btn:hover:not(:disabled) {
  border-color: var(--preset-color);
  background: color-mix(in srgb, var(--preset-color) 8%, #161b22);
}

.preset-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.preset-btn.is-ok {
  border-color: #3fb950;
  background: rgba(63, 185, 80, .1);
}

.preset-btn.is-error {
  border-color: #f85149;
  background: rgba(248, 81, 73, .1);
}

.preset-btn.is-running {
  border-color: var(--preset-color);
  background: color-mix(in srgb, var(--preset-color) 6%, #161b22);
}

/* Toggle-mode border tint mirrors the LED so the state is visible even
   when the button is small / partially clipped. Subtle to keep the
   accent bar (custom colour) recognisable. */
.preset-btn.is-toggle.is-toggle-on {
  border-color: #3fb950;
}
.preset-btn.is-toggle.is-toggle-off {
  border-color: #6e7681;
}
.preset-btn.is-toggle.is-toggle-pending {
  border-color: #d29922;
}

/* Left accent bar */
.accent-bar {
  display: block;
  width: 4px;
  flex-shrink: 0;
  border-radius: 8px 0 0 8px;
}

/* Button body */
.btn-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  flex: 1;
  min-width: 0;
}

.btn-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-icon {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.btn-label {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.btn-badge {
  font-family: 'SF Mono', monospace;
  font-size: 10px;
  padding: 1px 6px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 10px;
  color: #8b949e;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-badge::after {
  content: ' cmd';
}

.btn-desc {
  font-size: 11px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* ── Toggle LED (default style: flat button + small green/red dot) ──
   Used for every toggle preset that did NOT opt into the rocket-switch
   visual style. Lives inside .btn-top next to the label. */
.btn-led {
  display: inline-block;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.45);
  background: #6e7681;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  transition: background .15s, box-shadow .15s;
}
.btn-led-on {
  background: #3fb950;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.18),
    0 0 6px rgba(63, 185, 80, 0.55);
}
.btn-led-off {
  background: #f85149;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.10),
    0 0 4px rgba(248, 81, 73, 0.40);
}
.btn-led-unknown {
  background: #6e7681;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}
.btn-led-pending {
  background: #d29922;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.18),
    0 0 5px rgba(210, 153, 34, 0.55);
  animation: led-pulse 0.9s ease-in-out infinite;
}
@keyframes led-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* ── Rocket-launch toggle switch (industrial bat-handle) ──────────────
   Used only when a preset has both `toggle: true` AND
   `toggleSwitch: true` (i.e. the operator ticked "Use rocket-switch
   visual style" in the builder). The lever's vertical position is
   driven by the .is-toggle-{state} class on the root button — no
   script changes required.
   States: on  → handle UP    (green ON label glows)
           off → handle DOWN  (red  OFF label glows)
           unknown → handle centred, dimmed (radio state not yet seen)
           pending → handle oscillating (SET in flight) */

/* Only the *switch-style* toggle gets the dark machined-panel finish;
   plain toggle buttons keep the standard #161b22 background so they
   sit next to non-toggle presets in the grid without visual jarring. */
.preset-btn.is-toggle-switch {
  background:
    linear-gradient(145deg, #1d2228 0%, #11141a 100%);
  min-height: 66px;
}
.preset-btn.is-toggle-switch:hover:not(:disabled) {
  background:
    linear-gradient(145deg, #232830 0%, #15191f 100%);
}

/* The switch column (replaces .accent-bar in toggle mode) */
.rocket-switch {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 50px;
  padding: 4px 0;
  gap: 2px;
  background:
    linear-gradient(180deg, #20252c 0%, #0c0f13 100%);
  border-right: 1px solid #2a2e34;
  box-shadow:
    inset 1px 0 0 rgba(255, 255, 255, 0.04),
    inset -1px 0 0 rgba(0, 0, 0, 0.6);
  pointer-events: none; /* clicks bubble to the parent button */
}

/* Stencil-style ON / OFF labels */
.rs-label {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: #4b5159;
  line-height: 1;
  user-select: none;
  transition: color .2s ease, text-shadow .2s ease;
}
.preset-btn.is-toggle.is-toggle-on .rs-label-on {
  color: #3fb950;
  text-shadow: 0 0 5px rgba(63, 185, 80, 0.75);
}
.preset-btn.is-toggle.is-toggle-off .rs-label-off {
  color: #f85149;
  text-shadow: 0 0 5px rgba(248, 81, 73, 0.75);
}

/* The recessed metal housing the lever sits in */
.rs-housing {
  position: relative;
  width: 26px;
  height: 36px;
  background:
    linear-gradient(to right,
      #050608 0%, #0e1115 30%, #181c22 50%, #0e1115 70%, #050608 100%);
  border: 1px solid #3a3f46;
  border-radius: 4px;
  box-shadow:
    inset 0 2px 5px rgba(0, 0, 0, 0.85),
    inset 0 -1px 0 rgba(255, 255, 255, 0.04),
    0 1px 0 rgba(255, 255, 255, 0.04);
}

/* Tiny corner screws — sells the "real switch" illusion */
.rs-screw {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 30%, #c0c0c0 0%, #6a6a6a 55%, #2a2a2a 100%);
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.8);
}
.rs-screw-tl { top: 2px;    left: 2px; }
.rs-screw-tr { top: 2px;    right: 2px; }
.rs-screw-bl { bottom: 2px; left: 2px; }
.rs-screw-br { bottom: 2px; right: 2px; }

/* Faint vertical slot the lever travels along */
.rs-slot {
  position: absolute;
  left: 50%;
  top: 4px;
  bottom: 4px;
  width: 2px;
  transform: translateX(-50%);
  background:
    linear-gradient(to bottom,
      rgba(0,0,0,0.0) 0%,
      rgba(0,0,0,0.55) 15%,
      rgba(0,0,0,0.55) 85%,
      rgba(0,0,0,0.0) 100%);
  border-radius: 1px;
}

/* The bat-handle lever — two stacked parts so it reads as 3-D
   (tip = bright cap, base = darker shank) */
.rs-lever {
  position: absolute;
  left: 50%;
  width: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(-50%);
  transition: top .25s cubic-bezier(0.35, 1.6, 0.45, 1);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.65));
}
.rs-lever-tip {
  width: 14px;
  height: 9px;
  border-radius: 3px 3px 1px 1px;
  background:
    linear-gradient(180deg,
      #ffffff 0%,
      #e0e0e0 30%,
      #b8b8b8 55%,
      #909090 100%);
  border: 1px solid #2a2c2f;
  border-bottom: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
.rs-lever-base {
  width: 11px;
  height: 8px;
  border-radius: 0 0 2px 2px;
  background:
    linear-gradient(180deg,
      #8a8a8a 0%,
      #5e5e5e 50%,
      #3a3a3a 100%);
  border: 1px solid #1c1d1f;
  border-top: none;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.5);
}

/* Lever position per state (parent class drives this) */
.preset-btn.is-toggle.is-toggle-on .rs-lever {
  top: 2px;
}
.preset-btn.is-toggle.is-toggle-off .rs-lever {
  top: 17px;
}
.preset-btn.is-toggle.is-toggle-unknown .rs-lever {
  top: 9px;
  opacity: 0.45;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.65)) grayscale(0.6);
}
.preset-btn.is-toggle.is-toggle-pending .rs-lever {
  animation: rs-lever-vibrate 0.45s ease-in-out infinite alternate;
}

@keyframes rs-lever-vibrate {
  from { top: 4px;  }
  to   { top: 15px; }
}

/* Subtle outer halo so an "ON" rocket-switch preset is recognisable
   across the grid. Scoped to .is-toggle-switch so plain LED toggles
   don't gain a halo they didn't have before this feature. */
.preset-btn.is-toggle-switch.is-toggle-on {
  box-shadow:
    inset 0 0 10px rgba(63, 185, 80, 0.10),
    0 0 0 1px rgba(63, 185, 80, 0.10);
}
.preset-btn.is-toggle-switch.is-toggle-pending {
  box-shadow:
    inset 0 0 10px rgba(210, 153, 34, 0.10),
    0 0 0 1px rgba(210, 153, 34, 0.10);
}

/* Status overlay */
.status-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  font-family: 'SF Mono', monospace;
  border-radius: 8px;
  padding: 4px 12px;
  text-align: center;
  backdrop-filter: blur(2px);
}

.status-overlay.running {
  background: rgba(22, 27, 34, .88);
  color: var(--preset-color);
}

.status-overlay.ok {
  background: rgba(22, 27, 34, .88);
  color: #3fb950;
}

.status-overlay.err {
  background: rgba(22, 27, 34, .88);
  color: #f85149;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spinner {
  display: inline-block;
  animation: spin .7s linear infinite;
  margin-right: 4px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Transition */
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
