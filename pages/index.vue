<template>
  <div class="app">
    <!-- ── Header / Connection Bar ── -->
    <header class="header">
      <div class="header-brand">
        <span class="brand-logo">FTX-1</span>
        <span class="brand-sub">CAT Controller</span>
        <span class="brand-version">{{ appVersion }}</span>
        <span v-if="userSettings.call_sign" class="header-callsign">{{ userSettings.call_sign }}</span>
      </div>

      <div class="conn-bar">
        <select v-model="selectedPort" class="sel" :disabled="state.connected">
          <option value="" disabled>Select port…</option>
          <option v-for="p in ports" :key="p.path" :value="p.path">
            {{ p.path }}<template v-if="p.manufacturer"> — {{ p.manufacturer }}</template>
          </option>
        </select>

        <select v-model="selectedBaud" class="sel baud-sel" :disabled="state.connected">
          <option :value="4800">4800</option>
          <option :value="9600">9600</option>
          <option :value="19200">19200</option>
          <option :value="38400">38400</option>
          <option :value="115200">115200</option>
        </select>

        <button class="btn" :class="state.connected ? 'btn-danger' : 'btn-primary'" @click="toggleConnection" :disabled="connecting">
          {{ connecting ? '…' : state.connected ? 'Disconnect' : 'Connect' }}
        </button>

        <button class="btn btn-ghost" @click="refreshPorts" title="Refresh port list">⟳</button>
      </div>

      <div class="conn-status" :class="state.connected ? 'status-ok' : 'status-off'">
        {{ state.connected ? `● Connected — ${state.port}` : '○ Disconnected' }}
      </div>

      <!-- Legacy macro UI (hidden — superseded by Preset Builder + optional step timing) -->
      <div v-if="SHOW_MACRO_UI" class="macro-quickrun" ref="macroQuickRunEl">
        <button
          class="btn btn-ghost btn-sm"
          :disabled="macroRunBusy"
          @click="toggleMacroDropdown"
          :title="state.connected ? 'Run a saved macro' : 'Connect to run macros'"
        >▶ Run<span class="macro-quickrun-caret">▾</span></button>
        <div v-if="macroDropdownOpen" class="macro-quickrun-menu">
          <div class="macro-quickrun-head">
            Saved macros
            <span v-if="!state.connected" class="macro-quickrun-disabled-hint">(connect to run)</span>
          </div>
          <ul v-if="quickMacros.length > 0">
            <li
              v-for="m in quickMacros"
              :key="m.id"
              class="macro-quickrun-item"
            >
              <button
                class="macro-quickrun-run"
                :disabled="!state.connected || macroRunBusy"
                @click="runMacroById(m.id)"
              >▶ {{ m.name }} <small>({{ m.step_count }})</small></button>
              <button
                class="macro-quickrun-edit"
                title="Edit macro"
                @click="openMacroBuilder(m.id)"
              >✎</button>
            </li>
          </ul>
          <div v-else class="macro-quickrun-empty">No macros yet</div>
          <div class="macro-quickrun-foot">
            <button class="macro-quickrun-new" @click="openMacroBuilder()">+ New macro / open builder</button>
          </div>
        </div>
      </div>

      <button
        v-if="SHOW_MACRO_UI"
        class="btn btn-ghost btn-icon"
        @click="showMacroBuilder = true"
        title="Open Macro Builder"
        aria-label="Open Macro Builder"
      >☰</button>

      <button
        class="btn btn-ghost btn-icon"
        @click="showSettings = true"
        title="Appearance settings"
        aria-label="Appearance settings"
      >⚙</button>
    </header>

    <!-- ── Macro Builder modal (legacy, hidden) ── -->
    <div v-if="SHOW_MACRO_UI && showMacroBuilder" class="modal-overlay" @click.self="closeMacroBuilder">
      <div class="modal-container modal-half">
        <button class="modal-close" @click="closeMacroBuilder" aria-label="Close">✕</button>
        <MacroBuilder
          :open-macro-id="builderTargetId"
          @close="closeMacroBuilder"
          @saved="onMacroSaved"
        />
      </div>
    </div>

    <!-- ── Preset Builder modal ── -->
    <div v-if="showPresetBuilder" class="modal-overlay" @click.self="closePresetBuilder">
      <div class="modal-container modal-wide">
        <PresetBuilder
          :open-preset-id="builderTargetPresetId"
          :preset-timing-enabled="userSettings.preset_timing_enabled"
          :preset-default-delay-ms="userSettings.preset_default_delay_ms"
          @close="closePresetBuilder"
          @saved="onPresetSaved"
        />
      </div>
    </div>

    <!-- ── Macro toast (legacy, hidden) ── -->
    <div v-if="SHOW_MACRO_UI && macroToast" class="macro-toast" :class="macroToast.kind">
      {{ macroToast.text }}
    </div>

    <!-- ── Appearance settings drawer ── -->
    <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
      <aside class="settings-panel" role="dialog" aria-label="Settings">
        <header class="settings-header">
          <h2>Settings</h2>
          <button class="settings-close" @click="showSettings = false" aria-label="Close">✕</button>
        </header>

        <div class="settings-body">
          <p class="settings-hint">
            Settings are saved to the database and sync across sessions.
          </p>

          <section class="settings-section">
            <h3>Identification</h3>
            <div class="settings-row settings-row--wide">
              <label for="call-sign">Call Sign</label>
              <input
                id="call-sign"
                v-model="userSettings.call_sign"
                type="text"
                class="settings-hex"
                placeholder="e.g., SP9AX"
                maxlength="10"
                spellcheck="false"
                @change="saveUserSettings"
              />
            </div>
          </section>

          <section class="settings-section">
            <h3>Preset execution</h3>
            <label class="settings-row settings-row--check">
              <input
                v-model="userSettings.preset_timing_enabled"
                type="checkbox"
                @change="saveUserSettings"
              />
              <span class="settings-check-text">
                Off by default (FTX-1 is fast). Enable for legacy/slow rigs
                (e.g. Kenwood TS-850S @ 4800&nbsp;bps) or Raspberry&nbsp;Pi-class hosts.
              </span>
            </label>
            <div
              class="settings-row settings-row--wide settings-row--delay"
              :class="{ 'settings-row--disabled': !userSettings.preset_timing_enabled }"
            >
              <label for="settings-preset-delay">Default delay (ms)</label>
              <input
                id="settings-preset-delay"
                v-model.number="userSettings.preset_default_delay_ms"
                type="number"
                min="0"
                max="60000"
                step="10"
                class="settings-hex settings-delay-input"
                :disabled="!userSettings.preset_timing_enabled"
                @change="saveUserSettings"
              />
            </div>
          </section>

          <section class="settings-section">
            <h3>Appearance</h3>
            <h4 class="settings-subhead">Colors</h4>
            <div v-for="key in COLOR_VARS" :key="key" class="settings-row">
              <label :for="`theme-${key}`">{{ key }}</label>
              <input
                :id="`theme-${key}`"
                type="color"
                :value="themeValue(key)"
                @input="onColorPickerInput(key, ($event.target as HTMLInputElement).value)"
              >
              <input
                type="text"
                class="settings-hex"
                :value="hexInputDisplay(key)"
                spellcheck="false"
                maxlength="7"
                :title="`Type #RRGGBB then Enter or click away (${key})`"
                @input="onHexDraftInput(key, ($event.target as HTMLInputElement).value)"
                @blur="onHexDraftCommit(key)"
                @keydown.enter.prevent="onHexDraftCommit(key)"
                @keydown.esc.prevent="onHexDraftCancel(key)"
              >
            </div>
          </section>

          <section class="settings-section">
            <h4 class="settings-subhead">Layout</h4>
            <div class="settings-row">
              <label for="theme-radius">--radius</label>
              <input
                id="theme-radius"
                type="range"
                min="0"
                max="24"
                step="1"
                :value="themeRadiusPx"
                @input="setThemeVar('--radius', ($event.target as HTMLInputElement).value + 'px')"
              >
              <span class="settings-val">{{ themeValue('--radius') }}</span>
            </div>
            <div class="settings-row settings-row--wide">
              <label for="theme-font">--font-mono</label>
              <select
                id="theme-font"
                class="settings-select"
                :value="themeValue('--font-mono')"
                @change="setThemeVar('--font-mono', ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
            </div>
            <div class="settings-row settings-row--wide">
              <label for="theme-font-vfo">--font-vfo</label>
              <select
                id="theme-font-vfo"
                class="settings-select"
                :value="themeValue('--font-vfo')"
                @change="setThemeVar('--font-vfo', ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="f in VFO_FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
            </div>
            <p class="settings-font-hint">VFO frequency readout only (MAIN and SUB MHz display).</p>
          </section>
        </div>

        <footer class="settings-footer">
          <span class="settings-foot-hint">
            {{ Object.keys(themeOverrides).length }} override(s) active
          </span>
          <button class="btn btn-ghost" @click="resetTheme">Reset to defaults</button>
        </footer>
      </aside>
    </div>

    <!-- ── Error banner ── -->
    <div v-if="lastError" class="error-banner">
      {{ lastError }}
      <button class="close-btn" @click="lastError = null">✕</button>
    </div>

    <!-- ── Main dashboard (only when connected) ── -->
    <main v-if="state.connected" class="dashboard">

      <!-- TX/RX Indicator + FUNC KNOB row -->
      <div class="txbar">
        <div class="btns">
            <button
              class="btn tx-indicator power-off"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('PS0')"
              title="POWER OFF"
            >POWER OFF</button>
        </div>
        
        <div class="tx-indicator" :class="{ 'tx-active': state.txState || state.mox }">
          <span>{{ (state.txState || state.mox) ? 'TX' : 'RX' }}</span>
          <span v-if="state.radioInfo?.hiSwr" class="swr-alarm">HI-SWR!</span>
        </div>

        <div class="func-knob-widget">
          <span class="func-knob-label">FUNC KNOB</span>:
          <span class="func-knob-value">{{ state.funcKnob ?? '--' }}</span>
          <div class="func-knob-btns">
            <button
              class="btn btn-ghost btn-sm func-knob-label"
              :class="{ 'btn-active': state.funcKnob === 'D-LEVEL' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF01')"
              title="SET FUNC KNOB → D-LEVEL"
            >D-LEVEL</button>
            <button
              class="btn btn-ghost btn-sm func-knob-label"
              :class="{ 'btn-active': state.funcKnob === 'RF POWER' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF0D')"
              title="SET FUNC KNOB → RF POWER"
            >RF POWER</button>
            <button
              class="btn btn-ghost btn-sm func-knob-label"
              :class="{ 'btn-active': state.funcKnob === 'MIC GAIN' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF07')"
              title="SET FUNC KNOB → MIC GAIN"
            >MIC GAIN</button>
            <button
              class="btn btn-ghost btn-sm func-knob-label"
              :class="{ 'btn-active': state.funcKnob === 'AMC LEVEL' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF09')"
              title="SET FUNC KNOB → AMC LEVEL"
            >AMC LEVEL</button>
            <button
              class="btn btn-ghost btn-sm func-knob-label"
              :class="{ 'btn-active': state.funcKnob === 'PROC LEVEL' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF08')"
              title="SET FUNC KNOB → PROC LEVEL"
            >PROC LEVEL</button>
            <button
              class="btn btn-ghost btn-sm func-knob-label"
              :class="{ 'btn-active': state.funcKnob === 'VOX GAIN' }"
              :disabled="!state.connected || funcKnobBusy"
              @click="setFuncKnob('SF0A')"
              title="SET FUNC KNOB → VOX GAIN"
            >VOX GAIN</button>
            <button
                class="btn btn-ghost btn-sm func-knob-label"
                :class="{ 'btn-active': state.funcKnob === 'MONI LEVEL' }"
                :disabled="!state.connected || funcKnobBusy"
                @click="setFuncKnob('SF0E')"
                title="SET FUNC KNOB → MONI LEVEL"
            >MONI LEVEL</button>
            <button
                class="btn btn-ghost btn-sm func-knob-label"
                :class="{ 'btn-active': state.funcKnob === 'CONTRAST' }"
                :disabled="!state.connected || funcKnobBusy"
                @click="setFuncKnob('SF04')"
                title="SET FUNC KNOB → CONTRAST"
            >CONTRAST</button>
            <button
                class="btn btn-ghost btn-sm func-knob-label"
                :class="{ 'btn-active': state.funcKnob === 'DIMMER' }"
                :disabled="!state.connected || funcKnobBusy"
                @click="setFuncKnob('SF05')"
                title="SET FUNC KNOB → DIMMER"
            >DIMMER</button>
          </div>
        </div>
      </div>
    
      <!-- ── VFO Section ── -->
      <section class="vfo-section">
        <!-- SUB VFO -->
        <div class="vfo-card sub-card"
          :class="{
            'vfo-card--tx-vfo':    state.txVfo === 1,
            'vfo-card--inactive':  state.rxMode === 'single' && state.txVfo === 0 && state.split,
            'vfo-card--switchable': state.rxMode === 'single' && state.txVfo === 0 && !state.split,
          }"
        >
          <div v-if="state.rxMode === 'single' && state.txVfo === 0 && !state.split" class="vfo-switch-overlay" @click="switchToVfo('1')" />
          <div class="vfo-header">
            <span class="vfo-label">SUB</span>
            <span v-if="state.txVfo === 1" class="tx-vfo-badge">TX/RX</span>
            <span v-else class="rx-vfo-badge" @click="switchToVfo('1')">RX</span>
            <button v-if="state.txVfo === 1" class="band-sel btn-up" :disabled="state.txState || state.mox" @click="sendUp()">Up</button>
            <button v-if="state.txVfo === 1" class="band-sel btn-up" :disabled="state.txState || state.mox" @click="sendDn()">Dn</button>
            <button
              class="band-sel"
              :disabled="bandBusy || state.txState || state.mox"
              @click="openBandPopup('1')"
            >{{ bandSelLabel(subBandCode) }}</button>
            <button
              class="mode-sel"
              :style="modeBadgeStyle(state.subMode)"
              :disabled="modeBusy || state.txState || state.mox"
              @click="openModePopup('1')"
            >{{ state.subMode ?? '--' }}</button>
          </div>
          <div class="freq-row">
            <!--div class="freq-display freq-sub">
              {{ formatFreq(state.subFreq) }}
            </div>
            <div class="freq-sep" / -->
            <div class="freq-tuner freq-sub" :class="{ 'freq-tx': state.txState || state.mox }">
              <template v-for="(group, gi) in freqGroups(state.subFreq)" :key="gi">
                <span v-if="gi > 0" class="freq-dot">.</span>
                <div class="freq-group" @wheel.prevent="onFreqWheel('1', gi, $event)">{{ group }}</div>
              </template>
            </div>
            <span class="freq-unit">MHz</span>
            <!-- BandwidthDisplay :mode="state.subMode" :bandwidth="state.subBandwidth" :shift="state.subShift"
              @update:bandwidth="setBandwidth('1', $event)"
              @update:shift="setShift('1', $event)"
            / -->
            <div v-if="isFmMode(state.subMode) && state.subSqlType !== null && state.subSqlType !== 0" class="sql-row">
            <span class="sql-badge" :style="{ background: sqlTypeColor(state.subSqlType) + '28', borderColor: sqlTypeColor(state.subSqlType), color: sqlTypeColor(state.subSqlType) }">
              {{ sqlTypeLabel(state.subSqlType) }}
              <span v-if="toneDisplay(state.subSqlType, state.subCtcssTone, state.subDcsCode)" class="sql-tone">
              {{ toneDisplay(state.subSqlType, state.subCtcssTone, state.subDcsCode) }}
            </span>
            </span>
            </div>
          </div>
          <SMeter :value="state.subSmeter" label="SUB S-meter" />
          <LevelBar :value="state.afGainSub" label="VOLUME" color="linear-gradient(90deg,#a60f0f,#c60f0f)" :clickable="true" :wheelable="true" @update="setAfGain('1', $event)" />
          <LevelBar v-if="(state.sqlRfMode===0)||((state.sqlRfMode===2)&&isRfGainMode(state.subMode))" :value="state.rfGainSub" label="RF GAIN" color="linear-gradient(90deg,#f59e0b,#fcd34d)" :clickable="true" @update="setRfGain('1', $event)" />
          <LevelBar v-if="(state.sqlRfMode===1)||((state.sqlRfMode===2)&&(!isRfGainMode(state.subMode)))" :value="state.sqSub" label="SQUELCH" color="linear-gradient(90deg,#f59e0b,#fcd34d)" :clickable="true" @update="setSquelch('1', $event)" />
          <br/>
          <section class="status-section">
            <StatusBadge label="AGC" :value="state.agcSub ?? '--'" :active="state.agcSub !== null && state.agcSub !== 'OFF'" color-active="#10b981" :clickable="state.agcSub !== null" :busy="agcBusy" @toggle="cycleAgc('1')" />
            <StatusBadge label="NARROW" :value="state.narrowSub != null ? (state.narrowSub ? 'ON' : 'OFF') : '--'" :active="state.narrowSub === true" color-active="#a78bfa" :clickable="state.narrowSub !== null" :busy="narrowBusy" @toggle="toggleNarrow('1')" />
            <div class="dnr-wrap" :class="{ 'dnr-wrap--active': isDnrMode(state.subMode) }" @wheel.prevent="onDnrWheel('1', $event)">
              <StatusBadge label="DNR" :value="state.dnrSub != null ? String(state.dnrSub) : '--'" :active="isDnrMode(state.subMode) && state.dnrSub != null && state.dnrSub !== 'OFF' && state.dnrSub !== 0" color-active="#22d3ee" />
            </div>
            <StatusBadge label="Tone SQL" :value="state.subSqlType != null ? sqlTypeLabel(state.subSqlType) : '--'" :active="state.subSqlType>0" color-active="#10b981" :clickable="true" :busy="sqlTypeBusy" @toggle="cycleSqlType('1', state.subSqlType)" />
            <StatusBadge label="CTCSS" :value="state.subCtcssTone != null ? (CTCSS_TONES[state.subCtcssTone]?.toFixed(1) + ' Hz') : '--'" :clickable="true" :active="ctcssPopupVfo === '1'" @toggle="openCtcssPopup('1')" />
            <StatusBadge label="DCS" :value="state.subDcsCode != null ? ('D' + String(DCS_CODES[state.subDcsCode]).padStart(3, '0')) : '--'" :clickable="true" :active="dcsPopupVfo === '1'" @toggle="openDcsPopup('1')" />
            <StatusBadge label="SAVE CH" value="ADD" color-active="#f97316" :clickable="state.subFreq !== null" @toggle="openChannelSaveModal('1')" />
          </section>
        </div>

        <!-- MAIN VFO -->
        <div class="vfo-card main-card"
             :class="{
            'vfo-card--tx-vfo':    state.txVfo === 0,
            'vfo-card--inactive':  state.rxMode === 'single' && state.txVfo === 1 && state.split,
            'vfo-card--switchable': state.rxMode === 'single' && state.txVfo === 1 && !state.split,
          }"
        >
          <div
            v-if="state.rxMode === 'single' && state.txVfo === 1 && !state.split"
            class="vfo-switch-overlay"
            @click="switchToVfo('0')"
          />
          <div class="vfo-header">
            <span class="vfo-label">MAIN</span>
            <span v-if="state.txVfo === 0" class="tx-vfo-badge">TX/RX</span>
            <span v-else class="rx-vfo-badge"  @click="switchToVfo('0')">RX</span>
            <button v-if="state.txVfo === 0" class="band-sel btn-up" :disabled="state.txState || state.mox" @click="sendUp()">Up</button>
            <button v-if="state.txVfo === 0" class="band-sel btn-up" :disabled="state.txState || state.mox" @click="sendDn()">Dn</button>
            <button
                class="band-sel"
                :disabled="bandBusy || state.txState || state.mox"
                @click="openBandPopup('0')"
            >{{ bandSelLabel(mainBandCode) }}</button>
            <button
                class="mode-sel"
                :style="modeBadgeStyle(state.mainMode)"
                :disabled="modeBusy || state.txState || state.mox"
                @click="openModePopup('0')"
            >{{ state.mainMode ?? '--' }}</button>
          </div>
          <div class="freq-row">
            <!-- div class="freq-display" :class="{ 'freq-tx': state.txState || state.mox }">
              {{ formatFreq(state.mainFreq) }}
            </div>
            <div class="freq-sep" / -->
            <div class="freq-tuner" :class="{ 'freq-tx': state.txState || state.mox }">
              <template v-for="(group, gi) in freqGroups(state.mainFreq)" :key="gi">
                <span v-if="gi > 0" class="freq-dot">.</span>
                <div class="freq-group" @wheel.prevent="onFreqWheel('0', gi, $event)">{{ group }}</div>
              </template>
            </div>
            <span class="freq-unit">MHz</span>
            <BandwidthDisplay
              :mode="state.mainMode"
              :bandwidth="state.mainBandwidth"
              :shift="state.mainShift"
              @update:bandwidth="setBandwidth('0', $event)"
              @update:shift="setShift('0', $event)"
            />
            <div v-if="isFmMode(state.mainMode) && state.mainSqlType !== null && state.mainSqlType !== 0" class="sql-row">
              <span class="sql-badge" :style="{ background: sqlTypeColor(state.mainSqlType) + '28', borderColor: sqlTypeColor(state.mainSqlType), color: sqlTypeColor(state.mainSqlType) }">
                {{ sqlTypeLabel(state.mainSqlType) }}
                <span v-if="toneDisplay(state.mainSqlType, state.mainCtcssTone, state.mainDcsCode)" class="sql-tone">{{ toneDisplay(state.mainSqlType, state.mainCtcssTone, state.mainDcsCode) }}
                </span>
              </span>
            </div>
          </div>
          <SMeter :value="state.mainSmeter" label="MAIN S-meter" />
          <LevelBar :value="state.afGainMain" label="VOLUME" color="linear-gradient(90deg,#a60f0f,#c60f0f)" :clickable="true" :wheelable="true" @update="setAfGain('0', $event)" />
          <LevelBar v-if="(state.sqlRfMode===0)||((state.sqlRfMode===2)&&isRfGainMode(state.subMode))" :value="state.rfGainMain" label="RF GAIN" color="linear-gradient(90deg,#f59e0b,#fcd34d)" :clickable="true" @update="setRfGain('0', $event)" />
          <LevelBar v-if="(state.sqlRfMode===1)||((state.sqlRfMode===2)&&(!isRfGainMode(state.subMode)))" :value="state.sqMain" label="SQUELCH" color="linear-gradient(90deg,#f59e0b,#fcd34d)" :clickable="true" @update="setSquelch('0', $event)" />
          <br/>
          <section class="status-section">
            <StatusBadge label="AGC" :value="state.agcMain ?? '--'" :active="state.agcMain !== null && state.agcMain !== 'OFF'" color-active="#10b981" :clickable="state.agcMain !== null" :busy="agcBusy" @toggle="cycleAgc('0')" />
            <StatusBadge label="NARROW" :value="state.narrowMain != null ? (state.narrowMain ? 'ON' : 'OFF') : '--'" :active="state.narrowMain === true" color-active="#a78bfa" :clickable="state.narrowMain !== null" :busy="narrowBusy" @toggle="toggleNarrow('0')" />
            <div class="dnr-wrap" :class="{ 'dnr-wrap--active': isDnrMode(state.mainMode) }" @wheel.prevent="onDnrWheel('0', $event)">
              <StatusBadge label="DNR" :value="state.dnrMain != null ? String(state.dnrMain) : '--'" :active="isDnrMode(state.mainMode) && state.dnrMain != null && state.dnrMain !== 'OFF' && state.dnrMain !== 0" color-active="#22d3ee" />
            </div>
            <StatusBadge label="Tone SQL" :value="state.mainSqlType != null ? sqlTypeLabel(state.mainSqlType) : '--'" :active="state.mainSqlType>0" color-active="#10b981" :clickable="true" :busy="sqlTypeBusy" @toggle="cycleSqlType('0', state.mainSqlType)" />
            <StatusBadge label="CTCSS" :value="state.mainCtcssTone != null ? (CTCSS_TONES[state.mainCtcssTone]?.toFixed(1) + ' Hz') : '--'" :clickable="true" :active="ctcssPopupVfo === '0'" @toggle="openCtcssPopup('0')" />
            <StatusBadge label="DCS" :value="state.mainDcsCode != null ? ('D' + String(DCS_CODES[state.mainDcsCode]).padStart(3, '0')) : '--'" :clickable="true" :active="dcsPopupVfo === '0'" @toggle="openDcsPopup('0')" />
            <StatusBadge label="SAVE CH" value="ADD" color-active="#f97316" :clickable="state.mainFreq !== null" @toggle="openChannelSaveModal('0')" />
          </section>
        </div>

      </section>

      <!-- ── Status Grid ── -->
      <section class="status-section">
        <StatusBadge label="RX MODE" :value="state.rxMode?.toUpperCase() ?? '--'" :active="state.rxMode === 'dual'" color-active="#10b981" :clickable="state.rxMode !== null" :busy="rxModeBusy" @toggle="toggleRxMode" />
        <StatusBadge label="SPLIT" :value="state.split ? 'ON' : 'OFF'" :active="!!state.split" :clickable="true" :busy="splitBusy" @toggle="toggleSplit" />
        <StatusBadge label="MOX" :value="state.mox ? 'ON' : 'OFF'" :active="!!state.mox" color-active="#ef4444" :clickable="true" :busy="moxBusy" @toggle="toggleMox" />
        <StatusBadge label="LOCK" :value="state.lock != null ? (state.lock ? 'ON' : 'OFF') : '--'" :active="state.lock === true" color-active="#f59e0b" :clickable="state.lock !== null" :busy="lockBusy" @toggle="toggleLock" />
        <div class="dnr-wrap" :class="{ 'dnr-wrap--active': state.powerLevel != null }" @wheel.prevent="onPwrWheel">
          <StatusBadge label="PWR" :value="state.powerLevel != null ? state.powerLevel + ' W' : '--'" />
        </div>
        <StatusBadge label="SWAP" :value="'<->'" :active="false" :clickable="true" :busy="splitBusy" @toggle="toggleSwap"  />
        <StatusBadge label="TUNER" :value="state.radioInfo?.tuning ? 'TUNING' : 'IDLE'" :active="!!state.radioInfo?.tuning" />
        <StatusBadge label="SQL/RF" :value="state.sqlRfMode != null ? (['RF','SQL','SQL FM'][state.sqlRfMode] ?? '--') : '--'" :clickable="true" @toggle="toggleRfSql" />
        <div class="dnr-wrap" :class="{ 'dnr-wrap--active': state.micGain != null }" @wheel.prevent="onMicGainWheel">
          <StatusBadge label="MIC GAIN" :value="state.micGain != null ? String(state.micGain) : '--'" />
        </div>
        <div class="dnr-wrap" :class="{ 'dnr-wrap--active': state.amcLevel != null }" @wheel.prevent="onAmcWheel">
          <StatusBadge label="AMC" :value="state.amcLevel != null ? String(state.amcLevel) : '--'" />
        </div>
        <StatusBadge label="MIC EQ" :value="speechProcLabel" :active="state.speechProc === true" color-active="#10b981" :clickable="state.speechProc !== null" :busy="speechProcBusy" @toggle="toggleSpeechProc" />
        <div class="dnr-wrap" :class="{ 'dnr-wrap--active': state.speechProcLevel != null }" @wheel.prevent="onProcLevelWheel">
          <StatusBadge label="PROC LEVEL" :value="state.speechProcLevel != null ? (state.speechProcLevel === 0 ? 'OFF' : String(state.speechProcLevel)) : '--'" />
        </div>
        <StatusBadge label="VOX" :value="state.vox != null ? (state.vox ? 'ON' : 'OFF') : '--'" :active="state.vox === true" color-active="#10b981" :clickable="state.vox !== null" :busy="voxBusy" @toggle="toggleVox" />
        <div class="dnr-wrap" :class="{ 'dnr-wrap--active': state.voxGain != null }" @wheel.prevent="onVoxGainWheel">
          <StatusBadge label="VOX GAIN" :value="state.voxGain != null ? String(state.voxGain) : '--'" />
        </div>
        <StatusBadge label="ATT" :value="state.rfAttenuator ? 'ON' : 'OFF'" :active="!!state.rfAttenuator" color-active="#f59e0b" :clickable="attClickable" :busy="attBusy" @toggle="toggleAtt" />
        <StatusBadge label="AMP HF/50MHz" :value="state.preAmpHf != null ? (['IPO','AMP1','AMP2'][state.preAmpHf] ?? '--') : '--'" :active="state.preAmpHf != null && state.preAmpHf > 0" color-active="#10b981" :clickable="state.preAmpHf !== null" :busy="preAmpBusy" @toggle="togglePreAmpHf" />
        <StatusBadge label="AMP VHF" :value="state.preAmpVhf != null ? (state.preAmpVhf ? 'ON' : 'OFF') : '--'" :active="state.preAmpVhf === true" color-active="#10b981" :clickable="state.preAmpVhf !== null" :busy="preAmpBusy" @toggle="togglePreAmpVhf" />
        <StatusBadge label="AMP UHF" :value="state.preAmpUhf != null ? (state.preAmpUhf ? 'ON' : 'OFF') : '--'" :active="state.preAmpUhf === true" color-active="#10b981" :clickable="state.preAmpUhf !== null" :busy="preAmpBusy" @toggle="togglePreAmpUhf" />
        <StatusBadge v-if="state.firmware?.spa1 !== null" label="HF ANT" :value="false ? 'ANT2' : 'ANT1'" :active="state.antSelect === 0" color-active="#a78bfa" :clickable="state.antSelect !== null" :busy="antSelectBusy" @toggle="toggleAntSelect1" />
        <StatusBadge v-if="state.firmware?.spa1 !== null" label="HF ANT" :value="true ? 'ANT2' : 'ANT1'" :active="state.antSelect === 1" color-active="#a78bfa" :clickable="state.antSelect !== null" :busy="antSelectBusy" @toggle="toggleAntSelect2" />
      </section>

      <!-- ── Bottom panels row ── -->
      <div class="bottom-panels">

        <!-- Scope panel -->
        <section class="scope-panel">
          <span class="scope-title">Band Scope {{ state.scopeSide === null ? '-' : state.scopeSide ? 'SUB' : 'MAIN' }}</span>

          <!-- LEVEL bar (bipolar: -30…+30, step 0.5) -->
          <div class="scope-level-row">
            <span class="scope-level-lbl">LEVEL</span>
            <div class="scope-level-track" @click="onScopeLevelClick">
              <div class="scope-level-center" />
              <div
                class="scope-level-fill"
                :style="scopeLevelFillStyle"
              />
            </div>
            <span class="scope-level-val">{{ scopeLevelDisplay }}</span>
          </div>

          <!-- SPAN + SPEED controls -->
          <div class="scope-controls">
            <div class="scope-btn-group">
              <span class="scope-group-lbl">SPAN</span>
              <button
                v-for="s in SCOPE_SPANS" :key="s.value"
                class="btn btn-xs scope-btn"
                :class="{ 'scope-btn--active': state.scope?.span === s.value }"
                @click="setScopeSpan(s.value)"
              >{{ s.label }}</button>
            </div>

            <div class="scope-sep" />

            <div class="scope-btn-group">
              <span class="scope-group-lbl">SPEED</span>
              <button
                v-for="s in SCOPE_SPEEDS" :key="s.value"
                class="btn btn-xs scope-btn"
                :class="{ 'scope-btn--active': state.scope?.speed === s.value }"
                @click="setScopeSpeed(s.value)"
              >{{ s.label }}</button>
            </div>
          </div>

          <div class="scope-controls">
            <div class="scope-btn-group">
              <span class="scope-group-lbl">MODE</span>
              <button
                v-for="m in SCOPE_MODES" :key="m.value"
                class="btn btn-xs scope-btn"
                :class="{ 'scope-btn--active': state.scope?.mode === m.value }"
                @click="setScopeMode(m.value)"
              >{{ m.label }}</button>
            </div>

            <div class="scope-sep" />

            <button
              class="btn btn-xs scope-btn scope-color-btn"
              @click="cycleScopeColor"
            >
              <span>{{ scopeColorLabel }}</span>
            </button>

            <div class="scope-sep" />

            <button
              class="btn btn-xs scope-btn scope-color-btn"
              :class="{ 'scope-btn--active': state.scope?.marker === true }"
              @click="toggleScopeMarker"
            >
              <span>MARKER {{ state.scope?.marker == null ? '--' : state.scope.marker ? 'ON' : 'OFF' }}</span>
            </button>
          </div>
        </section>

        <!-- rigctld relay terminal panel — pops up automatically when a TCP
             client (WSJT-X, Fldigi, JS8Call, Gpredict, …) connects to port
             4532. See `rigctld-relay.mjs` + `serial-server.mjs`.
             Default height tracks the Band Scope panel; the bottom edge
             is draggable to override (double-click to revert). -->
        <section
          v-if="rigctldOpen"
          class="rigctld-panel"
          :style="rigctldPanelHeight ? { height: rigctldPanelHeight + 'px' } : undefined"
        >
          <div class="rigctld-header">
            <span class="scope-title">rigctld&nbsp;:4532</span>
            <span
              class="rigctld-status"
              :class="{ 'rigctld-status--on': rigctldClients.size > 0 }"
              :title="rigctldHeaderTitle"
            >
              <span class="rigctld-dot" />
              <span class="rigctld-status-text">{{ rigctldHeaderLabel }}</span>
              <span v-if="rigctldClients.size > 1" class="rigctld-count">({{ rigctldClients.size }})</span>
            </span>
            <span class="rigctld-spacer" />
            <button
              class="btn btn-ghost btn-icon rigctld-icon-btn"
              :title="rigctldAutoScroll ? 'Auto-scroll: ON' : 'Auto-scroll: OFF (scroll to bottom to re-enable)'"
              @click="rigctldAutoScroll = !rigctldAutoScroll"
            >{{ rigctldAutoScroll ? '↧' : '↥' }}</button>
            <button
              class="btn btn-ghost btn-icon rigctld-icon-btn"
              title="Clear log"
              @click="clearRigctldLog"
            >⌫</button>
            <button
              class="btn btn-ghost btn-icon rigctld-icon-btn"
              title="Close panel"
              @click="closeRigctldPanel"
            >×</button>
          </div>
          <div
            class="rigctld-body"
            ref="rigctldBodyEl"
            @scroll.passive="onRigctldScroll"
          >
            <div
              v-for="entry in rigctldLog"
              :key="entry.id"
              class="rigctld-line"
              :class="{
                'rigctld-line--in':         entry.kind === 'line' && entry.dir === 'in',
                'rigctld-line--out':        entry.kind === 'line' && entry.dir === 'out',
                'rigctld-line--connect':    entry.kind === 'connect',
                'rigctld-line--disconnect': entry.kind === 'disconnect',
              }"
            >
              <span class="rigctld-ts">{{ fmtRigctldTime(entry.ts) }}</span>
              <span class="rigctld-arrow" v-if="entry.kind === 'line'">
                {{ entry.dir === 'in' ? '«' : '»' }}
              </span>
              <span class="rigctld-arrow" v-else>
                {{ entry.kind === 'connect' ? '+' : '−' }}
              </span>
              <span class="rigctld-text">
                <template v-if="entry.kind === 'connect'">client connected: {{ entry.remote }}</template>
                <template v-else-if="entry.kind === 'disconnect'">client disconnected: {{ entry.remote }}</template>
                <template v-else>{{ entry.text }}</template>
              </span>
            </div>
            <div v-if="rigctldLog.length === 0" class="rigctld-empty">
              Waiting for traffic…
            </div>
          </div>
          <!-- Resize handle: drag to set custom height (persisted to
               localStorage); double-click to revert to "follow scope". -->
          <div
            class="rigctld-resize"
            :title="rigctldUserHeight === null
              ? 'Drag to resize · double-click does nothing (auto-tracking the Band Scope panel)'
              : 'Drag to resize · double-click to revert to Band Scope height'"
            @pointerdown="onRigctldResizeStart"
            @dblclick="onRigctldResizeReset"
          >
            <span class="rigctld-resize-grip" />
          </div>
        </section>

        <!-- Saved channels panel -->
        <section class="channels-panel">
          <div class="channels-header">
            <span class="scope-title">Saved Channels</span>
            <span class="channels-count" v-if="savedChannels.length > 0">{{ savedChannels.length }}</span>
          </div>
          <div class="channels-list" v-if="savedChannels.length > 0">
            <div
              v-for="ch in sortedChannels"
              :key="ch.id"
              class="ch-badge"
              :data-ch-id="ch.id"
              :title="channelTooltip(ch)"
              @click="applyChannel(ch)"
            >
              <div class="ch-main">
                <input
                  class="ch-label-input"
                  :value="channelLabelDisplay(ch)"
                  type="text"
                  maxlength="32"
                  spellcheck="false"
                  placeholder="Channel label"
                  aria-label="Channel label"
                  @click.stop
                  @mousedown.stop
                  @focus="seedChannelLabelDraft(ch)"
                  @input="onChannelLabelInput(ch.id, ($event.target as HTMLInputElement).value)"
                  @blur="onChannelLabelCommit(ch.id)"
                  @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                  @keydown.esc.prevent="onChannelLabelCancel(ch.id); ($event.target as HTMLInputElement).blur()"
                />
                <div class="ch-meta">
                  <span class="ch-vfo" :class="`ch-vfo--${ch.vfo === '1' ? 'sub' : 'main'}`">
                    {{ ch.vfo === '1' ? 'SUB' : 'MAIN' }}
                  </span>
                  <div class="ch-freq-row" @click.stop @mousedown.stop>
                    <input
                      class="ch-freq-input"
                      :value="channelFreqDisplay(ch)"
                      type="text"
                      inputmode="decimal"
                      spellcheck="false"
                      aria-label="Channel frequency MHz"
                      title="Frequency in MHz"
                      @focus="seedChannelFreqDraft(ch)"
                      @input="onChannelFreqInput(ch.id, ($event.target as HTMLInputElement).value)"
                      @blur="onChannelFreqCommit(ch.id)"
                      @keydown.enter.prevent="onChannelFreqCommit(ch.id); ($event.target as HTMLInputElement).blur()"
                      @keydown.esc.prevent="onChannelFreqCancel(ch.id); ($event.target as HTMLInputElement).blur()"
                    />
                    <span class="ch-freq-unit">MHz</span>
                  </div>
                  <span v-if="ch.mode" class="ch-mode">{{ ch.mode }}</span>
                  <span v-if="chSqlLabel(ch)" class="ch-sql">{{ chSqlLabel(ch) }}</span>
                </div>
              </div>
              <button class="ch-del" @click.stop="deleteChannel(ch.id)" title="Remove">×</button>
            </div>
          </div>
          <div v-else class="channels-empty">No saved channels</div>
        </section>

        <!-- Presets panel -->
        <section class="presets-section">
          <div class="presets-header">
            <span class="section-title">Presets</span>
            <span class="presets-hint">Edit <code>cat-presets.json</code> to customize</span>
            <button
              class="btn btn-ghost btn-icon presets-manage-btn"
              @click="openPresetBuilder"
              title="Open Preset Manager"
              aria-label="Open Preset Manager"
            >◈</button>
          </div>
          <div v-if="presets.length > 0" class="presets-grid">
            <PresetButton
              v-for="preset in presets"
              :key="preset.id"
              :preset="preset"
              :connected="state.connected"
              :state="state"
              @executed="onPresetExecuted"
            />
          </div>
          <div v-else class="presets-empty-state">
            No presets yet. Click <strong>◈</strong> above to open the Preset Manager and add one.
          </div>
        </section>

      </div>

      <!-- ── Manual command input ── -->
      <section class="cmd-section">
        <span class="cmd-label">CAT Command:</span>
        <input
          v-model="manualCmd"
          class="cmd-input"
          placeholder="e.g. FA  or  MD01"
          @keydown.enter="sendManualCommand"
          spellcheck="false"
        />
        <button class="btn btn-primary btn-sm" @click="sendManualCommand">Send</button>
        <span class="cmd-response" v-if="manualResponse">→ {{ manualResponse }}</span>
      </section>
    </main>

    <!-- ── Not connected screen ── -->
    <div v-else class="idle-screen">
      <div class="idle-icon">📡</div>
      <p>Select a serial port and click <strong>Connect</strong> to start.</p>
      <p class="idle-hint">
        On macOS, FTX-1 appears as <code>/dev/cu.SLAB_USBtoUART</code> or similar.<br>
        Default baud rate: <strong>38400</strong> for CAT-1 and <strong>4800</strong> for CAT-2.
      </p>
    </div>

    <footer class="footer">
      <span>Yaesu FTX-1 · <span v-if="state.firmware.display">Display: {{ state.firmware.display }} · </span>
        <span v-if="state.firmware?.main">Main: {{ state.firmware.main }} · </span>
        <span v-if="state.firmware?.dsp">Dsp: {{ state.firmware.dsp }} · </span>
        <span v-if="state.firmware?.sdr">Sdr: {{ state.firmware.sdr }} · </span>
        <span v-if="state.firmware?.spa1">Opt: {{ state.firmware.spa1 }} · </span>
        <span v-if="state.firmware?.fc80">Fc80: {{ state.firmware.fc80 }} · </span> Last update: {{ lastUpdateTime }}</span>
    </footer>

    <!-- ── CTCSS tone picker modal (teleported to body) ── -->
    <Teleport to="body">
      <div
        v-if="ctcssPopupVfo !== null"
        class="tone-modal-backdrop"
        @click.self="closeCtcssPopup"
      >
        <div
          ref="ctcssDialogRef"
          class="tone-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="'CTCSS Tone — ' + (ctcssPopupVfo === '0' ? 'MAIN' : 'SUB')"
        >
          <div class="tone-modal-header">
            <span class="tone-modal-title">CTCSS Tone — {{ ctcssPopupVfo === '0' ? 'MAIN' : 'SUB' }}</span>
            <button class="tone-modal-close" @click="closeCtcssPopup" aria-label="Close">✕</button>
          </div>
          <div class="ctcss-tone-grid">
            <button
              v-for="(hz, idx) in CTCSS_TONES"
              :key="idx"
              class="ctcss-tone-btn"
              :class="{ 'ctcss-tone-btn--active': (ctcssPopupVfo === '0' ? state.mainCtcssTone : state.subCtcssTone) === idx }"
              @click="selectCtcssTone(ctcssPopupVfo, idx)"
            >{{ hz.toFixed(1) }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── DCS code picker modal (teleported to body) ── -->
    <Teleport to="body">
      <div
        v-if="dcsPopupVfo !== null"
        class="tone-modal-backdrop"
        @click.self="closeDcsPopup"
      >
        <div
          ref="dcsDialogRef"
          class="tone-modal tone-modal--dcs"
          role="dialog"
          aria-modal="true"
          :aria-label="'DCS Code — ' + (dcsPopupVfo === '0' ? 'MAIN' : 'SUB')"
        >
          <div class="tone-modal-header">
            <span class="tone-modal-title">DCS Code — {{ dcsPopupVfo === '0' ? 'MAIN' : 'SUB' }}</span>
            <button class="tone-modal-close" @click="closeDcsPopup" aria-label="Close">✕</button>
          </div>
          <div class="dcs-code-grid">
            <button
              v-for="(code, idx) in DCS_CODES"
              :key="idx"
              class="ctcss-tone-btn"
              :class="{ 'ctcss-tone-btn--active': (dcsPopupVfo === '0' ? state.mainDcsCode : state.subDcsCode) === idx }"
              @click="selectDcsCode(dcsPopupVfo, idx)"
            >D{{ String(code).padStart(3, '0') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Mode picker modal (teleported to body) ── -->
    <Teleport to="body">
      <div
        v-if="modePopupVfo !== null"
        class="tone-modal-backdrop"
        @click.self="closeModePopup"
      >
        <div
          ref="modeDialogRef"
          class="tone-modal mode-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="'Mode — ' + (modePopupVfo === '0' ? 'MAIN' : 'SUB')"
        >
          <div class="tone-modal-header">
            <span class="tone-modal-title">Mode — {{ modePopupVfo === '0' ? 'MAIN' : 'SUB' }}</span>
            <button class="tone-modal-close" @click="closeModePopup" aria-label="Close">✕</button>
          </div>
          <div class="mode-btn-grid">
            <button
              v-for="m in MODES"
              :key="m.code"
              class="mode-modal-btn"
              :style="modeBadgeStyle(m.label)"
              :class="{ 'mode-modal-btn--active': (modePopupVfo === '0' ? state.mainMode : state.subMode) === m.label }"
              @click="selectModeFromPopup(modePopupVfo, m.label)"
            >{{ m.label }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Save channel modal (teleported to body) ── -->
    <Teleport to="body">
      <div
        v-if="showChannelSaveModal"
        class="tone-modal-backdrop"
        @click.self="closeChannelSaveModal"
      >
        <div
          ref="channelSaveDialogRef"
          class="tone-modal channel-save-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Save channel"
        >
          <div class="tone-modal-header">
            <span class="tone-modal-title">Save Channel</span>
            <button class="tone-modal-close" @click="closeChannelSaveModal" aria-label="Close">✕</button>
          </div>
          <div class="channel-save-form">
            <div class="channel-save-row channel-save-row--vfo">
              <span class="channel-save-lbl">VFO</span>
              <div class="channel-vfo-toggle" role="group" aria-label="VFO to save">
                <button
                  type="button"
                  class="channel-vfo-toggle-btn"
                  :class="{ 'channel-vfo-toggle-btn--active': channelSaveDraft.vfo === '0' }"
                  :disabled="state.mainFreq == null"
                  title="Save from MAIN VFO"
                  @click="setChannelSaveVfo('0')"
                >MAIN</button>
                <button
                  type="button"
                  class="channel-vfo-toggle-btn"
                  :class="{ 'channel-vfo-toggle-btn--active': channelSaveDraft.vfo === '1' }"
                  :disabled="state.subFreq == null"
                  title="Save from SUB VFO"
                  @click="setChannelSaveVfo('1')"
                >SUB</button>
              </div>
            </div>
            <label class="channel-save-row">
              <span class="channel-save-lbl">Label</span>
              <input
                ref="channelSaveLabelRef"
                v-model="channelSaveDraft.label"
                type="text"
                class="channel-save-input"
                maxlength="32"
                spellcheck="false"
                placeholder="e.g. 40m USB"
                @keydown.enter.prevent="channelSaveFreqRef?.focus()"
              />
            </label>
            <label class="channel-save-row">
              <span class="channel-save-lbl">Frequency</span>
              <div class="channel-save-freq-wrap">
                <input
                  ref="channelSaveFreqRef"
                  v-model="channelSaveDraft.freqMhz"
                  type="text"
                  inputmode="decimal"
                  class="channel-save-input channel-save-input--freq"
                  spellcheck="false"
                  placeholder="7.100"
                  @keydown.enter.prevent="confirmChannelSave()"
                />
                <span class="channel-save-unit">MHz</span>
              </div>
            </label>
            <p v-if="channelSaveMeta" class="channel-save-meta">{{ channelSaveMeta }}</p>
            <p v-if="channelSaveError" class="channel-save-error">{{ channelSaveError }}</p>
            <div class="channel-save-actions">
              <button type="button" class="btn btn-ghost btn-sm" @click="closeChannelSaveModal">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" @click="confirmChannelSave">Save</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Band picker modal (teleported to body) ── -->
    <Teleport to="body">
      <div
        v-if="bandPopupVfo !== null"
        class="tone-modal-backdrop"
        @click.self="closeBandPopup"
      >
        <div
          ref="bandDialogRef"
          class="tone-modal band-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="'Band — ' + (bandPopupVfo === '0' ? 'MAIN' : 'SUB')"
        >
          <div class="tone-modal-header">
            <span class="tone-modal-title">Band — {{ bandPopupVfo === '0' ? 'MAIN' : 'SUB' }}</span>
            <button class="tone-modal-close" @click="closeBandPopup" aria-label="Close">✕</button>
          </div>
          <div class="band-btn-grid">
            <button
              v-for="b in BANDS"
              :key="b.code"
              class="band-modal-btn"
              :class="{ 'band-modal-btn--active': (bandPopupVfo === '0' ? mainBandCode : subBandCode) === b.code }"
              :title="b.meter ? `${b.meter} — ${b.label}` : b.label"
              @click="selectBandFromPopup(bandPopupVfo, b.code)"
            >
              <span v-if="b.meter" class="band-modal-meter">{{ b.meter }}</span>
              <span class="band-modal-freq" :class="{ 'band-modal-freq--solo': !b.meter }">{{ b.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import SMeter from '~/components/SMeter.vue'
import LevelBar from '~/components/LevelBar.vue'
import StatusBadge from '~/components/StatusBadge.vue'
import PresetButton from '~/components/PresetButton.vue'
import MacroBuilder from '~/components/MacroBuilder.vue'
import PresetBuilder from '~/components/PresetBuilder.vue'
import type { PresetCommandEntry } from '~/components/preset-command-utils'

// Single source of truth for the version label shown in the header.
// Bumped in nuxt.config.ts under runtimeConfig.public.appVersion (or via
// the NUXT_PUBLIC_APP_VERSION env var at launch time).
const appVersion = useRuntimeConfig().public.appVersion as string

// ----------- state -----------

interface PortInfo {
  path: string
  manufacturer?: string
}

interface RadioInfo {
  hiSwr: boolean
  recording: boolean
  playing: boolean
  tx: boolean
  txInhibit: boolean
  tuning: boolean
  scanning: boolean
  squelchOpen: boolean
}

interface TransceiverState {
  connected: boolean
  port: string | null
  baudRate: number
  autoInfo: boolean
  mainFreq: number | null
  subFreq: number | null
  mainMode: string | null
  subMode: string | null
  mainSmeter: number | null
  subSmeter: number | null
  txState: boolean
  mox: boolean
  split: boolean
  lock: boolean | null
  breakIn: boolean | null    // BI — Break-In on/off (parsed by serial-server)
  txWatch: boolean | null    // TS — TXW / TX Watch on/off (parsed by serial-server)
  agcMain: string | null
  rfGainMain: number | null
  afGainMain: number | null
  sqMain: number | null
  agcSub: string | null
  rfGainSub: string | null
  afGainSub: number | null
  sqSub: number | null
  sqlRfMode: number | null
  powerLevel: number | null
  radioInfo: RadioInfo | null
  amcLevel: number | null
  micGain: number | null
  speechProc: boolean | null
  speechProcLevel: number | null
  funcKnob: string | null
  vox: boolean | null
  voxGain: number | null
  txVfo: 0 | 1 | null
  rxMode: 'dual' | 'single' | null
  mainSqlType: number | null
  subSqlType: number | null
  mainCtcssTone: number | null
  subCtcssTone: number | null
  mainDcsCode: number | null
  subDcsCode: number | null
  dnrMain: string | null
  dnrSub: string | null
  mainBandwidth: number | null
  subBandwidth: number | null
  mainShift: number | null
  subShift: number | null
  narrowMain: boolean | null
  narrowSub: boolean | null
  rfAttenuator: boolean
  preAmpHf: number | null
  preAmpVhf: boolean | null
  preAmpUhf: boolean | null
  scopeSide: boolean | null
  scope: { mode: number | null, span: number | null, speed: number | null, level: number | null, att: number | null, color: number | null, marker: boolean | null } | null
  firmware: { main: string | null, display: string | null, sdr: string | null, dsp: string | null, spa1: string | null, fc80: string | null } | null,
  antSelect: number | null
  lastUpdate: number
  error: string | null
}

const defaultState = (): TransceiverState => ({
  connected: false,
  port: null,
  baudRate: 38400,
  autoInfo: false,
  mainFreq: null,
  subFreq: null,
  mainMode: null,
  subMode: null,
  mainSmeter: null,
  subSmeter: null,
  txState: false,
  mox: false,
  split: false,
  lock: null,
  breakIn: null,
  txWatch: null,
  agcMain: null,
  rfGainMain: null,
  afGainMain: null,
  sqMain: null,
  agcSub: null,
  rfGainSub: null,
  afGainSub: null,
  sqSub: null,
  sqlRfMode: null,
  powerLevel: null,
  radioInfo: null,
  amcLevel: null,
  micGain: null,
  speechProc: null,
  speechProcLevel: null,
  funcKnob: null,
  vox: null,
  voxGain: null,
  txVfo: null,
  rxMode: null,
  mainSqlType: null, subSqlType: null,
  mainCtcssTone: null, subCtcssTone: null,
  mainDcsCode: null, subDcsCode: null,
  dnrMain: null,
  dnrSub: null,
  mainBandwidth: null,
  subBandwidth: null,
  mainShift: null,
  subShift: null,
  narrowMain: null,
  narrowSub: null,
  rfAttenuator: false,
  preAmpHf: null,
  preAmpVhf: null,
  preAmpUhf: null,
  scopeSide: null,
  scope: null,
  firmware: { main: null, display: null, sdr: null, dsp: null, spa1: null, fc80: null },
  antSelect: null,
  lastUpdate: Date.now(),
  error: null,
})

interface ChannelConfig {
  id: string
  label: string
  /** VFO this channel was saved from / applies to: 0 = MAIN, 1 = SUB. */
  vfo: '0' | '1'
  freq: number
  mode: string | null
  sqlType: number | null
  ctcssIdx: number | null
  dcsIdx: number | null
}

interface Preset {
  id: string
  label: string
  color?: string
  icon?: string
  description?: string
  commands: PresetCommandEntry[]
  /**
   * If true, the on-screen PresetButton renders as a toggle switch
   * (green/red LED + read-then-inverse-send behaviour). The single
   * command must be a binary 0/1 CAT command. See PresetBuilder for
   * the configuration UI and `isBinaryToggleCommand` for the
   * eligibility rule.
   */
  toggle?: boolean
  /**
   * Cosmetic only. When true (and `toggle` is also true), the button
   * is drawn as a bat-handle switch on a dark panel instead of the
   * flat button + small LED. Missing/false ⇒ standard look.
   */
  toggleSwitch?: boolean
}

interface CommandResult {
  command: string
  response?: string
  error?: string
  ok: boolean
}

const state = ref<TransceiverState>(defaultState())
const ports = ref<PortInfo[]>([])
const selectedPort = ref('')
const selectedBaud = ref(38400)
const connecting = ref(false)
const lastError = ref<string | null>(null)
const manualCmd = ref('')
const manualResponse = ref('')
const presets = ref<Preset[]>([])
const funcKnobBusy = ref(false)
const speechProcBusy = ref(false)
const voxBusy = ref(false)
const preAmpBusy    = ref(false)
const antSelectBusy = ref(false)
const rxModeBusy = ref(false)
const splitBusy = ref(false)
const savedChannels = ref<ChannelConfig[]>([])

/** Legacy macro UI — superseded by JSON presets + optional step timing. */
const SHOW_MACRO_UI = false

// ── User settings (DB-backed) ──────────────────────────────────────────
const userSettings = ref({
  call_sign: '',
  color_primary: '#ff9000',
  color_accent: '#0a84ff',
  color_bg: '#0d1117',
  font_mono: 'Courier New',
  radius_px: 8,
  preset_timing_enabled: false,
  preset_default_delay_ms: 100,
})
const showPresetBuilder = ref(false)
const builderTargetPresetId = ref<string | null>(null)

// ── Appearance / theme settings ─────────────────────────────────────────
// Default values match the `:root` block at the top of the <style> section.
// Keeping them duplicated here (rather than reading the computed style)
// lets `resetTheme()` work even after `setProperty` has been called.
const THEME_DEFAULTS: Record<string, string> = {
  '--bg':            '#0d1117',
  '--surface':       '#161b22',
  '--surface2':      '#21262d',
  '--border':        '#505152',
  '--text':          '#e6edf3',
  '--text-muted':    '#8b949e',
  '--accent':        '#58a6ff',
  '--green':         '#3fb950',
  '--red':           '#f85149',
  '--yellow':        '#d29922',
  '--vfo-card-main': '#161b22',
  '--vfo-card-sub':  '#161b22',
  '--radius':        '8px',
  '--font-mono':     "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
  '--font-vfo':      "'AutopromPro Black Rounded', var(--font-mono)",
}

const COLOR_VARS = [
  '--bg', '--surface', '--surface2', '--border',
  '--text', '--text-muted',
  '--accent', '--green', '--red', '--yellow',
  '--vfo-card-main', '--vfo-card-sub',
] as const

const FONT_OPTIONS = [
  { value: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace", label: 'SF Mono / Fira Code (default)' },
  { value: "'Cascadia Code', monospace",                          label: 'Cascadia Code' },
  { value: "'Fira Code', monospace",                              label: 'Fira Code' },
  { value: "'JetBrains Mono', monospace",                         label: 'JetBrains Mono' },
  { value: "Consolas, monospace",                                 label: 'Consolas' },
  { value: "'Courier New', monospace",                            label: 'Courier New' },
  { value: "monospace",                                           label: 'System default' },
]

/** MAIN/SUB MHz readout only — default matches Yaesu FTX-1-style AutopromPro. */
const VFO_FONT_OPTIONS = [
  { value: "'AutopromPro Black Rounded', var(--font-mono)", label: 'AutopromPro Black Rounded (Yaesu style)' },
  { value: 'var(--font-mono)',                                  label: 'Same as UI monospace (--font-mono)' },
  ...FONT_OPTIONS.map((f) => ({
    value: f.value,
    label: f.label.replace(' (default)', ''),
  })),
]

const THEME_STORAGE_KEY = 'cat_theme'
const showSettings = ref(false)
const themeOverrides = ref<Record<string, string>>({})
/** In-progress hex typed in settings (controlled inputs revert without this). */
const hexDraft = ref<Record<string, string>>({})

function themeValue(key: string): string {
  return themeOverrides.value[key] ?? THEME_DEFAULTS[key] ?? ''
}

function hexInputDisplay(key: string): string {
  return hexDraft.value[key] ?? themeValue(key)
}

function onHexDraftInput(key: string, raw: string): void {
  hexDraft.value = { ...hexDraft.value, [key]: raw }
}

function onHexDraftCancel(key: string): void {
  const next = { ...hexDraft.value }
  delete next[key]
  hexDraft.value = next
}

function normalizeHexColor(raw: string): string | null {
  let v = String(raw ?? '').trim()
  if (/^[0-9a-fA-F]{6}$/.test(v)) v = `#${v}`
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null
  return v.toLowerCase()
}

function onHexDraftCommit(key: string): void {
  const draft = hexDraft.value[key]
  onHexDraftCancel(key)
  if (draft == null) return
  const normalized = normalizeHexColor(draft)
  if (normalized) setThemeVar(key, normalized)
}

function onColorPickerInput(key: string, value: string): void {
  onHexDraftCancel(key)
  setThemeVar(key, value)
}

const themeRadiusPx = computed(() => {
  const v = themeValue('--radius')
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 8
})

function setThemeVar(key: string, raw: string): void {
  let value = String(raw ?? '').trim()
  if (!value) return
  if ((COLOR_VARS as readonly string[]).includes(key)) {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return // ignore invalid hex
    value = value.toLowerCase()
  }
  if (value === THEME_DEFAULTS[key]) {
    delete themeOverrides.value[key]
  } else {
    themeOverrides.value[key] = value
  }
  applyTheme()
  persistTheme()
}

function applyTheme(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const key of Object.keys(THEME_DEFAULTS)) {
    const override = themeOverrides.value[key]
    if (override != null) {
      root.style.setProperty(key, override)
    } else {
      // No override → let the :root rule in <style> govern this variable.
      root.style.removeProperty(key)
    }
  }
}

// Persistence model:
//   - localStorage = fast offline shadow, applies the theme instantly on
//     cold load without waiting for /api/settings.
//   - settings.theme_overrides column = authoritative store that survives
//     a browser-cache / localStorage clear.
// The server PUT is debounced so dragging a colour slider does not spam
// requests.
let themePutTimer: ReturnType<typeof setTimeout> | null = null

function persistTheme(): void {
  // Local mirror (synchronous, offline-safe)
  try {
    if (Object.keys(themeOverrides.value).length === 0) {
      localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeOverrides.value))
    }
  } catch { /* localStorage unavailable */ }

  // Debounced server save (authoritative copy)
  if (themePutTimer) clearTimeout(themePutTimer)
  themePutTimer = setTimeout(() => {
    themePutTimer = null
    // null clears the DB column when no overrides are active, keeping the
    // stored shape consistent with "no customization".
    const payload = Object.keys(themeOverrides.value).length === 0
      ? null
      : { ...themeOverrides.value }
    $fetch('/api/settings', {
      method: 'PUT',
      body: { theme_overrides: payload },
    }).catch((err: any) => {
      console.warn(
        '[persistTheme] /api/settings PUT failed:',
        err?.data?.statusMessage ?? err?.message ?? err,
      )
    })
  }, 400)
}

function resetTheme(): void {
  themeOverrides.value = {}
  applyTheme()
  persistTheme()
}

function loadTheme(): void {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        themeOverrides.value = parsed as Record<string, string>
      }
    }
  } catch { /* localStorage unavailable or invalid */ }
  applyTheme()
}

// ── Macros (Phase 2) ────────────────────────────────────────────────────
interface MacroSummary {
  id: number
  name: string
  description: string | null
  step_count: number
}
interface MacroRunResults {
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

const showMacroBuilder  = ref(false)
const builderTargetId   = ref<number | null>(null)
const macroDropdownOpen = ref(false)
const macroQuickRunEl   = ref<HTMLElement | null>(null)
const quickMacros       = ref<MacroSummary[]>([])
const macroRunBusy      = ref(false)
const macroToast        = ref<{ text: string; kind: 'ok' | 'err' } | null>(null)
let   macroToastTimer: ReturnType<typeof setTimeout> | null = null

async function loadQuickMacros() {
  try {
    const r = await $fetch<{ macros: MacroSummary[] }>('/api/macros')
    quickMacros.value = r.macros
  } catch { /* keep stale list on failure */ }
}

function toggleMacroDropdown() {
  if (macroDropdownOpen.value) {
    closeMacroDropdown()
  } else {
    macroDropdownOpen.value = true
    loadQuickMacros()
  }
}
function closeMacroDropdown() { macroDropdownOpen.value = false }

function onGlobalMousedownForMacroDropdown(e: MouseEvent) {
  if (!macroDropdownOpen.value) return
  const el = macroQuickRunEl.value
  if (el && !el.contains(e.target as Node)) closeMacroDropdown()
}
watch(macroDropdownOpen, (open) => {
  if (open) document.addEventListener('mousedown', onGlobalMousedownForMacroDropdown)
  else      document.removeEventListener('mousedown', onGlobalMousedownForMacroDropdown)
})

function openMacroBuilder(macroId: number | null = null) {
  builderTargetId.value = macroId
  showMacroBuilder.value = true
  closeMacroDropdown()
}
function closeMacroBuilder() {
  showMacroBuilder.value = false
  builderTargetId.value = null
  loadQuickMacros() // refresh dropdown after editing
}
function onMacroSaved() {
  // builder emits 'saved' after every successful save/delete
  loadQuickMacros()
}

function showMacroToast(text: string, kind: 'ok' | 'err' = 'ok') {
  if (macroToastTimer) clearTimeout(macroToastTimer)
  macroToast.value = { text, kind }
  macroToastTimer = setTimeout(() => { macroToast.value = null; macroToastTimer = null }, 4000)
}

async function runMacroById(id: number) {
  const m = quickMacros.value.find((x) => x.id === id)
  const name = m?.name ?? `#${id}`
  macroRunBusy.value = true
  closeMacroDropdown()
  try {
    const r = await $fetch<MacroRunResults>(`/api/macros/${id}/run`, { method: 'POST', body: {} })
    const failed = r.results.filter((s) => !s.ok)
    if (r.ok) {
      showMacroToast(`✓ "${name}" ran (${r.results.length} step${r.results.length === 1 ? '' : 's'})`, 'ok')
    } else {
      const first = failed[0]
      showMacroToast(`✕ "${name}" failed at step ${first ? first.position + 1 : '?'}: ${first?.error ?? 'unknown'}`, 'err')
    }
  } catch (e: any) {
    showMacroToast(`✕ run "${name}": ${e?.data?.statusMessage ?? e?.message ?? 'failed'}`, 'err')
  } finally {
    macroRunBusy.value = false
  }
}

function loadChannelsFromLocalStorage(): ChannelConfig[] {
  try {
    const raw = localStorage.getItem('cat_channels')
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.map((ch: Partial<ChannelConfig> & { freq: number; id?: string }) => normalizeChannel(ch))
  } catch {
    return []
  }
}

let channelPutTimer: ReturnType<typeof setTimeout> | null = null

async function persistChannelsNow(): Promise<void> {
  await $fetch('/api/json-channels', {
    method: 'PUT',
    body: { channels: savedChannels.value },
  })
}

function persistChannels(): void {
  if (channelPutTimer) clearTimeout(channelPutTimer)
  channelPutTimer = setTimeout(() => {
    channelPutTimer = null
    persistChannelsNow().catch((err: any) => {
      console.warn('[persistChannels] PUT failed:', err?.data?.statusMessage ?? err?.message ?? err)
      lastError.value = 'Failed to save channels to cat-channels.json'
    })
  }, 400)
}

async function loadChannels(): Promise<void> {
  try {
    const data = await $fetch<{ channels: ChannelConfig[] }>('/api/json-channels')
    savedChannels.value = Array.isArray(data.channels)
      ? data.channels.map((ch) => normalizeChannel(ch))
      : []

    // One-time migration from browser localStorage (legacy).
    const legacy = loadChannelsFromLocalStorage()
    if (legacy.length > 0 && savedChannels.value.length === 0) {
      savedChannels.value = legacy
      await persistChannelsNow()
    }
    try { localStorage.removeItem('cat_channels') } catch { /* ignore */ }
  } catch (err: any) {
    console.warn('[loadChannels] failed:', err?.data?.statusMessage ?? err?.message ?? err)
    savedChannels.value = loadChannelsFromLocalStorage()
  }
}
const moxBusy = ref(false)
const txVfoBusy = ref(false)
const lockBusy   = ref(false)
const narrowBusy = ref(false)
const agcBusy    = ref(false)
let eventSource: EventSource | null = null

// ── rigctld relay traffic panel ────────────────────────────────────────
// Pop-up terminal panel next to the Band Scope that mirrors the live
// traffic on the rigctld TCP relay (default port 4532). Lines are
// pushed by the serial-server via a named SSE event "rigctld". See
// `rigctld-relay.mjs` + `serial-server.mjs` for the producer side.
type RigctldLogLine = {
  id: number
  ts: number
  kind: 'connect' | 'disconnect' | 'line'
  remote: string
  dir?: 'in' | 'out'   // present only when kind === 'line'
  text?: string        // present only when kind === 'line'
}
const RIGCTLD_LOG_MAX = 300            // ring-buffer cap
const RIGCTLD_MIN_HEIGHT = 140          // px — smallest the user can drag to
const RIGCTLD_HEIGHT_KEY = 'rigctld_panel_height'
let rigctldLineId = 0
const rigctldOpen     = ref(false)     // panel visible right now?
const rigctldClients  = ref<Set<string>>(new Set())
const rigctldLog      = ref<RigctldLogLine[]>([])
const rigctldAutoScroll = ref(true)
const rigctldBodyEl   = ref<HTMLElement | null>(null)

// ── Panel size sync with the Band Scope panel ─────────────────────────
//  - `rigctldPanelHeight` is what we actually apply to the section's
//    inline style.
//  - `rigctldUserHeight`  is the user's drag-locked override. While
//    null, the panel tracks the scope panel via ResizeObserver.
const rigctldPanelHeight = ref<number | null>(null)
const rigctldUserHeight  = ref<number | null>(null)
let rigctldScopeRO: ResizeObserver | null = null

/** Sorted IP-only list (port stripped) of the currently connected rigctld clients. */
const rigctldClientIps = computed(() => {
  const out: string[] = []
  for (const remote of rigctldClients.value) {
    const cut = remote.lastIndexOf(':')
    out.push(cut > 0 ? remote.slice(0, cut) : remote)
  }
  return out.sort()
})

/** Short display string for the panel header. */
const rigctldHeaderLabel = computed(() => {
  const ips = rigctldClientIps.value
  if (ips.length === 0) return 'no clients'
  if (ips.length === 1) return ips[0]
  if (ips.length <= 3)  return ips.join(', ')
  return `${ips.slice(0, 2).join(', ')} +${ips.length - 2}`
})

/** Multi-line tooltip with full remote (ip:port) of every connected client. */
const rigctldHeaderTitle = computed(() => {
  if (rigctldClients.value.size === 0) return 'No clients connected'
  return Array.from(rigctldClients.value).sort().join('\n')
})

function rigctldAppend(line: Omit<RigctldLogLine, 'id'>) {
  const entry: RigctldLogLine = { id: ++rigctldLineId, ...line }
  const buf = rigctldLog.value
  buf.push(entry)
  if (buf.length > RIGCTLD_LOG_MAX) buf.splice(0, buf.length - RIGCTLD_LOG_MAX)
  if (rigctldAutoScroll.value) {
    nextTick(() => {
      const el = rigctldBodyEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
}

function clearRigctldLog() { rigctldLog.value = []; rigctldLineId = 0 }
function closeRigctldPanel() { rigctldOpen.value = false }

// Detect user scroll-up — pause auto-scroll until they reach the
// bottom again. This is the standard "follow tail unless I'm reading
// scrollback" pattern.
function onRigctldScroll() {
  const el = rigctldBodyEl.value
  if (!el) return
  const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 16
  rigctldAutoScroll.value = nearBottom
}

function fmtRigctldTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

// ── Auto-track the scope panel's outer height while the user has not
// dragged the resize handle. Detaches cleanly when the panel closes
// or the component unmounts.
function startRigctldHeightSync() {
  if (rigctldScopeRO) return
  const scopeEl = document.querySelector('.scope-panel') as HTMLElement | null
  if (!scopeEl) return
  const apply = () => {
    if (rigctldUserHeight.value !== null) return   // user drag wins
    rigctldPanelHeight.value = scopeEl.offsetHeight
  }
  rigctldScopeRO = new ResizeObserver(apply)
  rigctldScopeRO.observe(scopeEl)
  apply()
}
function stopRigctldHeightSync() {
  if (!rigctldScopeRO) return
  rigctldScopeRO.disconnect()
  rigctldScopeRO = null
}
watch(rigctldOpen, (open) => {
  if (open) nextTick(() => startRigctldHeightSync())
  else      stopRigctldHeightSync()
})

// Drag the bottom edge to resize. Pointer-events instead of mouse so
// it works equally well with touch. Locks `rigctldUserHeight` once the
// user starts dragging; double-click on the handle reverts to "follow
// scope panel".
function onRigctldResizeStart(e: PointerEvent) {
  e.preventDefault()
  const startY = e.clientY
  const startH = rigctldPanelHeight.value ?? 240
  const onMove = (ev: PointerEvent) => {
    const next = Math.max(RIGCTLD_MIN_HEIGHT, startH + (ev.clientY - startY))
    rigctldUserHeight.value  = next
    rigctldPanelHeight.value = next
  }
  const onEnd = () => {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup',   onEnd)
    document.removeEventListener('pointercancel', onEnd)
    if (rigctldUserHeight.value !== null) {
      try { localStorage.setItem(RIGCTLD_HEIGHT_KEY, String(rigctldUserHeight.value)) }
      catch { /* localStorage may be disabled */ }
    }
  }
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup',   onEnd)
  document.addEventListener('pointercancel', onEnd)
}
function onRigctldResizeReset() {
  rigctldUserHeight.value = null
  try { localStorage.removeItem(RIGCTLD_HEIGHT_KEY) } catch { /* ignore */ }
  // Re-prime the size from the scope panel right now.
  const scopeEl = document.querySelector('.scope-panel') as HTMLElement | null
  if (scopeEl) rigctldPanelHeight.value = scopeEl.offsetHeight
}

// ----------- computed -----------

const lastUpdateTime = computed(() => {
  if (!state.value.connected) return '--'
  const d = new Date(state.value.lastUpdate)
  return d.toLocaleTimeString()
})

const speechProcLabel = computed(() => {
  if (state.value.speechProc === null) return '--'
  return state.value.speechProc ? 'ON' : 'OFF'
})

// ----------- band data -----------

const BANDS = [
  { code: '00', label: '1.8 MHz',   meter: '160m',  freqMin:   1_800_000, freqMax:   2_000_000 },
  { code: '01', label: '3.5 MHz',   meter: '80m',   freqMin:   3_500_000, freqMax:   4_000_000 },
  { code: '02', label: '5 MHz',     meter: '60m',   freqMin:   5_000_000, freqMax:   5_500_000 },
  { code: '03', label: '7 MHz',     meter: '40m',   freqMin:   7_000_000, freqMax:   7_300_000 },
  { code: '04', label: '10 MHz',    meter: '30m',   freqMin:  10_000_000, freqMax:  10_200_000 },
  { code: '05', label: '14 MHz',    meter: '20m',   freqMin:  14_000_000, freqMax:  14_400_000 },
  { code: '06', label: '18 MHz',    meter: '17m',   freqMin:  18_000_000, freqMax:  18_200_000 },
  { code: '07', label: '21 MHz',    meter: '15m',   freqMin:  21_000_000, freqMax:  21_500_000 },
  { code: '08', label: '24.5 MHz',  meter: '12m',   freqMin:  24_500_000, freqMax:  25_000_000 },
  { code: '09', label: '28 MHz',    meter: '10m',   freqMin:  28_000_000, freqMax:  30_000_000 },
  { code: '10', label: '50 MHz',    meter: '6m',    freqMin:  50_000_000, freqMax:  54_000_000 },
  { code: '11', label: '70 MHz/GEN', meter: '4m',   freqMin:  70_000_000, freqMax: 108_000_000 },
  { code: '12', label: 'AIR',       freqMin: 108_000_000, freqMax: 144_000_000 },
  { code: '13', label: '144 MHz',   meter: '2m',    freqMin: 144_000_000, freqMax: 148_000_000 },
  { code: '14', label: '430 MHz',   meter: '70cm',  freqMin: 430_000_000, freqMax: 450_000_000 },
] as const

type BandEntry = (typeof BANDS)[number]

function bandByCode(code: string | null | undefined): BandEntry | undefined {
  if (code == null) return undefined
  return BANDS.find(b => b.code === code)
}

/** Compact label on the VFO band button (meter name when known). */
function bandSelLabel(code: string | null): string {
  const b = bandByCode(code)
  if (!b) return 'band…'
  return b.meter ? b.meter : b.label
}

function freqToBandCode(hz: number | null): string | null {
  if (!hz) return null
  return BANDS.find(b => hz >= b.freqMin && hz < b.freqMax)?.code ?? null
}

const mainBandCode = computed(() => freqToBandCode(state.value.mainFreq))
const subBandCode  = computed(() => freqToBandCode(state.value.subFreq))

const bandBusy = ref(false)
const sqlTypeBusy = ref(false)
const attBusy = ref(false)
const attClickable = computed(() =>
  (state.value.mainFreq != null && state.value.mainFreq < 75000000) ||
  (state.value.subFreq  != null && state.value.subFreq  < 75000000)
)

async function selectBand(vfo: '0' | '1', code: string) {
  if (bandBusy.value || !code) return
  bandBusy.value = true
  try {
    // BS P1 P2 P2 ; — P1=0 main / 1 sub, P2P2=2-digit band code (zero-padded)
    // Do NOT assign state here — BS uses sendCommandNoWait so the returned state
    // is pre-command (stale). The real update arrives via SSE after the transceiver
    // processes the command.
    await $fetch('/api/command', {
      method: 'POST',
      body: { command: `BS${vfo}${code}` },
    })
    if (state.value.firmware?.spa1 === null ) {
      /* do nothing */
    }
    else {
      await $fetch('/api/command', {
        method: 'POST',
        body: { command: `EX030704` },
      })
    }
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    bandBusy.value = false
  }
}

async function sendUp() {
  if (bandBusy.value) return
  bandBusy.value = true
  try {
    await $fetch('/api/command', {
      method: 'POST',
      body: { command: `UP` },
    })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    bandBusy.value = false
  }
}

async function sendDn() {
  if (bandBusy.value) return
  bandBusy.value = true
  try {
    await $fetch('/api/command', {
      method: 'POST',
      body: { command: `DN` },
    })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    bandBusy.value = false
  }
}

// ----------- CTCSS / DCS lookup -----------

/** CTCSS tone frequencies (Hz) indexed 0–49, per FTX-1 Table 1 */
const CTCSS_TONES: readonly number[] = [
   67.0,  69.3,  71.9,  74.4,  77.0,  79.7,  82.5,  85.4,  88.5,  91.5,
   94.8,  97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3,
  131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9,
  171.3, 173.8, 177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5,
  203.5, 206.5, 210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1,
]

/** DCS codes indexed 0–103, per FTX-1 Table 2 */
const DCS_CODES: readonly number[] = [
   23,  25,  26,  31,  32,  36,  43,  47,  51,  53,  54,  65,  71,  72,  73,
   74, 114, 115, 116, 122, 125, 131, 132, 134, 143, 145, 152, 155, 156, 162,
  165, 172, 174, 205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255,
  261, 263, 265, 266, 271, 274, 306, 311, 315, 325, 331, 332, 343, 346, 351,
  356, 364, 365, 371, 411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455,
  462, 464, 465, 466, 503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624,
  627, 631, 632, 654, 662, 664, 703, 712, 723, 731, 732, 734, 743, 754,
]

const SQL_TYPE_LABELS: Record<number, string> = {
  0: 'OFF', 1: 'CTCSS ENC', 2: 'CTCSS SQL', 3: 'DCS', 4: 'PR FREQ', 5: 'REV TONE',
}

const SQL_RFG_MODE_LABELS: Record<number, string> = {
  0: 'RF', 1: 'SQL', 2: 'SQL FM',
}

const SQL_TYPE_COLORS: Record<number, string> = {
  0: '#6b7280',
  1: '#22d3ee', 2: '#22d3ee',   // CTCSS — cyan
  3: '#a78bfa',                  // DCS   — purple
  4: '#f59e0b', 5: '#f59e0b',   // special — amber
}

const FM_MODES = new Set(['FM', 'FM-N', 'DATA-FM', 'DATA-FM-N', 'C4FM-DN', 'C4FM-VW', 'AMS'])

function isFmMode(mode: string | null): boolean {
  return mode != null && FM_MODES.has(mode)
}

const DNR_MODES = new Set(['USB', 'LSB', 'CW-U', 'CW-L', 'AM', 'AM-N', 'DATA-L', 'DATA-U', 'PSK', 'RTTY-L', 'RTTY-U'])

function isDnrMode(mode: string | null): boolean {
  return mode != null && DNR_MODES.has(mode)
}

const DNR_MIN = 0
const DNR_MAX = 10

async function onPwrWheel(event: WheelEvent) {
  if (state.value.powerLevel == null) return
  const next = Math.max(5, Math.min(state.value.firmware?.spa1 === null ? 10 : 100, state.value.powerLevel + (event.deltaY < 0 ? 1 : -1)))
  const typePwr = state.value.firmware?.spa1 === null ? '1' : '2'

  if (next === state.value.powerLevel) return
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `PC${typePwr}${String(next).padStart(3, '0')}` } })
  } catch (e: any) {
    lastError.value = e.message
  }
}

async function onProcLevelWheel(event: WheelEvent) {
  if (state.value.speechProcLevel == null) return
  const next = Math.max(0, Math.min(100, state.value.speechProcLevel + (event.deltaY < 0 ? 1 : -1)))
  if (next === state.value.speechProcLevel) return
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `PL${String(next).padStart(3, '0')}` } })
  } catch (e: any) {
    lastError.value = e.message
  }
}

async function onAmcWheel(event: WheelEvent) {
  if (state.value.amcLevel == null) return
  const next = Math.max(1, Math.min(100, state.value.amcLevel + (event.deltaY < 0 ? 1 : -1)))
  if (next === state.value.amcLevel) return
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `AO${String(next).padStart(3, '0')}` } })
  } catch (e: any) {
    lastError.value = e.message
  }
}

async function onVoxGainWheel(event: WheelEvent) {
  if (state.value.voxGain == null) return
  const next = Math.max(0, Math.min(100, state.value.voxGain + (event.deltaY < 0 ? 1 : -1)))
  if (next === state.value.voxGain) return
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `VG${String(next).padStart(3, '0')}` } })
  } catch (e: any) {
    lastError.value = e.message
  }
}

async function onMicGainWheel(event: WheelEvent) {
  if (state.value.micGain == null) return
  const next = Math.max(0, Math.min(100, state.value.micGain + (event.deltaY < 0 ? 1 : -1)))
  if (next === state.value.micGain) return
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `MG${String(next).padStart(3, '0')}` } })
  } catch (e: any) {
    lastError.value = e.message
  }
}

async function onDnrWheel(vfo: '0' | '1', event: WheelEvent) {
  const mode = vfo === '0' ? state.value.mainMode : state.value.subMode
  if (!isDnrMode(mode)) return
  const raw = vfo === '0' ? state.value.dnrMain : state.value.dnrSub
  const current = (raw == null || raw === 'OFF') ? 0 : Number(raw)
  const next = Math.max(DNR_MIN, Math.min(DNR_MAX, current + (event.deltaY < 0 ? 1 : -1)))
  if (next === current) return
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `RL${vfo}${String(next).padStart(2, '0')}` } })
  } catch (e: any) {
    lastError.value = e.message
  }
}

async function setBandwidth(vfo: '0' | '1', idx: number) {
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `SH${vfo}0${String(idx).padStart(2, '0')}` } })
  } catch (e: any) { lastError.value = e.message }
}

async function setShift(vfo: '0' | '1', val: number) {
  try {
    const sign = val >= 0 ? '+' : '-';
    const abs = Math.abs(val).toFixed(0).padStart(4, '0');
    await $fetch('/api/command', { method: 'POST', body: { command: `IS${vfo}0${sign}${abs}` } })
  } catch (e: any) { lastError.value = e.message }
}

const RF_GAIN_MODES = new Set(['LSB', 'USB', 'CW-U', 'CW-L', 'RTTY-L', 'RTTY-U', 'DATA-L', 'DATA-U', 'PSK'])

function isRfGainMode(mode: string | null): boolean {
  return mode != null && RF_GAIN_MODES.has(mode)
}

// ── Band Scope (SS command) ─────────────────────────────

const SCOPE_SPANS = [
//  { value: 0, label: '-' },
//  { value: 1, label: '-' },
  { value: 2, label: '5k' },
  { value: 3, label: '10k' },
  { value: 4, label: '20k' },
  { value: 5, label: '50k' },
  { value: 6, label: '100k' },
  { value: 7, label: '200k' },
  { value: 8, label: '500k' },
  { value: 9, label: '1M' },
] as const

const SCOPE_SPEEDS = [
  { value: 0, label: 'SLOW1' },
  { value: 1, label: 'SLOW2' },
  { value: 2, label: 'FAST1' },
  { value: 3, label: 'FAST2' },
  { value: 4, label: 'FAST3' },
  { value: 5, label: 'STOP' },
] as const

const SCOPE_MODES = [
  { value: 0, label: '3DSS CTR' },
  { value: 1, label: '3DSS CUR' },
  { value: 2, label: '3DSS FIX' },
  { value: 3, label: 'W/F CTR' },
  { value: 6, label: 'W/F CUR' },
  { value: 9, label: 'W/F FIX' },
] as const

// Level: encoded 0-120 where 60=0.0, step=0.5 dB
const scopeLevelDisplay = computed(() => {
  const l = state.value.scope?.level
  if (l == null) return '--'
  else return l
})

const scopeLevelFillStyle = computed(() => {
  // Radio reports `level` 0..120 (0.5 dB steps → -30..+30 dB; centre = 60).
  // Map to a bipolar [-50%, +50%] fill around the track's 50 % centre line.
  const l = state.value.scope?.level ?? 60
  const center = 50 // %
  let pct = ((l - 60) / 60) * 50 // -50..+50 %
  if (pct >  50) pct =  50
  if (pct < -50) pct = -50
  if (pct >= 0) return { left: center + '%', width: pct + '%', background: 'linear-gradient(90deg,#f59e0b,#fcd34d)' }
  return { left: (center + pct) + '%', width: (-pct) + '%', background: 'linear-gradient(270deg,#f59e0b,#fcd34d)' }
})

function buildScopeLevelCmd(overrides: { level?: number }): string {
  const s = state.value.scope
  const level = overrides.level ?? s?.level ?? 15
  const result = (level * 0.5) - 30;
  const sign = result >= 0 ? '+' : '-';
  const abs = Math.abs(result).toFixed(1).padStart(4, '0');
  const side = state.value.scopeSide === null ? '0' : state.value.scopeSide? '1': '0';
  return `SS${side}4${sign}${abs}`
}

function buildScopeSpanCmd(overrides: { span?: number }): string {
  const s = state.value.scope
  const span = overrides.span ?? s?.span ?? 0
  const side = state.value.scopeSide === null ? '0' : state.value.scopeSide? '1': '0';
  return `SS${side}5${span}0000`
}

function buildScopeSpeedCmd(overrides: { speed?: number }): string {
  const s = state.value.scope
  const speed = overrides.speed ?? s?.speed ?? 0
  const side = state.value.scopeSide === null ? '0' : state.value.scopeSide? '1': '0';
  return `SS${side}0${speed}0000`
}

function onScopeLevelClick(e: MouseEvent) {
  const track = e.currentTarget as HTMLElement
  const rect = track.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const level = Math.round(pct * 120)
  $fetch('/api/command', { method: 'POST', body: { command: buildScopeLevelCmd({ level }) } })
    .catch((e: any) => { lastError.value = e.message })
}

function setScopeSpan(span: number) {
  $fetch('/api/command', { method: 'POST', body: { command: buildScopeSpanCmd({ span }) } })
    .catch((e: any) => { lastError.value = e.message })
}

function setScopeSpeed(speed: number) {
  $fetch('/api/command', { method: 'POST', body: { command: buildScopeSpeedCmd({ speed }) } })
    .catch((e: any) => { lastError.value = e.message })
}

function buildScopeModeCmd(overrides: { mode?: number }): string {
  const s = state.value.scope
  const side = state.value.scopeSide === null ? '0' : state.value.scopeSide? '1': '0';
  const mode = overrides.mode ?? s?.mode ?? 0
  return `SS${side}6${mode}0000`
}

function setScopeMode(mode: number) {
  $fetch('/api/command', { method: 'POST', body: { command: buildScopeModeCmd({ mode }) } })
    .catch((e: any) => { lastError.value = e.message })
}

// COLOR: values 0–10 (0x0–0xA), labels COLOR 1–COLOR 11
const SCOPE_COLOR_MAX = 10

const scopeColorLabel = computed(() => {
  const c = state.value.scope?.color
  return c != null ? `COLOR ${c + 1}` : '--'
})

function cycleScopeColor() {
  const current = state.value.scope?.color ?? 0
  const next = current >= SCOPE_COLOR_MAX ? 0 : current + 1
  const hex = next.toString(16).toUpperCase()   // 0–9, A
  const side = state.value.scopeSide === null ? '0' : state.value.scopeSide? '1': '0';
  $fetch('/api/command', { method: 'POST', body: { command: `SS${side}3${hex}0000` } })
    .catch((e: any) => { lastError.value = e.message })
}

function toggleScopeMarker() {
  //if (state.value.scope?.marker === null) return
  const next = state.value.scope?.marker ? '0' : '1'   // 0=OFF, 1=ON
  const side = state.value.scopeSide === null ? '0' : state.value.scopeSide? '1': '0';
  $fetch('/api/command', { method: 'POST', body: { command: `SS${side}2${next}0000` } })
    .catch((e: any) => { lastError.value = e.message })
}

/** Human-readable SQL type label */
function sqlTypeLabel(type: number | null): string {
  return type != null ? (SQL_TYPE_LABELS[type] ?? String(type)) : '--'
}

/** CSS color for the SQL type badge */
function sqlTypeColor(type: number | null): string {
  return type != null ? (SQL_TYPE_COLORS[type] ?? '#6b7280') : '#6b7280'
}

/**
 * Returns the tone/code string to display next to the SQL type.
 * For CTCSS: "127.3 Hz"; for DCS: "D156"; for type 0 (OFF): null.
 */
function toneDisplay(
  sqlType: number | null,
  ctcssTone: number | null,
  dcsCode: number | null,
): string | null {
  if (sqlType === null || sqlType === 0) return null
  if (sqlType === 3) {
    // DCS
    if (dcsCode === null || dcsCode < 0 || dcsCode >= DCS_CODES.length) return null
    return `D${String(DCS_CODES[dcsCode]).padStart(3, '0')}`
  }
  // CTCSS (types 1, 2, 4, 5) — type 4/5 may also use the stored CTCSS tone
  if (ctcssTone !== null && ctcssTone >= 0 && ctcssTone < CTCSS_TONES.length) {
    return `${CTCSS_TONES[ctcssTone].toFixed(1)} Hz`
  }
  return null
}

// ----------- helpers -----------

function formatFreq(hz: number | null): string {
  if (hz == null) return '---.---.---'
  const mhz = hz / 1_000_000
  // Format as XXX.XXX.XXX
  const [intPart, decPart = ''] = mhz.toFixed(6).split('.')
  const d = decPart.padEnd(6, '0')
  return `${intPart.padStart(3, ' ')}.${d.slice(0, 3)}.${d.slice(3)}`
}

/** Split frequency in Hz into three 3-digit display groups: [MHz, kHz, Hz] */
function freqGroups(hz: number | null): [string, string, string] {
  if (hz == null) return ['---', '---', '---']
  const h = Math.max(0, Math.round(hz))
  const mhz = Math.floor(h / 1_000_000)
  const khz = Math.floor((h % 1_000_000) / 1_000)
  const hz3 = h % 1_000
  return [
    String(mhz).padStart(3, '\u00a0'),  // non-breaking space → right-aligned in monospace
    String(khz).padStart(3, '0'),
    String(hz3).padStart(3, '0'),
  ]
}

const FREQ_STEP_MHZ = 1_000_000
const FREQ_STEP_HZ  = 100
const FREQ_MIN      = 100_000       // 100 kHz
const FREQ_MAX      = 999_999_999   // ~999 MHz

async function onFreqWheel(vfo: '0' | '1', groupIdx: number, event: WheelEvent) {
  const current = vfo === '0' ? state.value.mainFreq : state.value.subFreq
  if (current == null) return
  const direction = event.deltaY < 0 ? 1 : -1
  const mode = vfo === '0' ? state.value.mainMode : state.value.subMode
  const khzStep = mode != null && FM_MODES.has(mode) ? 5_000 : 1_000
  const step = groupIdx === 0 ? FREQ_STEP_MHZ : groupIdx === 1 ? khzStep : FREQ_STEP_HZ
  const newFreq = Math.max(FREQ_MIN, Math.min(FREQ_MAX, current + direction * step))
  if (newFreq === current) return
  const cmd = (vfo === '0' ? 'FA' : 'FB') + String(newFreq).padStart(9, '0')
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  }
}

const MODE_COLORS: Record<string, string> = {
  LSB: '#3b82f6',
  USB: '#8b5cf6',
  'CW-U': '#f59e0b',
  'CW-L': '#f59e0b',
  FM: '#10b981',
  'FM-N': '#10b981',
  AM: '#ef4444',
  'AM-N': '#ef4444',
  'RTTY-L': '#ec4899',
  'RTTY-U': '#ec4899',
  'DATA-L': '#06b6d4',
  'DATA-U': '#06b6d4',
  PSK: '#a78bfa',
  'C4FM-DN': '#34d399',
  'C4FM-VW': '#34d399',
}

function modeBadgeStyle(mode: string | null) {
  const color = mode ? (MODE_COLORS[mode] ?? '#6b7280') : '#6b7280'
  return { background: color }
}

// MD command mode list: { code: CAT hex char, label: mode name }
const MODES = [
  { code: '0', label: 'AMS' },
  { code: '1', label: 'LSB' },
  { code: '2', label: 'USB' },
  { code: '3', label: 'CW-U' },
  { code: '7', label: 'CW-L' },
  { code: '5', label: 'AM' },
  { code: 'D', label: 'AM-N' },
  { code: '4', label: 'FM' },
  { code: 'B', label: 'FM-N' },
  { code: '6', label: 'RTTY-L' },
  { code: '9', label: 'RTTY-U' },
  { code: '8', label: 'DATA-L' },
  { code: 'C', label: 'DATA-U' },
  { code: 'A', label: 'DATA-FM' },
  { code: 'F', label: 'DATA-FM-N' },
  { code: 'E', label: 'PSK' },
  { code: 'H', label: 'C4FM-DN' },
  { code: 'I', label: 'C4FM-VW' },
] as const

const modeBusy = ref(false)

// Modes that carry an implicit Narrow flag (NA=1); all others → NA=0
const NARROW_MODES = new Set(['FM-N', 'AM-N', 'DATA-FM-N'])

async function selectMode(vfo: '0' | '1', label: string) {
  if (modeBusy.value || !label) return
  const entry = MODES.find(m => m.label === label)
  if (!entry) return
  modeBusy.value = true
  try {
    // MD P1 P2 ; — P1=0 main / 1 sub, P2=mode code
    await $fetch('/api/command', { method: 'POST', body: { command: `MD${vfo}${entry.code}` } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    modeBusy.value = false
  }
}

// ── Band picker modal ────────────────────────────────────

const bandPopupVfo  = ref<'0' | '1' | null>(null)
const bandDialogRef = ref<HTMLElement | null>(null)

function openBandPopup(vfo: '0' | '1') {
  bandPopupVfo.value = vfo
  nextTick(() => {
    const dialog = bandDialogRef.value
    if (!dialog) return
    const active = dialog.querySelector<HTMLElement>('.band-modal-btn--active')
    const first  = dialog.querySelector<HTMLElement>('.band-modal-btn')
    ;(active ?? first)?.focus()
  })
}

function closeBandPopup() {
  bandPopupVfo.value = null
}

async function selectBandFromPopup(vfo: '0' | '1', code: string) {
  closeBandPopup()
  await selectBand(vfo, code)
}

// ── Mode picker modal ────────────────────────────────────

const modePopupVfo  = ref<'0' | '1' | null>(null)
const modeDialogRef = ref<HTMLElement | null>(null)

function openModePopup(vfo: '0' | '1') {
  modePopupVfo.value = vfo
  nextTick(() => {
    const dialog = modeDialogRef.value
    if (!dialog) return
    const active = dialog.querySelector<HTMLElement>('.mode-modal-btn--active')
    const first  = dialog.querySelector<HTMLElement>('.mode-modal-btn')
    ;(active ?? first)?.focus()
  })
}

function closeModePopup() {
  modePopupVfo.value = null
}

async function selectModeFromPopup(vfo: '0' | '1', label: string) {
  closeModePopup()
  await selectMode(vfo, label)
}

// ----------- API calls -----------

async function refreshPorts() {
  try {
    const data = await $fetch<{ ports: PortInfo[] }>('/api/ports')
    ports.value = data.ports
    const savedPort = localStorage.getItem('cat_port')
    if (savedPort && data.ports.some(p => p.path === savedPort)) {
      selectedPort.value = savedPort
    } else if (!selectedPort.value && data.ports.length > 0) {
      selectedPort.value = data.ports[0].path
    }
  } catch (e: any) {
    lastError.value = e.message ?? 'Failed to list ports'
  }
}

async function toggleConnection() {
  if (state.value.connected) {
    connecting.value = true
    try {
      stopEventSource()
      await $fetch('/api/disconnect', { method: 'POST' })
      state.value = defaultState()
    } catch (e: any) {
      lastError.value = e.message
    } finally {
      connecting.value = false
    }
  } else {
    if (!selectedPort.value) {
      lastError.value = 'Please select a port first'
      return
    }
    connecting.value = true
    try {
      const data = await $fetch<{ ok: boolean; state: TransceiverState }>('/api/connect', {
        method: 'POST',
        body: { port: selectedPort.value, baudRate: selectedBaud.value },
      })
      state.value = data.state
      localStorage.setItem('cat_port', selectedPort.value)
      localStorage.setItem('cat_baud', String(selectedBaud.value))
      startEventSource()
    } catch (e: any) {
      lastError.value = e.message ?? 'Connection failed'
    } finally {
      connecting.value = false
    }
  }
}

/** One-shot status fetch — used after manual commands/presets for immediate feedback. */
async function pollStatus() {
  try {
    const data = await $fetch<TransceiverState>('/api/status')
    state.value = data
  } catch {
    // ignore transient errors
  }
}

/**
 * Open a Server-Sent Events connection to the serial server.
 * The server pushes state updates whenever the transceiver sends an AI response
 * or the S-meter / params polls complete — no client-side interval required.
 */
function startEventSource() {
  stopEventSource()

  // Same-origin SSE through the Nuxt proxy. Nuxt adds the per-launch
  // Bearer token server-side so it never enters the browser, and the
  // IP allowlist middleware gates the connection.
  const es = new EventSource('/api/events')

  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data) as (TransceiverState & { _delta?: true })
      if (msg._delta) {
        // Delta frame — merge only the changed fields into the current state.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _delta, ...changes } = msg
        state.value = { ...state.value, ...(changes as Partial<TransceiverState>) }
        if (changes.connected === false) stopEventSource()
      } else {
        // Full-state frame (sent on initial connect / reconnect).
        state.value = msg as TransceiverState
        if (!msg.connected) stopEventSource()
      }
    } catch { /* malformed frame */ }
  }

  // Named event from the serial-server: traffic on the rigctld TCP
  // relay (default port 4532). Auto-opens the panel on the first
  // connect of each "session" so the operator sees the traffic.
  es.addEventListener('rigctld', (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data) as RigctldLogLine
      if (msg.kind === 'connect') {
        rigctldClients.value.add(msg.remote)
        rigctldClients.value = new Set(rigctldClients.value)   // trigger reactivity
        rigctldOpen.value = true   // popup on connect — matches user spec
        rigctldAppend(msg)
      } else if (msg.kind === 'disconnect') {
        rigctldClients.value.delete(msg.remote)
        rigctldClients.value = new Set(rigctldClients.value)
        rigctldAppend(msg)
      } else if (msg.kind === 'line') {
        rigctldAppend(msg)
      }
    } catch { /* malformed frame */ }
  })

  es.onerror = () => {
    // EventSource reconnects automatically; nothing to do here.
    // If the transceiver was disconnected the server will push connected:false
    // which will close the EventSource via the onmessage handler.
  }

  eventSource = es
}

function stopEventSource() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

async function loadPresets() {
  try {
    // Read directly from cat-presets.json so the preset buttons mirror
    // what the PresetBuilder edits (the DB-backed /api/presets endpoint
    // is reserved for the separate DB Preset Manager).
    const data = await $fetch<{ presets: Preset[] }>('/api/json-presets')
    presets.value = data.presets
  } catch {
    // Presets are optional — silently ignore if config file is missing
  }
}

function onPresetExecuted(results: CommandResult[]) {
  //pollStatus()
}

async function toggleSpeechProc() {
  if (speechProcBusy.value || state.value.speechProc === null) return
  speechProcBusy.value = true
  try {
    const cmd = state.value.speechProc ? 'PR10' : 'PR11'
    const data = await $fetch<{ response: string; state: TransceiverState }>('/api/command', {
      method: 'POST',
      body: { command: cmd },
    })
    state.value = data.state
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    speechProcBusy.value = false
  }
}

async function toggleVox() {
  if (voxBusy.value || state.value.vox === null) return
  voxBusy.value = true
  try {
    // VX P1 ; — P1: 0=OFF, 1=ON
    const cmd = state.value.vox ? 'VX0' : 'VX1'
    const data = await $fetch<{ response: string; state: TransceiverState }>('/api/command', {
      method: 'POST',
      body: { command: cmd },
    })
    state.value = data.state
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    voxBusy.value = false
  }
}

async function togglePreAmpHf() {
  if (preAmpBusy.value || state.value.preAmpHf === null) return
  preAmpBusy.value = true
  try {
    // PA 0 P2 ; — P2: 0=IPO, 1=AMP1, 2=AMP2 (cycles 0→1→2→0)
    const next = ((state.value.preAmpHf) + 1) % 3
    await $fetch('/api/command', { method: 'POST', body: { command: `PA0${next}` } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    preAmpBusy.value = false
  }
}

async function toggleRfSql() {
  if (preAmpBusy.value || state.value.preAmpHf === null) return
  preAmpBusy.value = true
  try {
    const next = ((state.value.sqlRfMode) + 1) % 3
    await $fetch('/api/command', { method: 'POST', body: { command: `EX030102${next}` } })
  } catch (e: any) { lastError.value = e.message } finally { preAmpBusy.value = false }
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `EX030102` } })
  } catch (e: any) { lastError.value = e.message } finally {  }
}

async function togglePreAmpVhf() {
  if (preAmpBusy.value || state.value.preAmpVhf === null) return
  preAmpBusy.value = true
  try {
    // PA P1 P2 ; — P1=1 (VHF), P2: 0=OFF, 1=ON
    const cmd = state.value.preAmpVhf ? 'PA10' : 'PA11'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    preAmpBusy.value = false
  }
}

async function togglePreAmpUhf() {
  if (preAmpBusy.value || state.value.preAmpUhf === null) return
  preAmpBusy.value = true
  try {
    // PA P1 P2 ; — P1=2 (UHF), P2: 0=OFF, 1=ON
    const cmd = state.value.preAmpUhf ? 'PA20' : 'PA21'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    preAmpBusy.value = false
  }
}

async function toggleAntSelect1() {
  if (antSelectBusy.value || state.value.antSelect === null) return
  antSelectBusy.value = true
  try {
    const cmd = 'EX0307040'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
    await $fetch('/api/command', { method: 'POST', body: { command: `EX030704`} })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    antSelectBusy.value = false
  }
}

async function toggleAntSelect2() {
  if (antSelectBusy.value || state.value.antSelect === null) return
  antSelectBusy.value = true
  try {
    const cmd = 'EX0307041'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
    await $fetch('/api/command', { method: 'POST', body: { command: `EX030704`} })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    antSelectBusy.value = false
  }
}

async function toggleAtt() {
  if (attBusy.value) return
  attBusy.value = true
  try {
    // RA 0 P2 ; — P2: 0=OFF, 1=ON
    const cmd = state.value.rfAttenuator ? 'RA00' : 'RA01'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    attBusy.value = false
  }
}

async function toggleLock() {
  if (lockBusy.value || state.value.lock === null) return
  lockBusy.value = true
  try {
    // LK P1 ; — P1: 0=OFF, 1=ON
    const cmd = state.value.lock ? 'LK0' : 'LK1'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    lockBusy.value = false
  }
}

// GT P1 P2 ; — P1=VFO(0/1), P2=0(OFF) 1(FAST) 2(MID) 3(SLOW) 4(AUTO-F) 5(AUTO-M) 6(AUTO-S)
const AGC_CYCLE = ['0', '1', '2', '3', '4', '5', '6'] as const
const AGC_LABEL_TO_CODE: Record<string, string> = {
  'OFF': '0', 'FAST': '1', 'MID': '2', 'SLOW': '3', 'AUTO-F': '4', 'AUTO-M': '5', 'AUTO-S': '6',
}

async function cycleAgc(vfo: '0' | '1') {
  if (agcBusy.value) return
  const current = vfo === '0' ? state.value.agcMain : state.value.agcSub
  if (current === null) return
  const code    = AGC_LABEL_TO_CODE[current] ?? '0'
  const nextCode = AGC_CYCLE[(AGC_CYCLE.indexOf(code as typeof AGC_CYCLE[number]) + 1) % AGC_CYCLE.length]
  const nextCodeToSend = (parseInt(nextCode, 10)  > 4) ? '0' : nextCode
  agcBusy.value = true
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `GT${vfo}${nextCodeToSend}` } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    agcBusy.value = false
  }
}

async function toggleNarrow(vfo: '0' | '1') {
  if (narrowBusy.value) return
  const current = vfo === '0' ? state.value.narrowMain : state.value.narrowSub
  if (current === null) return
  narrowBusy.value = true
  try {
    // NA P1 P2 ; — P1=VFO(0/1), P2=0(OFF)/1(ON)
    await $fetch('/api/command', { method: 'POST', body: { command: `NA${vfo}${current ? '0' : '1'}` } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    narrowBusy.value = false
  }
}

const SQL_TYPE_MAX = 5

async function cycleSqlType(vfo: '0' | '1', current: number | null) {
  if (sqlTypeBusy.value || current === null) return
  sqlTypeBusy.value = true
  try {
    const next = current >= SQL_TYPE_MAX ? 0 : current + 1
    // CT P1 P2 ; — P1=VFO (0/1), P2=type (0-5)
    await $fetch('/api/command', {
      method: 'POST',
      body: { command: `CT${vfo}${next}` },
    })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    sqlTypeBusy.value = false
  }
}

async function setSquelch(vfo: '0' | '1', value: number) {
  const val = Math.max(0, Math.min(255, value))
  // SQ P1 xxx ; — P1=0 main / 1 sub, xxx=000-255 (3 digits, zero-padded)
  await $fetch('/api/command', {
    method: 'POST',
    body: { command: `SQ${vfo}${String(val).padStart(3, '0')}` },
  }).catch((e: any) => { lastError.value = e.message })
  if (vfo==='1') {
    await $fetch('/api/command', {
      method: 'POST',
      body: { command: `SQ1` },
    }).catch((e: any) => { lastError.value = e.message })
    await $fetch('/api/command', {
      method: 'POST',
      body: { command: `SQ0` },
    }).catch((e: any) => { lastError.value = e.message })
  }
}

async function setRfGain(vfo: '0' | '1', value: number) {
  const val = Math.max(0, Math.min(255, value))
  // RG P1 xxx ; — P1=0 main / 1 sub, xxx=000-255 (3 digits, zero-padded)
  await $fetch('/api/command', {
    method: 'POST',
    body: { command: `RG${vfo}${String(val).padStart(3, '0')}` },
  }).catch((e: any) => { lastError.value = e.message })
}

async function setAfGain(vfo: '0' | '1', value: number) {
  const val = Math.max(0, Math.min(255, value))
  // AG P1 xxx ; — P1=0 main / 1 sub, xxx=000-255 (3 digits, zero-padded)
  await $fetch('/api/command', {
    method: 'POST',
    body: { command: `AG${vfo}${String(val).padStart(3, '0')}` },
  }).catch((e: any) => { lastError.value = e.message })
}

async function toggleMox() {
  if (moxBusy.value) return
  moxBusy.value = true
  try {
    // MX P1 ; — P1: 0=OFF, 1=ON
    const cmd = state.value.mox ? 'MX0' : 'MX1'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    moxBusy.value = false
  }
}

async function switchToVfo(vfo: '0' | '1') {
  if (txVfoBusy.value) return
  txVfoBusy.value = true
  try {
    await $fetch('/api/command', { method: 'POST', body: { command: `FT${vfo}` } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    txVfoBusy.value = false
  }
}

async function toggleRxMode() {
  if (rxModeBusy.value) return
  rxModeBusy.value = true
  try {
    // FR P1 P2 ; — P1P2: 00=Dual receive, 01=Single receive
    const cmd = state.value.rxMode === 'dual' ? 'FR01' : 'FR00'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    rxModeBusy.value = false
  }
}

async function toggleSplit() {
  if (splitBusy.value) return
  splitBusy.value = true
  try {
    // ST P1 ; — P1: 0=OFF, 1=ON
    const cmd = state.value.split ? 'ST0' : 'ST1'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    splitBusy.value = false
  }
}

async function toggleSwap() {
  if (splitBusy.value) return
  splitBusy.value = true
  try {
    // ST P1 ; — P1: 0=OFF, 1=ON
    const cmd = 'SV'
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    splitBusy.value = false
  }
}

async function setFuncKnob(cmd: string) {
  if (funcKnobBusy.value) return
  funcKnobBusy.value = true
  try {
    const data = await $fetch<{ response: string; state: TransceiverState }>('/api/command', {
      method: 'POST',
      body: { command: cmd },
    })
    state.value = data.state
  } catch (e: any) {
    lastError.value = e.message
  } finally {
    funcKnobBusy.value = false
  }
}

async function sendManualCommand() {
  const cmd = manualCmd.value.trim()
  if (!cmd) return
  try {
    const data = await $fetch<{ response: string | null; state: TransceiverState; error?: string }>(
      '/api/command',
      { method: 'POST', body: { command: cmd, await: true } },
    )
    manualResponse.value = data.response ? `${data.response};` : '(no reply)'
    state.value = data.state
  } catch (e: any) {
    lastError.value = e.message
  }
}

// ── CTCSS tone picker modal ──────────────────────────────

const ctcssPopupVfo  = ref<'0' | '1' | null>(null)
const ctcssDialogRef = ref<HTMLElement | null>(null)

function openCtcssPopup(vfo: '0' | '1') {
  ctcssPopupVfo.value = vfo
  nextTick(() => {
    const dialog = ctcssDialogRef.value
    if (!dialog) return
    const active = dialog.querySelector<HTMLElement>('.ctcss-tone-btn--active')
    const first  = dialog.querySelector<HTMLElement>('.ctcss-tone-btn')
    ;(active ?? first)?.focus()
  })
}

function closeCtcssPopup() {
  ctcssPopupVfo.value = null
}

async function selectCtcssTone(vfo: '0' | '1', idx: number) {
  closeCtcssPopup()
  try {
    // CN P1 P2 P3P3P3 — P1=VFO(0/1), P2=0(CTCSS), P3P3P3=3-digit zero-padded index
    const cmd = `CN${vfo}0${String(idx).padStart(3, '0')}`
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  }
}

// ── DCS code picker modal ────────────────────────────────

const dcsPopupVfo  = ref<'0' | '1' | null>(null)
const dcsDialogRef = ref<HTMLElement | null>(null)

function openDcsPopup(vfo: '0' | '1') {
  dcsPopupVfo.value = vfo
  nextTick(() => {
    const dialog = dcsDialogRef.value
    if (!dialog) return
    const active = dialog.querySelector<HTMLElement>('.ctcss-tone-btn--active')
    const first  = dialog.querySelector<HTMLElement>('.ctcss-tone-btn')
    ;(active ?? first)?.focus()
  })
}

function closeDcsPopup() {
  dcsPopupVfo.value = null
}

async function selectDcsCode(vfo: '0' | '1', idx: number) {
  closeDcsPopup()
  try {
    // CN P1 P2 P3P3P3 — P1=VFO(0/1), P2=1(DCS), P3P3P3=3-digit zero-padded index
    const cmd = `CN${vfo}1${String(idx).padStart(3, '0')}`
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
  } catch (e: any) {
    lastError.value = e.message
  }
}

// ── Saved channels ──────────────────────────────────────

const MIN_CHANNEL_HZ = 30_000
const MAX_CHANNEL_HZ = 470_000_000

interface ChannelSaveDraft {
  label: string
  freqMhz: string
  vfo: '0' | '1'
  mode: string | null
  sqlType: number | null
  ctcssIdx: number | null
  dcsIdx: number | null
}

const showChannelSaveModal = ref(false)
const channelSaveDraft = ref<ChannelSaveDraft>({
  label: '',
  freqMhz: '',
  vfo: '0',
  mode: null,
  sqlType: null,
  ctcssIdx: null,
  dcsIdx: null,
})
const channelSaveError = ref('')
const channelSaveDialogRef = ref<HTMLElement | null>(null)
const channelSaveLabelRef = ref<HTMLInputElement | null>(null)
const channelSaveFreqRef = ref<HTMLInputElement | null>(null)
/** In-progress label/freq while editing a saved channel card. */
type ChannelFieldDraft = { label?: string, freqMhz?: string }
const chFieldDraft = ref<Record<string, ChannelFieldDraft>>({})
/** Keep card order stable while an input inside it has focus (avoids jump on SSE re-render). */
const channelListOrder = ref<string[] | null>(null)

const channelSaveMeta = computed(() => {
  const d = channelSaveDraft.value
  const parts: string[] = []
  if (d.mode) parts.push(d.mode)
  const sql = chSqlLabel({ id: '', label: '', vfo: d.vfo, freq: 0, mode: d.mode, sqlType: d.sqlType, ctcssIdx: d.ctcssIdx, dcsIdx: d.dcsIdx })
  if (sql) parts.push(sql)
  return parts.length ? parts.join(' · ') : null
})

function channelFreqMhzString(hz: number): string {
  return (hz / 1_000_000).toFixed(3)
}

function parseChannelFreqMhz(raw: string): number | null {
  const cleaned = String(raw ?? '').trim().replace(/,/g, '.').replace(/[^\d.]/g, '')
  if (!cleaned) return null
  const mhz = parseFloat(cleaned)
  if (!Number.isFinite(mhz) || mhz <= 0) return null
  const hz = Math.round(mhz * 1_000_000)
  if (hz < MIN_CHANNEL_HZ || hz > MAX_CHANNEL_HZ) return null
  return hz
}

function vfoSnapshot(vfo: '0' | '1') {
  return {
    freq:     vfo === '0' ? state.value.mainFreq    : state.value.subFreq,
    mode:     vfo === '0' ? state.value.mainMode    : state.value.subMode,
    sqlType:  vfo === '0' ? state.value.mainSqlType : state.value.subSqlType,
    ctcssIdx: vfo === '0' ? state.value.mainCtcssTone : state.value.subCtcssTone,
    dcsIdx:   vfo === '0' ? state.value.mainDcsCode   : state.value.subDcsCode,
  }
}

function setChannelSaveVfo(vfo: '0' | '1') {
  const snap = vfoSnapshot(vfo)
  if (snap.freq == null) return
  channelSaveDraft.value = {
    ...channelSaveDraft.value,
    vfo,
    freqMhz: channelFreqMhzString(snap.freq),
    mode: snap.mode ?? null,
    sqlType: snap.sqlType ?? null,
    ctcssIdx: snap.ctcssIdx ?? null,
    dcsIdx: snap.dcsIdx ?? null,
    label: defaultChannelLabel(snap.freq, snap.mode ?? null),
  }
  channelSaveError.value = ''
}

function openChannelSaveModal(vfo: '0' | '1') {
  const snap = vfoSnapshot(vfo)
  if (snap.freq == null) return
  channelSaveError.value = ''
  channelSaveDraft.value = {
    label: defaultChannelLabel(snap.freq, snap.mode ?? null),
    freqMhz: channelFreqMhzString(snap.freq),
    vfo,
    mode: snap.mode ?? null,
    sqlType: snap.sqlType ?? null,
    ctcssIdx: snap.ctcssIdx ?? null,
    dcsIdx: snap.dcsIdx ?? null,
  }
  showChannelSaveModal.value = true
  nextTick(() => {
    channelSaveLabelRef.value?.focus()
    channelSaveLabelRef.value?.select()
  })
}

function closeChannelSaveModal() {
  showChannelSaveModal.value = false
  channelSaveError.value = ''
}

function confirmChannelSave() {
  const d = channelSaveDraft.value
  const hz = parseChannelFreqMhz(d.freqMhz)
  if (hz == null) {
    channelSaveError.value = `Enter a valid frequency (${MIN_CHANNEL_HZ / 1000} kHz – ${MAX_CHANNEL_HZ / 1_000_000} MHz).`
    channelSaveFreqRef.value?.focus()
    return
  }
  const id = Date.now().toString()
  savedChannels.value = [
    ...savedChannels.value,
    normalizeChannel({
      id,
      label: d.label,
      vfo: d.vfo,
      freq: hz,
      mode: d.mode,
      sqlType: d.sqlType,
      ctcssIdx: d.ctcssIdx,
      dcsIdx: d.dcsIdx,
    }),
  ]
  persistChannels()
  closeChannelSaveModal()
}

function saveChannelFromVfo(vfo: '0' | '1') {
  openChannelSaveModal(vfo)
}

async function applyChannel(ch: ChannelConfig) {
  const vfo = ch.vfo === '1' ? '1' : '0'
  const cmds: string[] = []
  cmds.push((vfo === '0' ? 'FA' : 'FB') + String(ch.freq).padStart(9, '0'))
  if (ch.mode) {
    const entry = MODES.find(m => m.label === ch.mode)
    if (entry) {
      cmds.push(`MD${vfo}${entry.code}`)
    }
  }
  if (ch.sqlType !== null) cmds.push(`CT${vfo}${ch.sqlType}`)
  if (ch.ctcssIdx !== null) cmds.push(`CN${vfo}0${String(ch.ctcssIdx).padStart(3, '0')}`)
  if (ch.dcsIdx !== null)   cmds.push(`CN${vfo}1${String(ch.dcsIdx).padStart(3, '0')}`)
  for (const cmd of cmds) {
    await $fetch('/api/command', { method: 'POST', body: { command: cmd } })
      .catch((e: any) => { lastError.value = e.message })
  }
}

function deleteChannel(id: string) {
  savedChannels.value = savedChannels.value.filter(c => c.id !== id)
  persistChannels()
}

function defaultChannelLabel(freq: number, mode: string | null): string {
  const band = bandByCode(freqToBandCode(freq))
  if (band?.meter) return mode ? `${band.meter} ${mode}` : band.meter
  const mhz = (freq / 1_000_000).toFixed(3)
  return mode ? `${mhz} ${mode}` : mhz
}

function normalizeChannel(ch: Partial<ChannelConfig> & { freq: number; id?: string }): ChannelConfig {
  const mode = ch.mode ?? null
  const label = typeof ch.label === 'string' && ch.label.trim()
    ? ch.label.trim()
    : defaultChannelLabel(ch.freq, mode)
  return {
    id: ch.id ?? Date.now().toString(),
    label,
    vfo: ch.vfo === '1' ? '1' : '0',
    freq: ch.freq,
    mode,
    sqlType: ch.sqlType ?? null,
    ctcssIdx: ch.ctcssIdx ?? null,
    dcsIdx: ch.dcsIdx ?? null,
  }
}

function updateChannelLabel(id: string, raw: string) {
  const trimmed = raw.trim()
  savedChannels.value = savedChannels.value.map((c) =>
    c.id === id ? { ...c, label: trimmed || defaultChannelLabel(c.freq, c.mode) } : c,
  )
  persistChannels()
}

function updateChannelFreq(id: string, hz: number) {
  savedChannels.value = savedChannels.value.map((c) =>
    c.id === id ? { ...c, freq: hz } : c,
  )
  persistChannels()
}

function freezeChannelListOrder() {
  if (channelListOrder.value == null) {
    channelListOrder.value = [...savedChannels.value]
      .sort((a, b) => a.freq - b.freq)
      .map(c => c.id)
  }
}

function maybeUnfreezeChannelListOrder(id: string) {
  nextTick(() => {
    const card = document.querySelector(`[data-ch-id="${id}"]`)
    const active = document.activeElement
    if (card?.contains(active)) return
    channelListOrder.value = null
  })
}

function channelDraftOf(id: string): ChannelFieldDraft {
  return chFieldDraft.value[id] ?? {}
}

function hasChannelDraftField(id: string, field: keyof ChannelFieldDraft): boolean {
  return Object.prototype.hasOwnProperty.call(chFieldDraft.value[id] ?? {}, field)
}

function setChannelDraftField(id: string, field: keyof ChannelFieldDraft, value: string) {
  freezeChannelListOrder()
  chFieldDraft.value = {
    ...chFieldDraft.value,
    [id]: { ...chFieldDraft.value[id], [field]: value },
  }
}

function clearChannelDraftField(id: string, field: keyof ChannelFieldDraft) {
  const cur = { ...(chFieldDraft.value[id] ?? {}) }
  delete cur[field]
  if (Object.keys(cur).length === 0) {
    const next = { ...chFieldDraft.value }
    delete next[id]
    chFieldDraft.value = next
  } else {
    chFieldDraft.value = { ...chFieldDraft.value, [id]: cur }
  }
}

function seedChannelLabelDraft(ch: ChannelConfig) {
  freezeChannelListOrder()
  if (!hasChannelDraftField(ch.id, 'label')) {
    setChannelDraftField(ch.id, 'label', ch.label)
  }
}

function seedChannelFreqDraft(ch: ChannelConfig) {
  freezeChannelListOrder()
  if (!hasChannelDraftField(ch.id, 'freqMhz')) {
    setChannelDraftField(ch.id, 'freqMhz', channelFreqMhzString(ch.freq))
  }
}

function channelLabelDisplay(ch: ChannelConfig): string {
  if (hasChannelDraftField(ch.id, 'label')) {
    return channelDraftOf(ch.id).label ?? ''
  }
  return ch.label
}

function onChannelLabelInput(id: string, raw: string) {
  setChannelDraftField(id, 'label', raw)
}

function onChannelLabelCancel(id: string) {
  clearChannelDraftField(id, 'label')
  maybeUnfreezeChannelListOrder(id)
}

function onChannelLabelCommit(id: string) {
  if (!hasChannelDraftField(id, 'label')) {
    maybeUnfreezeChannelListOrder(id)
    return
  }
  const draft = channelDraftOf(id).label ?? ''
  clearChannelDraftField(id, 'label')
  updateChannelLabel(id, draft)
  maybeUnfreezeChannelListOrder(id)
}

function channelFreqDisplay(ch: ChannelConfig): string {
  if (hasChannelDraftField(ch.id, 'freqMhz')) {
    return channelDraftOf(ch.id).freqMhz ?? ''
  }
  return channelFreqMhzString(ch.freq)
}

function onChannelFreqInput(id: string, raw: string) {
  setChannelDraftField(id, 'freqMhz', raw)
}

function onChannelFreqCancel(id: string) {
  clearChannelDraftField(id, 'freqMhz')
  maybeUnfreezeChannelListOrder(id)
}

function onChannelFreqCommit(id: string) {
  if (!hasChannelDraftField(id, 'freqMhz')) {
    maybeUnfreezeChannelListOrder(id)
    return
  }
  const draft = channelDraftOf(id).freqMhz ?? ''
  clearChannelDraftField(id, 'freqMhz')
  const hz = parseChannelFreqMhz(draft)
  if (hz == null) {
    lastError.value = 'Invalid channel frequency — not saved.'
    setTimeout(() => { lastError.value = null }, 4000)
    maybeUnfreezeChannelListOrder(id)
    return
  }
  updateChannelFreq(id, hz)
  maybeUnfreezeChannelListOrder(id)
}

function formatChannelFreq(ch: ChannelConfig): string {
  return `${channelFreqMhzString(ch.freq)} MHz`
}

function channelTooltip(ch: ChannelConfig): string {
  const parts = [ch.label, ch.vfo === '1' ? 'SUB' : 'MAIN', formatChannelFreq(ch)]
  if (ch.mode) parts.push(ch.mode)
  const sql = chSqlLabel(ch)
  if (sql) parts.push(sql)
  return parts.join(' · ')
}

const sortedChannels = computed(() => {
  const byId = new Map(savedChannels.value.map(c => [c.id, c]))
  if (channelListOrder.value) {
    return channelListOrder.value
      .map(id => byId.get(id))
      .filter((c): c is ChannelConfig => c != null)
  }
  return [...savedChannels.value].sort((a, b) => a.freq - b.freq)
})

function chSqlLabel(ch: ChannelConfig): string | null {
  if (!ch.sqlType) return null
  if (ch.sqlType === 1 || ch.sqlType === 2) {
    const hz = ch.ctcssIdx !== null ? CTCSS_TONES[ch.ctcssIdx]?.toFixed(1) : null
    return hz ? `${sqlTypeLabel(ch.sqlType)} ${hz}Hz` : sqlTypeLabel(ch.sqlType)
  }
  if (ch.sqlType === 3) {
    const code = ch.dcsIdx !== null ? DCS_CODES[ch.dcsIdx] : null
    return code != null ? `DCS D${String(code).padStart(3, '0')}` : 'DCS'
  }
  return sqlTypeLabel(ch.sqlType)
}

// ── User settings (load/save from DB) ──────────────────────────────────

async function loadUserSettings() {
  try {
    const data = await $fetch<{
      call_sign?: string
      color_primary?: string
      color_accent?: string
      color_bg?: string
      font_mono?: string
      radius_px?: number
      theme_overrides?: Record<string, string> | null
      preset_timing_enabled?: boolean
      preset_default_delay_ms?: number
    }>('/api/settings')

    userSettings.value = {
      call_sign:     data.call_sign     || '',
      color_primary: data.color_primary || '#ff9000',
      color_accent:  data.color_accent  || '#0a84ff',
      color_bg:      data.color_bg      || '#0d1117',
      font_mono:     data.font_mono     || 'Courier New',
      radius_px:     data.radius_px     || 8,
      preset_timing_enabled: !!data.preset_timing_enabled,
      preset_default_delay_ms: Number(data.preset_default_delay_ms) || 100,
    }

    // Hydrate CSS-variable overrides from the DB, then apply. The DB copy
    // is authoritative — it overrides whatever was in localStorage from a
    // previous session. If the DB has no overrides stored (null), clear
    // any stale local mirror so the page falls back to its :root defaults.
    if (data.theme_overrides && typeof data.theme_overrides === 'object') {
      themeOverrides.value = { ...data.theme_overrides }
      try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeOverrides.value)) } catch {}
    } else if (data.theme_overrides === null) {
      themeOverrides.value = {}
      try { localStorage.removeItem(THEME_STORAGE_KEY) } catch {}
    }
    applyTheme()
  } catch (err) {
    console.warn('[loadUserSettings]', err)
  }
}

async function saveUserSettings() {
  try {
    await $fetch('/api/settings', {
      method: 'PUT',
      body: userSettings.value,
    })
  } catch (err) {
    lastError.value = `Failed to save settings: ${err}`
    setTimeout(() => { lastError.value = null }, 5000)
  }
}

// ── Preset management ──────────────────────────────────────────────────
// Presets are stored in cat-presets.json and edited via the PresetBuilder
// component. The DB-backed preset tables/endpoints are no longer used by
// the UI (kept server-side as dormant code).

function openPresetBuilder() {
  builderTargetPresetId.value = null
  showPresetBuilder.value = true
}

function closePresetBuilder() {
  showPresetBuilder.value = false
  builderTargetPresetId.value = null
}

function onPresetSaved() {
  // Refresh the JSON-driven preset button row so newly saved/edited
  // presets become visible immediately. Builder stays open so the user
  // can keep editing other presets in the same session.
  loadPresets()
}

// ----------- lifecycle -----------

onMounted(async () => {
  loadTheme()
  await loadUserSettings()
  const savedBaud = localStorage.getItem('cat_baud')
  if (savedBaud) selectedBaud.value = Number(savedBaud)
  await loadChannels()
  loadQuickMacros()
  // Restore the user's previously-dragged rigctld panel height (if any).
  // While this stays null the panel auto-tracks the Band Scope's height.
  try {
    const saved = localStorage.getItem(RIGCTLD_HEIGHT_KEY)
    if (saved) {
      const n = parseInt(saved, 10)
      if (Number.isFinite(n) && n >= RIGCTLD_MIN_HEIGHT) {
        rigctldUserHeight.value  = n
        rigctldPanelHeight.value = n
      }
    }
  } catch { /* ignore */ }
  await Promise.all([refreshPorts(), loadPresets()])
  // Sync with server state (e.g. after page reload while transceiver is already connected)
  const s = await $fetch<TransceiverState>('/api/status')
  state.value = s
  if (s.connected) startEventSource()
})

onUnmounted(() => {
  stopEventSource()
  stopRigctldHeightSync()
  if (macroToastTimer) { clearTimeout(macroToastTimer); macroToastTimer = null }
  document.removeEventListener('mousedown', onGlobalMousedownForMacroDropdown)
})
</script>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* Yaesu-style VFO digit face — loaded from CDN (font file not shipped in repo). */
@font-face {
  font-family: 'AutopromPro Black Rounded';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('https://db.onlinewebfonts.com/t/746572e611b9b4c64833f527353ffd6c.woff2') format('woff2'),
       url('https://db.onlinewebfonts.com/t/746572e611b9b4c64833f527353ffd6c.woff') format('woff');
}

:root {
  --bg: #0d1117;
  --surface: #161b22;
  --surface2: #21262d;
  --border: #505152;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --accent: #58a6ff;
  --green: #3fb950;
  --red: #f85149;
  --yellow: #d29922;
  --vfo-card-main: #161b22;
  --vfo-card-sub:  #161b22;
  --radius: 8px;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  --font-vfo: 'AutopromPro Black Rounded', var(--font-mono);
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  min-height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Header ── */
.header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.header-brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-shrink: 0;
}

.brand-logo {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--accent);
  font-family: var(--font-mono);
}

.brand-sub {
  font-size: 12px;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.brand-version {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--font-mono);
  letter-spacing: 1px;
  padding: 2px 6px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  line-height: 1;
  text-transform: uppercase;
  opacity: 0.85;
}

.header-callsign {
  font-size: 17px;
  font-weight: 600;
  color: var(--green);
  font-family: var(--font-mono);
  padding: 4px 8px;
  background: var(--surface2);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.conn-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
  flex-wrap: wrap;
}

.sel {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--radius);
  padding: 5px 10px;
  font-size: 13px;
  flex: 1;
  min-width: 160px;
  cursor: pointer;
}

.sel:disabled { opacity: 0.5; cursor: default; }
.baud-sel { flex: 0 0 90px; min-width: 90px; }

.btn {
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .15s;
  white-space: nowrap;
}

.btn:disabled { opacity: 0.5; cursor: default; }
.btn-primary { background: var(--accent); color: #0d1117; }
.btn-danger { background: var(--red); color: #fff; }
.btn-ghost { background: var(--surface2); color: var(--green); border: 1px solid var(--border); }
.btn-sm { padding: 4px 10px; font-size: 12px; }

.conn-status {
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}

.status-ok { background: rgba(63,185,80,.15); color: var(--green); }
.status-off { background: rgba(139,148,158,.1); color: var(--text-muted); }

/* ── Error banner ── */
.error-banner {
  background: rgba(248,81,73,.12);
  border-bottom: 1px solid var(--red);
  color: var(--red);
  padding: 8px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--red);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}

/* ── Dashboard ── */
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  flex: 1;
}

/* ── TX indicator ── */
.tx-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  border-radius: var(--radius);
  background: var(--surface2);
  border: 1px solid var(--border);
  width: fit-content;
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--green);
  transition: all .2s;
}

.tx-indicator.tx-active {
  background: rgba(248,81,73,.15);
  border-color: var(--red);
  color: var(--red);
  box-shadow: 0 0 16px rgba(248,81,73,.3);
}

.tx-indicator.power-off {
  background: rgba(248,81,73,.15);
  color: var(--red);
}

.swr-alarm {
  font-size: 13px;
  font-weight: 700;
  background: var(--red);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  animation: blink 1s infinite;
}

@keyframes blink {
  50% { opacity: .4; }
}

/* ── VFO section ── */
.vfo-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 720px) {
  .vfo-section { grid-template-columns: 1fr; }
}

.vfo-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  position: relative;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(147, 180, 138, 0.52), 0 0 15px rgba(0, 50, 50, 0.83);

}

/* Per-card backgrounds so each VFO can be themed independently via the
   Appearance settings drawer (--vfo-card-main / --vfo-card-sub). */
.main-card { background: var(--vfo-card-main); border-left: 3px solid #444; }
.sub-card  { background: var(--vfo-card-sub);  border-left: 3px solid #444; }

/* Active (TX) VFO — full orange border */
.vfo-card--tx-vfo {
  border-left: 3px solid #c35910;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(147, 180, 138, 0.52), 0 0 15px rgba(0, 50, 50, 0.83);}

/* Single-receive inactive VFO — greyed out, non-interactive */
.vfo-card--inactive {
  opacity: .35;
  filter: grayscale(.4);
  pointer-events: none;
  user-select: none;
}

/* Single-receive inactive VFO in non-split mode — clickable to switch TX/RX */
.vfo-card--switchable {
  opacity: .35;
  filter: grayscale(.4);
  pointer-events: none;
  user-select: none;
}

.vfo-switch-overlay {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  cursor: pointer;
  pointer-events: all;
  z-index: 10;
  background: transparent;
  transition: background 0.2s;
}

.vfo-switch-overlay:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* TX VFO badge in the card header */
.tx-vfo-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--red);
  background: rgba(248, 81, 73, .15);
  border: 1px solid rgba(248, 81, 73, .4);
  border-radius: 4px;
  padding: 4px 5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.rx-vfo-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--green);
  background: rgba(81, 248, 73, .15);
  border: 1px solid rgba(81, 248, 73, .4);
  border-radius: 4px;
  padding: 4px 5px;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
}

.vfo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.band-sel {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 5px;
  padding: 3px 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  min-width: 0;
  text-align: center;
  white-space: nowrap;
  transition: border-color .15s;
}

.band-sel:hover:not(:disabled) {
  border-color: var(--accent);
}

/* ── Band picker modal ── */
.band-modal {
  width: 280px;
}

.band-btn-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 12px;
}

.band-modal-btn {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 8px 4px;
  background: var(--surface-2, #1e2330);
  border: 2px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  cursor: pointer;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  line-height: 1.15;
  min-height: 44px;
  transition: background .1s, border-color .1s;
  outline: none;
}

.band-modal-meter {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.band-modal-freq {
  font-size: 9px;
  font-weight: 500;
  opacity: 0.82;
}

.band-modal-btn--active .band-modal-freq {
  opacity: 0.92;
}

.band-modal-freq--solo {
  font-size: 11px;
  font-weight: 600;
  opacity: 1;
}

.band-modal-btn:hover {
  background: rgba(59, 130, 246, .2);
  border-color: #3b82f6;
  color: #93c5fd;
}

.band-modal-btn:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 1px;
}

.band-modal-btn--active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
  font-weight: 700;
}

.band-sel:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.band-sel:disabled {
  opacity: .45;
  cursor: default;
}

.vfo-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
  font-weight: 600;
}

.mode-sel {
  background: #6b7280;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  cursor: pointer;
  transition: filter .15s;
  text-align: center;
  white-space: nowrap;
}

.mode-sel:hover:not(:disabled) {
  filter: brightness(1.15);
}

/* ── Mode picker modal ── */
.mode-modal {
  width: 300px;
}

.mode-btn-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 12px;
}

.btn-up {
  width: 40px;
  flex: none;
}

.mode-modal-btn {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 9px 4px;
  border: 2px solid transparent;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  text-align: center;
  transition: filter .1s, border-color .1s;
  outline: none;
}

.mode-modal-btn:hover {
  filter: brightness(1.2);
}

.mode-modal-btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, .8);
  outline-offset: 1px;
}

.mode-modal-btn--active {
  border-color: #fff;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .35);
}

.mode-sel:focus {
  outline: 2px solid rgba(255,255,255,.5);
  outline-offset: 1px;
}

.mode-sel:disabled {
  opacity: .45;
  cursor: default;
}

.mode-sel option {
  background: #1c2128;
  color: #e6edf3;
  font-weight: 600;
}

.sql-cycle-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-muted);
}

.sql-cycle-val {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.freq-display {
  font-family: var(--font-mono);
  font-size: 42px;
  font-weight: 300;
  letter-spacing: 2px;
  color: #e6edf3;
  line-height: 1;
  transition: color .2s;
  white-space: nowrap;
}

.freq-display.freq-tx { color: var(--red); }
.freq-sub { font-size: 42px; color: #c9d1d9; }

.freq-sep {
  width: 1px;
  align-self: stretch;
  background: var(--border);
  margin: 2px 6px;
  flex-shrink: 0;
}

.freq-tuner {
  display: flex;
  align-items: baseline;
  font-family: var(--font-vfo);
  font-size: 42px;
  font-weight: 300;
  letter-spacing: 1px;
  color: #e6edf3;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.freq-tuner.freq-sub { font-size: 42px; color: #c9d1d9; }
.freq-tuner.freq-tx  { color: var(--red); }

.freq-dot {
  color: var(--text-muted);
  pointer-events: none;
  user-select: none;
  letter-spacing: 0;
  margin: 0 3px;
}

.freq-group {
  display: inline-block;
  width: 3ch;
  text-align: right;
  cursor: ns-resize;
  border-radius: 4px;
  padding: 0 2px;
  user-select: none;
  transition: background .1s, color .1s;
}

.freq-group:hover {
  background: rgba(255, 255, 255, .1);
  color: #fff;
}

.freq-tuner.freq-tx .freq-group:hover {
  background: rgba(239, 68, 68, .2);
}

.freq-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  margin-top: 22px;
}

.freq-unit {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 2px;
  padding-top: 18px;
  padding-left: 4px;
}

/* ── Status section ── */
.status-section {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* ── Presets section ── */
/* ── Saved channels panel ── */
.channels-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  flex: 0 0 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.channels-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.channels-count {
  font-size: 10px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1px 6px;
  color: var(--text-muted);
}

.channels-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.channels-empty {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

.ch-badge {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color .15s, background .15s;
  font-family: var(--font-mono);
  max-width: 100%;
  min-width: 148px;
}

.ch-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ch-label-input {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 2px 4px;
  outline: none;
}

.ch-label-input:hover,
.ch-label-input:focus {
  border-color: var(--border);
  background: var(--surface);
}

.ch-freq-row {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.ch-freq-input {
  width: 5.5em;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 1px 4px;
  outline: none;
}

.ch-freq-input:hover,
.ch-freq-input:focus {
  border-color: var(--border);
  background: var(--surface);
}

.ch-freq-unit {
  font-size: 9px;
  color: var(--text-muted);
}

.ch-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 10px;
}

.ch-badge:hover {
  border-color: #f97316;
  background: rgba(249, 115, 22, .08);
}

.ch-freq {
  color: var(--accent);
  font-weight: 600;
}

.ch-mode {
  font-size: 10px;
  color: var(--text-muted);
}

.ch-sql {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

.ch-del {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 3px;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
}

.ch-del:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, .12);
}

/* ── Save channel modal ── */
.channel-save-modal {
  width: min(320px, calc(100vw - 32px));
}

.channel-save-row--vfo {
  align-items: center;
}

.channel-vfo-toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
  background: var(--surface2);
}

.channel-vfo-toggle-btn {
  flex: 1;
  min-width: 72px;
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background .12s, color .12s;
}

.channel-vfo-toggle-btn + .channel-vfo-toggle-btn {
  border-left: 1px solid var(--border);
}

.channel-vfo-toggle-btn:hover:not(:disabled):not(.channel-vfo-toggle-btn--active) {
  background: rgba(59, 130, 246, .12);
  color: var(--text);
}

.channel-vfo-toggle-btn--active {
  background: #3b82f6;
  color: #fff;
}

.channel-vfo-toggle-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ch-vfo {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.ch-vfo--main {
  color: #93c5fd;
  border-color: rgba(59, 130, 246, .45);
  background: rgba(59, 130, 246, .12);
}

.ch-vfo--sub {
  color: #fdba74;
  border-color: rgba(249, 115, 22, .45);
  background: rgba(249, 115, 22, .12);
}

.channel-save-form {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.channel-save-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: center;
  gap: 8px;
}

.channel-save-lbl {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.channel-save-input {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface2);
  color: var(--text);
  outline: none;
}

.channel-save-input:focus {
  border-color: var(--accent);
}

.channel-save-freq-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.channel-save-input--freq {
  flex: 1;
  min-width: 0;
}

.channel-save-unit {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
}

.channel-save-meta {
  margin: 0;
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.channel-save-error {
  margin: 0;
  font-size: 11px;
  color: var(--red, #ef4444);
}

.channel-save-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.presets-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
}

.presets-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.presets-manage-btn {
  margin-left: auto;
}

.presets-empty-state {
  padding: 18px 14px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  background: var(--surface2);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-muted);
}

.presets-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.presets-hint code {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text);
}

.presets-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* ── Manual command ── */
.cmd-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 16px;
}

.cmd-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
}

.cmd-input {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 5px 10px;
  font-family: var(--font-mono);
  font-size: 13px;
  width: 200px;
}

.cmd-input:focus { outline: 2px solid var(--accent); }

.cmd-response {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--green);
  padding: 3px 8px;
  background: rgba(63,185,80,.08);
  border-radius: 4px;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Idle screen ── */
.idle-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 40px;
}

.idle-icon { font-size: 64px; line-height: 1; }
.idle-screen p { font-size: 15px; line-height: 1.6; }
.idle-hint { font-size: 13px; }
.idle-hint code {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: var(--font-mono);
  color: var(--text);
}

/* ── SQL / CTCSS / DCS info row inside VFO card ── */
.sql-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 4px;
}

.sql-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid;
  white-space: nowrap;
}

.sql-tone {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  /*color: var(--text-muted);*/
  color: rgb(234, 211, 238);
}

/* ── TX bar (TX indicator + FUNC KNOB widget) ── */
.txbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.func-knob-widget {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 14px;
  flex-wrap: wrap;
}

.func-knob-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-muted);
  white-space: nowrap;
}

.func-knob-value {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  min-width: 90px;
  white-space: nowrap;
}

.func-knob-btns {
  display: flex;
  gap: 6px;
}

.btn-active {
  background: var(--surface2);
  border-color: var(--accent) !important;
  color: var(--accent) !important;
}

/* ── Bottom panels row ── */
.bottom-panels {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

/* ── Scope panel ── */
.scope-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 340px;
  flex-shrink: 0;
}

.scope-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
}

/* ── rigctld relay traffic terminal ─────────────────────────────
   Pops up next to the scope when a TCP client connects on :4532.
   Pure presentation — the producer side is rigctld-relay.mjs +
   the SSE bridge in serial-server.mjs.

   Layout: fixed-height section whose body flexes to fill, with a
   draggable resize handle pinned to the bottom edge. While the user
   has not dragged it, the section's height is set by a JS-side
   ResizeObserver to match `.scope-panel`'s height — see
   `startRigctldHeightSync()` in <script>. */
.rigctld-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px 0 12px;       /* zero bottom padding — the resize handle owns that edge */
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 420px;
  width: 460px;
  max-width: 100%;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;                 /* keep the resize handle and rounded corners aligned */
}
.rigctld-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  min-width: 0;
}
.rigctld-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  font-family: ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace;
  min-width: 0;                     /* lets the ellipsis kick in */
}
.rigctld-status-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.rigctld-count {
  color: var(--text-muted);
  font-size: 9px;
  opacity: 0.8;
}
.rigctld-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7280;       /* gray when no clients */
  box-shadow: 0 0 4px rgba(0,0,0,0.4) inset;
  flex-shrink: 0;
}
.rigctld-status--on .rigctld-dot {
  background: #10b981;       /* green when a client is connected */
  box-shadow: 0 0 6px rgba(16,185,129,0.7);
}
.rigctld-spacer { flex: 1; }
.rigctld-icon-btn {
  font-size: 14px;
  line-height: 1;
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.rigctld-body {
  background: #0b0e13;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) - 4px);
  padding: 8px 10px;
  flex: 1 1 auto;                   /* fill remaining space inside .rigctld-panel */
  min-height: 80px;
  overflow-y: auto;
  font-family: ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.55;
  color: #d1d5db;
}
.rigctld-resize {
  flex: 0 0 auto;
  height: 10px;
  margin: 4px -12px 0 -12px;        /* extend over the panel's side padding */
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;               /* let pointermove deliver smooth events */
}
.rigctld-resize-grip {
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: var(--border);
  transition: background 120ms;
}
.rigctld-resize:hover .rigctld-resize-grip,
.rigctld-resize:active .rigctld-resize-grip {
  background: var(--accent, #10b981);
}
.rigctld-line {
  display: grid;
  grid-template-columns: 92px 18px 1fr;
  column-gap: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}
.rigctld-ts {
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.rigctld-arrow {
  text-align: center;
  font-weight: 700;
  opacity: 0.8;
}
.rigctld-text { color: #d1d5db; }

.rigctld-line--in .rigctld-arrow  { color: #38bdf8; }   /* cyan — client → us */
.rigctld-line--in .rigctld-text   { color: #e5e7eb; }
.rigctld-line--out .rigctld-arrow { color: #4ade80; }   /* green — us → client */
.rigctld-line--out .rigctld-text  { color: #bbf7d0; }
.rigctld-line--connect .rigctld-arrow,
.rigctld-line--connect .rigctld-text { color: #a78bfa; font-style: italic; }
.rigctld-line--disconnect .rigctld-arrow,
.rigctld-line--disconnect .rigctld-text { color: #f87171; font-style: italic; }

.rigctld-empty {
  color: #6b7280;
  font-style: italic;
  text-align: center;
  padding: 20px 0;
}

/* level bar */
.scope-level-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-level-lbl {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #8b949e;
  white-space: nowrap;
  width: 38px;
  flex-shrink: 0;
}

.scope-level-track {
  flex: 1;
  min-width: 0;
  height: 9px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 3px;
  position: relative;
  cursor: pointer;
  /* The track itself stays unclipped so the center tick mark may extend
     above/below it. The fill is constrained by the math in
     `scopeLevelFillStyle`, which clamps pct to [-50, +50], and by the
     `max-width: 50%` safety in the `.scope-level-fill` rule below. */
  overflow: visible;
}

.scope-level-track:hover {
  border-color: #6e7681;
}

.scope-level-center {
  position: absolute;
  left: 50%;
  top: -3px;
  width: 1px;
  height: 13px;
  background: #6e7681;
  transform: translateX(-50%);
  pointer-events: none;
}

.scope-level-fill {
  position: absolute;
  top: 0;
  height: 100%;
  /* Safety upper bound — the bipolar bar can occupy at most one half
     of the track on either side of the centre line. */
  max-width: 50%;
  border-radius: 3px;
  transition: left .1s ease-out, width .1s ease-out;
  pointer-events: none;
}

.scope-level-val {
  font-size: 9px;
  font-family: 'SF Mono', monospace;
  color: #8b949e;
  width: 36px;
  text-align: right;
  flex-shrink: 0;
}

/* controls row */
.scope-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.scope-btn-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.scope-group-lbl {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #8b949e;
  margin-right: 4px;
  white-space: nowrap;
}

.scope-sep {
  width: 1px;
  height: 32px;
  background: var(--border);
  flex-shrink: 0;
}

.btn-xs {
  font-size: 10px;
  padding: 3px 7px;
}

.scope-btn {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color .15s, color .15s, background .15s;
  white-space: nowrap;
}

.scope-btn:hover {
  border-color: var(--accent);
  color: var(--text);
}

.scope-btn--active {
  background: color-mix(in srgb, var(--accent) 15%, var(--surface2));
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}

.scope-color-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 3px 10px;
  white-space: nowrap;
}

.scope-color-btn .scope-group-lbl {
  margin-right: 0;
}

/* ── Footer ── */
.footer {
  padding: 8px 20px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.footer-fw {
  font-family: var(--font-mono);
  color: var(--text-dim, #9ca3af);
  letter-spacing: 0.04em;
}

/* ── DNR wheel wrapper ── */
.dnr-wrap { display: inline-flex; }
.dnr-wrap--active { cursor: ns-resize; }

/* ── CTCSS / DCS tone picker modals ── */
.tone-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, .65);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tone-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 16px 48px rgba(0, 0, 0, .85);
  width: 360px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tone-modal--dcs {
  width: 450px;
}

.tone-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 9px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tone-modal-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--text-dim, #9ca3af);
}

.tone-modal-close {
  background: none;
  border: none;
  color: var(--text-dim, #9ca3af);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background .1s, color .1s;
}

.tone-modal-close:hover {
  background: rgba(255, 255, 255, .1);
  color: var(--text);
}

.ctcss-tone-grid,
.dcs-code-grid {
  padding: 10px;
  overflow-y: auto;
  display: grid;
  gap: 4px;
}

.ctcss-tone-grid {
  grid-template-columns: repeat(5, 1fr);
}

.dcs-code-grid {
  grid-template-columns: repeat(6, 1fr);
}

.ctcss-tone-btn {
  font-size: 10px;
  padding: 6px 2px;
  background: var(--surface-2, #1e2330);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  cursor: pointer;
  text-align: center;
  transition: background .1s, border-color .1s, outline .1s;
  outline: none;
}

.ctcss-tone-btn:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 1px;
}

.ctcss-tone-btn:hover {
  background: rgba(59, 130, 246, .25);
  border-color: #3b82f6;
  color: #93c5fd;
}

.ctcss-tone-btn--active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
  font-weight: 700;
}

/* ── Modal dialogs ───────────────────────────────────────────────── */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  max-height: 95vh;
  overflow: hidden;
}

.modal-half {
  width: 50%;
  min-width: 400px;
}

.modal-wide {
  width: 90%;
  max-width: 1400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text);
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 20px;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  transition: background 0.2s, color 0.2s;
}

.modal-close:hover {
  background: var(--surface2);
  color: var(--text);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* ── Appearance settings ─────────────────────────────────────────── */

.btn-icon {
  padding: 6px 10px;
  line-height: 1;
  font-size: 16px;
}

.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.settings-panel {
  width: min(440px, 100vw);
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -4px 0 16px rgba(0, 0, 0, .4);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--surface2);
}

.settings-header h2 {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text);
}

.settings-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  line-height: 1;
}

.settings-close:hover { color: var(--text); }

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.settings-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 18px;
  line-height: 1.5;
}

.settings-hint--tight {
  margin: -4px 0 10px;
}

.settings-font-hint {
  font-size: 10px;
  color: var(--text-muted);
  margin: 6px 0 0;
  line-height: 1.4;
}

.settings-subhead {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin: 14px 0 8px;
}

.settings-row--disabled {
  opacity: 0.45;
  pointer-events: none;
}

.settings-row--delay .settings-delay-input {
  max-width: 120px;
  min-width: 72px;
}

.settings-section { margin-bottom: 22px; }

.settings-section h3 {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.settings-row {
  display: grid;
  grid-template-columns: 110px 36px 1fr;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.settings-row--wide {
  grid-template-columns: 110px 1fr;
}

/* Checkbox row: flex full width (must follow .settings-row — grid was squeezing text into 36px) */
.settings-row.settings-row--check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  cursor: pointer;
  white-space: normal;
}

.settings-row.settings-row--check input[type=checkbox] {
  margin-top: 3px;
  flex-shrink: 0;
}

.settings-row.settings-row--check .settings-check-text {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
  white-space: normal;
}

.settings-row label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
}

.settings-row input[type=color] {
  width: 36px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 3px;
  cursor: pointer;
}

.settings-row input[type=color]::-webkit-color-swatch-wrapper { padding: 2px; }
.settings-row input[type=color]::-webkit-color-swatch { border: none; border-radius: 2px; }

.settings-hex,
.settings-select {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  border-radius: 3px;
  width: 100%;
  outline: none;
}

.settings-hex:focus,
.settings-select:focus {
  border-color: var(--accent);
}

.settings-row input[type=range] {
  width: 100%;
  accent-color: var(--accent);
}

.settings-val {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.settings-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.settings-foot-hint {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* ── Macro quick-run dropdown ────────────────────────────────────────── */

.macro-quickrun {
  position: relative;
}

.macro-quickrun-caret {
  margin-left: 4px;
  font-size: 9px;
  opacity: 0.8;
}

.macro-quickrun-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 240px;
  max-width: 320px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.macro-quickrun-head {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface2);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.macro-quickrun-disabled-hint {
  color: var(--yellow);
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
  font-size: 9px;
}

.macro-quickrun-menu ul {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 260px;
  overflow-y: auto;
}

.macro-quickrun-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
}

.macro-quickrun-run {
  flex: 1;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.macro-quickrun-run:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}
.macro-quickrun-run small {
  color: var(--text-muted);
  font-size: 10px;
  margin-left: 4px;
}
.macro-quickrun-run:disabled { opacity: 0.4; cursor: default; }

.macro-quickrun-edit {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.macro-quickrun-edit:hover { color: var(--accent); background: var(--surface2); }

.macro-quickrun-empty {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  padding: 14px 12px;
  text-align: center;
}

.macro-quickrun-foot {
  padding: 6px;
  border-top: 1px solid var(--border);
  background: var(--surface2);
}

.macro-quickrun-new {
  width: 100%;
  background: none;
  border: 1px dashed var(--border);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.macro-quickrun-new:hover { border-color: var(--accent); background: var(--surface); }

/* ── Macro toast ─────────────────────────────────────────────────────── */

.macro-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2000;
  min-width: 240px;
  max-width: 420px;
  padding: 10px 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  animation: macroToastIn 0.18s ease-out;
}
.macro-toast.ok  { border-color: var(--green); color: var(--green); }
.macro-toast.err { border-color: var(--red);   color: var(--red); }

@keyframes macroToastIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
