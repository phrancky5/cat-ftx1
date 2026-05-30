// ─────────────────────────────────────────────────────────────────────────
// FTX-1 CAT Command Catalogue + Smart Validator
//
// Authoritative reference parsed from the Yaesu "CAT Operation Reference
// Manual" for the FTX-1 series (`docs/CAT-FTX1.pdf`). Single source of
// truth for:
//
//   • PresetBuilder.vue command dropdown (datalist suggestions).
//   • The smart parameter validator (validateStep) — block save on errors,
//     warn on out-of-range / conditional unknowns.
//   • The "?" help modal's sortable quick-reference table.
//
// Conventions
// ───────────
// • `manualPage` is the PRINTED page number shown at the bottom of each
//   manual page (1..27), not the PDF page index.
// • For SET-form parameters only — presets always issue SET commands.
//   Read-only commands (ID, IF, MR, OI, RI, RM, SM, VE) are still listed
//   with `supports.set = false` so the validator can warn when an operator
//   tries to use them in a preset.
// • For commands whose parameter layout is conditional on an earlier P
//   value (CF, BP, ML, PA, PB, PC, SS, …) we model the fixed prefix and
//   describe the variable suffix via `conditional` notes; the validator
//   then only enforces total digit count + character set on those segments.
// ─────────────────────────────────────────────────────────────────────────

export type CommandCategory =
  | 'frequency'
  | 'vfo'
  | 'mode'
  | 'band'
  | 'filter'
  | 'memory'
  | 'power'
  | 'audio'
  | 'ptt'
  | 'tuner'
  | 'menu'
  | 'status'
  | 'misc'

export interface CommandSupports {
  set: boolean
  read: boolean
  answer: boolean
  ai: boolean
}

export type ParamType =
  | 'enum'        // discrete value in `enum`
  | 'int_range'   // digit-only integer, min..max inclusive
  | 'signed_int'  // sign char + digits (single combined param)
  | 'sign'        // single '+' or '-' character
  | 'fixed'       // single literal value (e.g. '0')
  | 'string'      // free-form ASCII (manual-allowed character set)
  | 'any'         // length known, content rules conditional on other Pn

export interface ParamDef {
  name: string                         // 'P1', 'P2', …
  label: string
  digits: number                       // exact char width; -1 = variable
  type: ParamType
  enum?: ReadonlyArray<{ value: string; label: string }>
  min?: number
  max?: number
  fixed?: string
  hint?: string
  conditional?: string                 // doc only; meaning depends on other Pn
}

export interface CommandDef {
  code: string                         // upper-case 2 letters
  name: string                         // human-readable, as printed in the manual
  category: CommandCategory
  supports: CommandSupports
  /**
   * 'none'     — no parameter (e.g. AB, AM, ID, QI, SV, UP, DN, MA, MB, BA).
   * 'fixed'    — exactly `paramTotalDigits` parameter chars.
   * 'variable' — length can vary; `paramTotalDigits` is a {min,max} range.
   */
  setForm: 'none' | 'fixed' | 'variable'
  paramTotalDigits: number | { min: number; max: number }
  params: ReadonlyArray<ParamDef>
  paramDefault?: string
  description: string
  manualPage: number
  examples?: ReadonlyArray<string>
}

// ─────────────────────────────────────────────────────────────────────────
// Shared param fragments — keep the catalogue compact and consistent.
// ─────────────────────────────────────────────────────────────────────────

const SIDE_PARAM: ParamDef = {
  name: 'P1',
  label: 'Side',
  digits: 1,
  type: 'enum',
  enum: [
    { value: '0', label: 'MAIN-side' },
    { value: '1', label: 'SUB-side' },
  ],
}

const MODE_PARAM_ENUM: ReadonlyArray<{ value: string; label: string }> = [
  { value: '1', label: 'LSB' },
  { value: '2', label: 'USB' },
  { value: '3', label: 'CW-U' },
  { value: '4', label: 'FM' },
  { value: '5', label: 'AM' },
  { value: '6', label: 'RTTY-L' },
  { value: '7', label: 'CW-L' },
  { value: '8', label: 'DATA-L' },
  { value: '9', label: 'RTTY-U' },
  { value: 'A', label: 'DATA-FM' },
  { value: 'B', label: 'FM-N' },
  { value: 'C', label: 'DATA-U' },
  { value: 'D', label: 'AM-N' },
  { value: 'E', label: 'PSK' },
  { value: 'F', label: 'DATA-FM-N' },
  { value: 'H', label: 'C4FM-DN' },
  { value: 'I', label: 'C4FM-VW' },
]

// ─────────────────────────────────────────────────────────────────────────
// CATALOGUE — ordered alphabetically by code (mirrors the manual).
// ─────────────────────────────────────────────────────────────────────────

export const CAT_COMMANDS: ReadonlyArray<CommandDef> = [
  // ── A ────────────────────────────────────────────────────────────────
  {
    code: 'AB',
    name: 'MAIN-side to SUB-side',
    category: 'vfo',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Copies MAIN-side frequency/mode/etc. to the SUB-side.',
    manualPage: 6,
    examples: ['AB;'],
  },
  {
    code: 'AC',
    name: 'Antenna Tuner Control',
    category: 'tuner',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 3,
    params: [
      { name: 'P1', label: 'Tuner type', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'Internal (FTX-1 optima)' },
        { value: '1', label: 'External' },
      ] },
      { name: 'P2', label: 'Subtype', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'External Antenna Tuner' },
        { value: '2', label: 'ATAS' },
      ] },
      { name: 'P3', label: 'Action', digits: 1, type: 'any',
        conditional: 'P2=0 (Tuner): 0=OFF, 1=ON, 3=Tuning Start. P2=2 (ATAS): 0=Stop, 1=Freq+, 2=Freq-, 3=Start' },
    ],
    paramDefault: '000',
    description: 'Operate the antenna tuner / ATAS controller.',
    manualPage: 6,
  },
  {
    code: 'AG',
    name: 'AF Gain',
    category: 'audio',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 4,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Level', digits: 3, type: 'int_range', min: 0, max: 255 },
    ],
    paramDefault: '0080',
    description: 'Set the audio (volume) level for the chosen side. P2 is 0–255.',
    manualPage: 6,
    examples: ['0080  → MAIN ≈ 80', '1100  → SUB ≈ 100'],
  },
  {
    code: 'AI',
    name: 'Auto Information',
    category: 'status',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'On/Off', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '1',
    description:
      'Enable / disable automatic status reports. When ON, state changes are pushed to the host. Per-port (CAT-1/2/3); reset to OFF on power-off.',
    manualPage: 6,
  },
  {
    code: 'AM',
    name: 'MAIN-side to Memory Channel',
    category: 'memory',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Store current MAIN-side state to the currently-selected memory channel.',
    manualPage: 6,
  },
  {
    code: 'AO',
    name: 'AMC Output Level',
    category: 'audio',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 3,
    params: [
      { name: 'P1', label: 'AMC level', digits: 3, type: 'int_range', min: 1, max: 100 },
    ],
    paramDefault: '050',
    description: 'Set the Automatic Microphone Compressor output level. Range 001–100.',
    manualPage: 6,
  },

  // ── B ────────────────────────────────────────────────────────────────
  {
    code: 'BA',
    name: 'SUB-side to MAIN-side',
    category: 'vfo',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Copies SUB-side frequency/mode/etc. to the MAIN-side.',
    manualPage: 6,
  },
  {
    code: 'BC',
    name: 'Auto Notch (DNF)',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'On/Off', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '01',
    description: 'Toggle the digital auto-notch filter for the chosen side.',
    manualPage: 7,
  },
  {
    code: 'BD',
    name: 'Band Down',
    category: 'band',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [SIDE_PARAM],
    paramDefault: '0',
    description: 'Step the selected side down to the next amateur band.',
    manualPage: 7,
  },
  {
    code: 'BI',
    name: 'Break-In',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'On/Off', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '1',
    description: 'Toggle CW Break-In keying.',
    manualPage: 7,
  },
  {
    code: 'BM',
    name: 'SUB-side to Memory Channel',
    category: 'memory',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Store current SUB-side state to the currently-selected memory channel.',
    manualPage: 7,
  },
  {
    code: 'BP',
    name: 'Manual Notch',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 5,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Function', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'ON/OFF' },
        { value: '1', label: 'Notch frequency' },
      ] },
      { name: 'P3', label: 'Value', digits: 3, type: 'any',
        conditional: 'P2=0: 000=OFF, 001=ON. P2=1: 001-320 (NOTCH frequency × 10 Hz)' },
    ],
    paramDefault: '00001',
    description: 'Configure the manual notch filter. P3 meaning depends on P2.',
    manualPage: 7,
  },
  {
    code: 'BS',
    name: 'Band Select',
    category: 'band',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 3,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Band', digits: 2, type: 'enum', enum: [
        { value: '00', label: '1.8 MHz' },
        { value: '01', label: '3.5 MHz' },
        { value: '02', label: '5 MHz' },
        { value: '03', label: '7 MHz' },
        { value: '04', label: '10 MHz' },
        { value: '05', label: '14 MHz' },
        { value: '06', label: '18 MHz' },
        { value: '07', label: '21 MHz' },
        { value: '08', label: '24.5 MHz' },
        { value: '09', label: '28 MHz' },
        { value: '10', label: '50 MHz' },
        { value: '11', label: '70 MHz / GEN' },
        { value: '12', label: 'AIR' },
        { value: '13', label: '144 MHz' },
        { value: '14', label: '430 MHz' },
      ] },
    ],
    paramDefault: '013',
    description: 'Switch the selected side to a specific amateur band.',
    manualPage: 7,
    examples: ['005  → MAIN, 14 MHz', '113  → SUB, 144 MHz'],
  },
  {
    code: 'BU',
    name: 'Band Up',
    category: 'band',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [SIDE_PARAM],
    paramDefault: '0',
    description: 'Step the selected side up to the next amateur band.',
    manualPage: 7,
  },

  // ── C ────────────────────────────────────────────────────────────────
  {
    code: 'CF',
    name: 'Clarifier (CLAR) On/Off',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 8,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: '(Fixed)', digits: 1, type: 'fixed', fixed: '0' },
      { name: 'P3', label: 'Mode', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'CLAR Setting' },
        { value: '1', label: 'CLAR Frequency' },
      ] },
      { name: 'P4..P8', label: 'Payload', digits: 5, type: 'any',
        conditional: 'P3=0 (Setting): P4 RX-CLAR (0/1), P5 TX-CLAR (0/1), P6-P8 fixed 0. P3=1 (Frequency): P4 sign (+/-), P5-P8 0000-9999 Hz.' },
    ],
    paramDefault: '00000000',
    description: 'Read/configure the Clarifier (CLAR). Set mode (RX/TX on/off) or set frequency offset.',
    manualPage: 8,
  },
  {
    code: 'CH',
    name: 'Channel Up/Down',
    category: 'memory',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'Direction', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'Channel UP' },
        { value: '1', label: 'Channel DOWN' },
      ] },
    ],
    paramDefault: '0',
    description: 'Step memory channel up or down.',
    manualPage: 8,
  },
  {
    code: 'CN',
    name: 'CTCSS Tone Frequency / DCS Code',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 5,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Type', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'CTCSS' },
        { value: '1', label: 'DCS' },
      ] },
      { name: 'P3', label: 'Code', digits: 3, type: 'any',
        conditional: 'P2=0: 000-049 (CTCSS Tone, Table 1). P2=1: 000-103 (DCS Code, Table 2).' },
    ],
    paramDefault: '00000',
    description: 'Pick CTCSS tone or DCS code from the manual\'s Tables 1 / 2.',
    manualPage: 8,
  },
  {
    code: 'CO',
    name: 'Contour / APF',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 6,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Function', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'CONTOUR on/off' },
        { value: '1', label: 'CONTOUR FREQ' },
        { value: '2', label: 'APF on/off' },
        { value: '3', label: 'APF FREQ' },
      ] },
      { name: 'P3', label: 'Value', digits: 4, type: 'any',
        conditional: 'P2=0: 0000=OFF, 0001=ON. P2=1: 0010-3200 (Hz). P2=2: 0000=OFF, 0001=ON. P2=3: 0000-0050 (-250..+250 Hz, 10 Hz step).' },
    ],
    paramDefault: '000001',
    description: 'Contour filter / Audio Peak Filter (APF) configuration.',
    manualPage: 8,
  },
  {
    code: 'CS',
    name: 'CW Spot',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'On/Off', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '1',
    description: 'Toggle CW SPOT (zero-beat helper tone).',
    manualPage: 9,
  },
  {
    code: 'CT',
    name: 'SQL Type (CTCSS / DCS)',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Squelch type', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'CTCSS ENC on / DEC off' },
        { value: '2', label: 'CTCSS ENC on / DEC on' },
        { value: '3', label: 'DCS on' },
        { value: '4', label: 'PR FREQ' },
        { value: '5', label: 'REV TONE' },
      ] },
    ],
    paramDefault: '00',
    description: 'Select the tone-squelch / DCS mode for the chosen side.',
    manualPage: 9,
  },

  // ── D ────────────────────────────────────────────────────────────────
  {
    code: 'DA',
    name: 'Dimmer / Contrast',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 8,
    params: [
      { name: 'P1', label: '(Fixed)', digits: 2, type: 'fixed', fixed: '00' },
      { name: 'P2', label: 'TFT Contrast', digits: 2, type: 'int_range', min: 0, max: 20 },
      { name: 'P3', label: 'TFT Brightness', digits: 2, type: 'int_range', min: 0, max: 20 },
      { name: 'P4', label: 'LED Brightness', digits: 2, type: 'int_range', min: 0, max: 20 },
    ],
    paramDefault: '00101010',
    description: 'TFT contrast / TFT brightness / LED brightness, each 00–20.',
    manualPage: 9,
  },
  {
    code: 'DN',
    name: 'MIC Down',
    category: 'misc',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Simulate one MIC DOWN press.',
    manualPage: 9,
  },
  {
    code: 'DT',
    name: 'Date and Time',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'variable',
    paramTotalDigits: { min: 7, max: 9 },
    params: [
      { name: 'P1', label: 'Kind', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'Date (yyyymmdd, 8 digits)' },
        { value: '1', label: 'Time (hhmmss, 6 digits, 24-hour)' },
      ] },
      { name: 'P2', label: 'Value', digits: -1, type: 'any',
        conditional: 'P1=0: yyyymmdd (8 digits). P1=1: hhmmss (6 digits).' },
    ],
    description: 'Set or read date and time. Payload length depends on P1.',
    manualPage: 9,
    examples: ['020260527  → set date 2026-05-27', '1224530    → set time 22:45:30'],
  },

  // ── E ────────────────────────────────────────────────────────────────
  {
    code: 'EO',
    name: 'Encoder Offset',
    category: 'misc',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 7,
    params: [
      { name: 'P1', label: 'Side', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'MAIN-side' },
        { value: '1', label: 'SUB-side' },
        { value: '2', label: 'Both' },
      ] },
      { name: 'P2', label: 'Knob', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'MAIN dial' },
        { value: '1', label: 'FUNC knob' },
      ] },
      { name: 'P3', label: 'Direction', digits: 1, type: 'sign' },
      { name: 'P4', label: 'Step unit', digits: 1, type: 'any',
        conditional: 'P2=0: 0=Hz, 1=kHz, 2=MHz. P2=1: 0=fix.' },
      { name: 'P5', label: 'Count', digits: 3, type: 'int_range', min: 0, max: 999 },
    ],
    paramDefault: '00+0001',
    description: 'Issue a synthetic dial-encoder click pattern (advanced).',
    manualPage: 9,
  },
  {
    code: 'EX',
    name: 'Extended Menu',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'variable',
    paramTotalDigits: { min: 6, max: 100 },
    params: [
      { name: 'P1+P2+P3', label: 'Menu address (P1×2 + P2×2 + P3×2)', digits: 6, type: 'any',
        hint: 'Six digits identifying the menu item. Refer to manual Table 3.' },
      { name: 'P4', label: 'Value', digits: -1, type: 'string',
        hint: 'Length and format depend on the menu item (see Table 3).' },
    ],
    description:
      'Read or write a menu item under one of the menu trees: 01 RADIO SETTING, 02 CW SETTING, 03 OPERATION SETTING, 04 DISPLAY SETTING, 05 EXTENSION, 06 APRS SETTING, 07 APRS BEACON. The 6-digit prefix selects the item; the trailing value depends on its type (see manual Table 3).',
    manualPage: 9,
    examples: ['0601013  → RADIO/MODE-SSB/AGC-FAST-DELAY = 13'],
  },

  // ── F ────────────────────────────────────────────────────────────────
  {
    code: 'FA',
    name: 'Frequency VFO MAIN-side',
    category: 'frequency',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 9,
    params: [
      { name: 'P1', label: 'Frequency (Hz)', digits: 9, type: 'int_range', min: 30000, max: 470000000 },
    ],
    paramDefault: '014250000',
    description: 'Set or read the MAIN-side VFO frequency. P1 is 9 digits, zero-padded, in Hz. Range 30 kHz – 470 MHz.',
    manualPage: 16,
    examples: ['014250000  → 14.250000 MHz', '144800000  → 144.800 MHz'],
  },
  {
    code: 'FB',
    name: 'Frequency VFO SUB-side',
    category: 'frequency',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 9,
    params: [
      { name: 'P1', label: 'Frequency (Hz)', digits: 9, type: 'int_range', min: 30000, max: 470000000 },
    ],
    paramDefault: '144800000',
    description: 'Set or read the SUB-side VFO frequency. P1 is 9 digits, zero-padded, in Hz. Range 30 kHz – 470 MHz.',
    manualPage: 16,
    examples: ['144800000  → 144.800 MHz'],
  },
  {
    code: 'FN',
    name: 'Fine Tuning',
    category: 'frequency',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'Mode', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'Fine Tuning ON' },
        { value: '2', label: 'Fast Tuning ON' },
      ] },
    ],
    paramDefault: '0',
    description: 'Switch between normal / fine / fast tuning step.',
    manualPage: 16,
  },
  {
    code: 'FR',
    name: 'Function RX',
    category: 'mode',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: 'Receive function', digits: 2, type: 'enum', enum: [
        { value: '00', label: 'Dual receive' },
        { value: '01', label: 'Single receive' },
      ] },
    ],
    paramDefault: '00',
    description: 'Dual or single receive function.',
    manualPage: 16,
  },
  {
    code: 'FT',
    name: 'Function TX',
    category: 'mode',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'Transmit on', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'MAIN-side TX' },
        { value: '1', label: 'SUB-side TX' },
      ] },
    ],
    paramDefault: '0',
    description: 'Select which side transmits.',
    manualPage: 16,
  },

  // ── G ────────────────────────────────────────────────────────────────
  {
    code: 'GP',
    name: 'GP OUT A/B/C/D',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 4,
    params: [
      { name: 'P1', label: 'GP OUT A', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'LOW' }, { value: '1', label: 'HIGH' } ] },
      { name: 'P2', label: 'GP OUT B', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'LOW' }, { value: '1', label: 'HIGH' } ] },
      { name: 'P3', label: 'GP OUT C', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'LOW' }, { value: '1', label: 'HIGH' } ] },
      { name: 'P4', label: 'GP OUT D', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'LOW' }, { value: '1', label: 'HIGH' } ] },
    ],
    paramDefault: '0000',
    description:
      'Set the four general-purpose CMOS outputs (TUN/LIN jack) when [TUN/LIN PORT SELECT] = "GPO". 5 V CMOS, max 3 mA.',
    manualPage: 17,
  },
  {
    code: 'GT',
    name: 'AGC Function',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'AGC (Set)', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'FAST' },
        { value: '2', label: 'MID' },
        { value: '3', label: 'SLOW' },
        { value: '4', label: 'AUTO' },
      ] },
    ],
    paramDefault: '04',
    description: 'AGC speed. NOTE: Answer form returns extended P3 codes (0–6) including AUTO-FAST/MID/SLOW.',
    manualPage: 17,
  },

  // ── I ────────────────────────────────────────────────────────────────
  {
    code: 'ID',
    name: 'Identification',
    category: 'status',
    supports: { set: false, read: true, answer: true, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Radio identification — answer is fixed "0840". Read-only.',
    manualPage: 17,
  },
  {
    code: 'IF',
    name: 'Information (MAIN-side)',
    category: 'status',
    supports: { set: false, read: true, answer: true, ai: true },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description:
      'Bulk status block for the MAIN-side (frequency, clarifier, RX/TX clar flags, mode, source, CTCSS, repeater shift). Read-only.',
    manualPage: 17,
  },
  {
    code: 'IS',
    name: 'IF Shift',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 7,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: '(Fixed)', digits: 1, type: 'fixed', fixed: '0' },
      { name: 'P3', label: 'Direction', digits: 1, type: 'sign' },
      { name: 'P4', label: 'Offset (Hz)', digits: 4, type: 'int_range', min: 0, max: 1200,
        hint: '0000-1200, 20 Hz steps' },
    ],
    paramDefault: '00+0000',
    description: 'Set IF-shift for the chosen side. Sign followed by 4-digit Hz offset (0–1200 Hz, 20 Hz steps).',
    manualPage: 17,
    examples: ['00+0200  → MAIN, +200 Hz', '01-0500  → SUB, -500 Hz'],
  },

  // ── K ────────────────────────────────────────────────────────────────
  {
    code: 'KM',
    name: 'CW Keyer Memory',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'variable',
    paramTotalDigits: { min: 1, max: 51 },
    params: [
      { name: 'P1', label: 'Memory channel', digits: 1, type: 'int_range', min: 1, max: 5 },
      { name: 'P2', label: 'Message text', digits: -1, type: 'string',
        hint: 'Up to 50 ASCII characters.' },
    ],
    description: 'Store a CW keyer memory message (1–5).',
    manualPage: 17,
  },
  {
    code: 'KP',
    name: 'CW Key Pitch',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: 'Pitch index', digits: 2, type: 'int_range', min: 0, max: 75,
        hint: '00=300 Hz … 75=1050 Hz (10 Hz steps).' },
    ],
    paramDefault: '20',
    description: 'CW key pitch frequency. 00 = 300 Hz, …, 75 = 1050 Hz.',
    manualPage: 18,
  },
  {
    code: 'KR',
    name: 'CW Keyer',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'On/Off', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '1',
    description: 'Enable the internal CW keyer.',
    manualPage: 18,
  },
  {
    code: 'KS',
    name: 'CW Keyer Speed',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 3,
    params: [
      { name: 'P1', label: 'Speed (WPM)', digits: 3, type: 'int_range', min: 4, max: 60 },
    ],
    paramDefault: '020',
    description: 'CW keyer speed in WPM (004–060).',
    manualPage: 18,
  },
  {
    code: 'KY',
    name: 'CW Keying Memory Play',
    category: 'ptt',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: 'Memory bank', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'CW TEXT' },
        { value: '1', label: 'CW MESSAGE' },
      ] },
      { name: 'P2', label: 'Action', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'STOP' },
        { value: '1', label: 'Play CH 1' },
        { value: '2', label: 'Play CH 2' },
        { value: '3', label: 'Play CH 3' },
        { value: '4', label: 'Play CH 4' },
        { value: '5', label: 'Play CH 5' },
      ] },
    ],
    paramDefault: '00',
    description: 'Start / stop CW memory playback.',
    manualPage: 18,
  },

  // ── L ────────────────────────────────────────────────────────────────
  {
    code: 'LK',
    name: 'Lock',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'On/Off', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '1',
    description: 'Lock the front-panel controls.',
    manualPage: 18,
  },
  {
    code: 'LM',
    name: 'Load Message (DVS)',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: 'Function', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'MESSAGE' },
        { value: '1', label: 'RECORD' },
      ] },
      { name: 'P2', label: 'Action', digits: 1, type: 'any',
        conditional: 'P1=0 (MESSAGE): 0=Stop, 1-5=Play CH 1..5. P1=1 (RECORD): 0=Stop, 1=Start.' },
    ],
    paramDefault: '00',
    description: 'Digital Voice Storage — play or record voice memory.',
    manualPage: 18,
  },

  // ── M ────────────────────────────────────────────────────────────────
  {
    code: 'MA',
    name: 'Memory Channel to VFO MAIN-side',
    category: 'memory',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Recall current memory channel content onto the MAIN-side VFO.',
    manualPage: 18,
  },
  {
    code: 'MB',
    name: 'Memory Channel to VFO SUB-side',
    category: 'memory',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Recall current memory channel content onto the SUB-side VFO.',
    manualPage: 19,
  },
  {
    code: 'MC',
    name: 'Memory Channel',
    category: 'memory',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 6,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Channel', digits: 5, type: 'any',
        hint: '00001-00999 (memory channel), P-01L..P-50U (PMS), 50000-50020 (5 MHz), EMGCH.' },
    ],
    paramDefault: '000001',
    description: 'Select a memory channel for the chosen side.',
    manualPage: 19,
  },
  {
    code: 'MD',
    name: 'Operating Mode',
    category: 'mode',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Mode', digits: 1, type: 'enum', enum: MODE_PARAM_ENUM },
    ],
    paramDefault: '02',
    description: 'Set/read the operating mode. P1 = MAIN/SUB, P2 = mode code (LSB=1, USB=2, CW-U=3, FM=4, …).',
    manualPage: 19,
    examples: ['02  → MAIN, USB', '14  → SUB, FM'],
  },
  {
    code: 'MG',
    name: 'MIC Gain',
    category: 'audio',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 3,
    params: [
      { name: 'P1', label: 'MIC gain', digits: 3, type: 'int_range', min: 0, max: 100 },
    ],
    paramDefault: '050',
    description: 'Microphone gain 000–100.',
    manualPage: 19,
  },
  {
    code: 'ML',
    name: 'Monitor Level',
    category: 'audio',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 4,
    params: [
      { name: 'P1', label: 'Function', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'MONI on/off' },
        { value: '1', label: 'MONI level' },
      ] },
      { name: 'P2', label: 'Value', digits: 3, type: 'any',
        conditional: 'P1=0: 000=OFF, 001=ON. P1=1: 000-100 level.' },
    ],
    paramDefault: '0001',
    description: 'Monitor (sidetone) level. P2 meaning depends on P1.',
    manualPage: 19,
  },
  {
    code: 'MR',
    name: 'Memory Channel Read',
    category: 'memory',
    supports: { set: false, read: true, answer: true, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Read the contents of a memory channel (read-only command).',
    manualPage: 19,
  },
  {
    code: 'MS',
    name: 'Meter Switch',
    category: 'status',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: 'MAIN meter', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'PO' }, { value: '1', label: 'COMP' },
        { value: '2', label: 'ALC' }, { value: '3', label: 'VDD' },
        { value: '4', label: 'ID' }, { value: '5', label: 'SWR' },
      ] },
      { name: 'P2', label: 'SUB meter', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'PO' }, { value: '1', label: 'COMP' },
        { value: '2', label: 'ALC' }, { value: '3', label: 'VDD' },
        { value: '4', label: 'ID' }, { value: '5', label: 'SWR' },
      ] },
    ],
    paramDefault: '00',
    description: 'Select what each meter displays.',
    manualPage: 20,
  },
  {
    code: 'MT',
    name: 'Memory Channel Tag Write',
    category: 'memory',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'variable',
    paramTotalDigits: { min: 6, max: 17 },
    params: [
      { name: 'P0', label: 'Channel', digits: 5, type: 'any',
        hint: '00001-00099 / P-01L..P-50U / 50001-50009 / EMGCH.' },
      { name: 'P1', label: 'Tag', digits: -1, type: 'string',
        hint: 'Up to 12 ASCII characters.' },
    ],
    description: 'Write an alphanumeric tag to a memory channel.',
    manualPage: 20,
  },
  {
    code: 'MW',
    name: 'Memory Channel Write',
    category: 'memory',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 28,
    params: [
      { name: 'P1', label: 'Channel', digits: 5, type: 'any',
        hint: '00000 = - / 00001-00999 / P-01L..P-50U.' },
      { name: 'P2', label: 'Frequency (Hz)', digits: 9, type: 'int_range', min: 30000, max: 470000000 },
      { name: 'P3', label: 'Clar offset', digits: 5, type: 'any', hint: 'Sign + 4-digit offset (0000-9990 Hz).' },
      { name: 'P4', label: 'RX CLAR', digits: 1, type: 'enum', enum: [{value:'0',label:'OFF'},{value:'1',label:'ON'}] },
      { name: 'P5', label: 'TX CLAR', digits: 1, type: 'enum', enum: [{value:'0',label:'OFF'},{value:'1',label:'ON'}] },
      { name: 'P6', label: 'Mode', digits: 1, type: 'enum', enum: MODE_PARAM_ENUM },
      { name: 'P7', label: 'Storage', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'VFO' }, { value: '1', label: 'Memory' },
        { value: '2', label: 'MT' }, { value: '3', label: 'QMB' },
        { value: '5', label: 'PMS' },
      ] },
      { name: 'P8', label: 'Tone-squelch', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' }, { value: '1', label: 'CTCSS ENC/DEC' },
        { value: '2', label: 'CTCSS ENC' }, { value: '3', label: 'DCS' },
        { value: '4', label: 'PR FREQ' }, { value: '5', label: 'REV TONE' },
      ] },
      { name: 'P9', label: '(Fixed)', digits: 2, type: 'fixed', fixed: '00' },
      { name: 'P10', label: 'Repeater shift', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'Simplex' },
        { value: '1', label: 'Plus shift' },
        { value: '2', label: 'Minus shift' },
      ] },
    ],
    description: 'Write a complete memory channel record. Many parameters — see manual for the full P-field layout.',
    manualPage: 20,
  },
  {
    code: 'MX',
    name: 'MOX',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'MOX', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '0',
    description: 'Manual Operate (X-mit) — key/un-key the transmitter via CAT.',
    manualPage: 20,
  },
  {
    code: 'MZ',
    name: 'Split Memory',
    category: 'memory',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 15,
    params: [
      { name: 'P1', label: 'Channel', digits: 5, type: 'any',
        hint: '00000 = VFO/MT/QMB; 00001-00999; P-01L..P-50U.' },
      { name: 'P2', label: 'SPLIT memory', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
      { name: 'P3', label: 'Frequency (Hz)', digits: 9, type: 'int_range', min: 30000, max: 470000000 },
    ],
    description: 'Memorise a split-frequency pair against a channel.',
    manualPage: 20,
  },

  // ── N ────────────────────────────────────────────────────────────────
  {
    code: 'NA',
    name: 'Narrow',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'On/Off', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '00',
    description: 'Toggle the NARROW receive filter.',
    manualPage: 20,
  },
  {
    code: 'NL',
    name: 'Noise Blanker Level',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 4,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'NB level', digits: 3, type: 'int_range', min: 0, max: 10,
        hint: '000 = OFF, 001-010 = NB level.' },
    ],
    paramDefault: '0005',
    description: 'Noise blanker level for the chosen side.',
    manualPage: 21,
  },

  // ── O ────────────────────────────────────────────────────────────────
  {
    code: 'OI',
    name: 'Opposite-band Info (SUB-side)',
    category: 'status',
    supports: { set: false, read: true, answer: true, ai: true },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Bulk status block for the SUB-side (read-only).',
    manualPage: 21,
  },
  {
    code: 'OS',
    name: 'Offset (Repeater Shift)',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Repeater shift', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'Simplex' },
        { value: '1', label: 'Plus shift (+offset)' },
        { value: '2', label: 'Minus shift (-offset)' },
        { value: '3', label: 'ARS (auto)' },
      ] },
    ],
    paramDefault: '00',
    description: 'Repeater offset direction (FM-mode only).',
    manualPage: 21,
  },

  // ── P ────────────────────────────────────────────────────────────────
  {
    code: 'PA',
    name: 'Pre-Amp (IPO)',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: 'Band group', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'HF / 50 MHz' },
        { value: '1', label: 'VHF' },
        { value: '2', label: 'UHF' },
      ] },
      { name: 'P2', label: 'State', digits: 1, type: 'any',
        conditional: 'P1=0: 0=IPO, 1=AMP1, 2=AMP2. P1=1/2: 0=OFF, 1=ON.' },
    ],
    paramDefault: '00',
    description: 'IPO / pre-amp setting. State enum depends on band group.',
    manualPage: 21,
  },
  {
    code: 'PB',
    name: 'Play Back',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: '(Fixed)', digits: 1, type: 'fixed', fixed: '0' },
      { name: 'P2', label: 'Action', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'Stop' },
        { value: '1', label: 'Play CH 1' },
        { value: '2', label: 'Play CH 2' },
        { value: '3', label: 'Play CH 3' },
        { value: '4', label: 'Play CH 4' },
        { value: '5', label: 'Play CH 5' },
      ] },
    ],
    paramDefault: '00',
    description: 'Voice memory playback start/stop.',
    manualPage: 21,
  },
  {
    code: 'PC',
    name: 'Power Control',
    category: 'power',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 4,
    params: [
      { name: 'P1', label: 'Target', digits: 1, type: 'enum', enum: [
        { value: '1', label: 'FTX-1 field head' },
        { value: '2', label: 'SPA-1' },
      ] },
      { name: 'P2', label: 'Power (W)', digits: 3, type: 'int_range', min: 5, max: 100,
        hint: 'P1=1: 005-010 W. P1=2: 005-100 W.' },
    ],
    paramDefault: '1005',
    description: 'RF transmit power. Max range depends on target (head vs SPA-1).',
    manualPage: 21,
    examples: ['1005  → field head, 5 W', '2050  → SPA-1, 50 W'],
  },
  {
    code: 'PL',
    name: 'Speech Processor Level',
    category: 'audio',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 3,
    params: [
      { name: 'P1', label: 'Level', digits: 3, type: 'int_range', min: 0, max: 100,
        hint: '000=OFF, 001-100=level.' },
    ],
    paramDefault: '050',
    description: 'Speech processor compression level (000 = OFF).',
    manualPage: 22,
  },
  {
    code: 'PR',
    name: 'Speech Processor',
    category: 'audio',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: 'Function', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'Speech Processor' },
        { value: '1', label: 'Parametric Mic EQ' },
      ] },
      { name: 'P2', label: 'State', digits: 1, type: 'enum', enum: [
        { value: '1', label: 'OFF' },
        { value: '2', label: 'ON' },
      ] },
    ],
    paramDefault: '02',
    description: 'Speech processor / parametric mic-EQ on or off.',
    manualPage: 22,
  },
  {
    code: 'PS',
    name: 'Power Switch',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'Power', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'POWER OFF' },
      ] },
    ],
    paramDefault: '0',
    description: 'Power off the transceiver. (Only OFF is supported via CAT.)',
    manualPage: 22,
  },

  // ── Q ────────────────────────────────────────────────────────────────
  {
    code: 'QI',
    name: 'QMB Store',
    category: 'memory',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Quick Memory Bank — store current state.',
    manualPage: 22,
  },
  {
    code: 'QR',
    name: 'QMB Recall',
    category: 'memory',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Quick Memory Bank — recall the stored state.',
    manualPage: 22,
  },

  // ── R ────────────────────────────────────────────────────────────────
  {
    code: 'RA',
    name: 'RF Attenuator',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: '(Fixed)', digits: 1, type: 'fixed', fixed: '0' },
      { name: 'P2', label: 'On/Off', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '00',
    description: 'Toggle the RF attenuator.',
    manualPage: 22,
  },
  {
    code: 'RG',
    name: 'RF Gain',
    category: 'audio',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 4,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'RF Gain', digits: 3, type: 'int_range', min: 0, max: 255 },
    ],
    paramDefault: '0255',
    description: 'RF gain 000–255 for the chosen side.',
    manualPage: 22,
  },
  {
    code: 'RI',
    name: 'Radio Information',
    category: 'status',
    supports: { set: false, read: true, answer: true, ai: true },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Bulk read-only flags (Hi-SWR, recording, scan, etc.).',
    manualPage: 22,
  },
  {
    code: 'RL',
    name: 'Noise Reduction Level (DNR)',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 3,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'DNR Level', digits: 2, type: 'int_range', min: 0, max: 10,
        hint: '00 = OFF, 01-10 = level.' },
    ],
    paramDefault: '005',
    description: 'Digital noise-reduction level for the chosen side.',
    manualPage: 23,
  },
  {
    code: 'RM',
    name: 'Read Meter',
    category: 'status',
    supports: { set: false, read: true, answer: true, ai: true },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description:
      'Read meter values (S-meter, COMP, ALC, PO, SWR, IDD, VDD). Read-only.',
    manualPage: 23,
  },

  // ── S ────────────────────────────────────────────────────────────────
  {
    code: 'SC',
    name: 'Scan',
    category: 'memory',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Mode', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'Scan UP' },
        { value: '2', label: 'Scan DOWN' },
      ] },
    ],
    paramDefault: '00',
    description: 'Start or stop frequency / memory scan.',
    manualPage: 23,
  },
  {
    code: 'SD',
    name: 'CW Break-In Delay',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: 'Delay', digits: 2, type: 'int_range', min: 0, max: 33,
        hint: '00=30 ms, 01=50, 02=100, 03=150, 04=200, 05=250, 06=300 … 33=3000 ms (100 ms steps).' },
    ],
    paramDefault: '06',
    description: 'Semi-break-in delay time (CW).',
    manualPage: 23,
  },
  {
    code: 'SF',
    name: 'FUNC Knob Function',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: '(Fixed)', digits: 1, type: 'fixed', fixed: '0' },
      { name: 'P2', label: 'Assignment', digits: 1, type: 'enum', enum: [
        { value: '1', label: 'Scope level' }, { value: '2', label: 'Peak' },
        { value: '3', label: 'Color' },       { value: '4', label: 'Contrast' },
        { value: '5', label: 'Dimmer' },      { value: '7', label: 'MIC gain' },
        { value: '8', label: 'Proc level' },  { value: '9', label: 'AMC level' },
        { value: 'A', label: 'VOX gain' },    { value: 'B', label: 'VOX delay' },
        { value: 'D', label: 'RF power' },    { value: 'E', label: 'Monitor level' },
        { value: 'F', label: 'CW speed' },    { value: 'G', label: 'CW pitch' },
        { value: 'H', label: 'BK-delay' },
      ] },
    ],
    paramDefault: '00',
    description: 'Re-assign the FUNC knob.',
    manualPage: 23,
  },
  {
    code: 'SH',
    name: 'Width (Filter Bandwidth)',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 4,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: '(Fixed)', digits: 1, type: 'fixed', fixed: '0' },
      { name: 'P3', label: 'Bandwidth index', digits: 2, type: 'int_range', min: 0, max: 23,
        hint: 'See manual Table 5 — meaning depends on the active mode.' },
    ],
    paramDefault: '0000',
    description: 'Filter bandwidth, indexed via Table 5 (per-mode chart).',
    manualPage: 24,
  },
  {
    code: 'SM',
    name: 'S-Meter Reading',
    category: 'status',
    supports: { set: false, read: true, answer: true, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Read the S-meter (read-only).',
    manualPage: 24,
  },
  {
    code: 'SQ',
    name: 'Squelch Level',
    category: 'filter',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 4,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Squelch', digits: 3, type: 'int_range', min: 0, max: 255 },
    ],
    paramDefault: '0010',
    description: 'Squelch level for the chosen side.',
    manualPage: 24,
  },
  {
    code: 'SS',
    name: 'Spectrum Scope',
    category: 'menu',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 7,
    params: [
      { name: 'P1', label: '(Fixed)', digits: 1, type: 'fixed', fixed: '0' },
      { name: 'P2', label: 'Parameter', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'SPEED' },
        { value: '1', label: 'PEAK' },
        { value: '2', label: 'MARKER' },
        { value: '3', label: 'COLOR' },
        { value: '4', label: 'LEVEL' },
        { value: '5', label: 'SPAN' },
        { value: '6', label: 'MODE' },
        { value: '7', label: 'AF-FFT / OSC' },
      ] },
      { name: 'P3..P7', label: 'Payload', digits: 5, type: 'any',
        conditional: 'P3..P7 layout depends on P2 — see manual page 25 for the full table per parameter group.' },
    ],
    paramDefault: '0000000',
    description: 'Spectrum-scope configuration. P3..P7 meaning varies by P2.',
    manualPage: 25,
  },
  {
    code: 'ST',
    name: 'Split',
    category: 'vfo',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'Split', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '0',
    description: 'Toggle SPLIT operation.',
    manualPage: 25,
  },
  {
    code: 'SV',
    name: 'Swap VFO',
    category: 'vfo',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Swap MAIN-side and SUB-side.',
    manualPage: 25,
  },

  // ── T ────────────────────────────────────────────────────────────────
  {
    code: 'TS',
    name: 'TXW',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'TXW', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '0',
    description: 'Transmit-watch (TXW) on/off.',
    manualPage: 25,
  },
  {
    code: 'TX',
    name: 'Transmit (TX SET)',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'TX state', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'RADIO TX OFF, CAT TX OFF' },
        { value: '1', label: 'RADIO TX OFF, CAT TX ON' },
        { value: '2', label: 'RADIO TX ON (answer only)' },
      ] },
    ],
    paramDefault: '0',
    description: 'Key the transmitter via CAT (CAT TX ON) or release it.',
    manualPage: 25,
  },

  // ── U ────────────────────────────────────────────────────────────────
  {
    code: 'UP',
    name: 'MIC Up',
    category: 'misc',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Simulate one MIC UP press.',
    manualPage: 26,
  },

  // ── V ────────────────────────────────────────────────────────────────
  {
    code: 'VD',
    name: 'VOX / DATA VOX Delay',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 2,
    params: [
      { name: 'P1', label: 'Delay index', digits: 2, type: 'int_range', min: 0, max: 33,
        hint: '00=30 ms, 01=50, 02=100, …, 33=3000 ms (10 ms multiples beyond index 05).' },
    ],
    paramDefault: '06',
    description: 'VOX (or DATA VOX) delay time.',
    manualPage: 26,
  },
  {
    code: 'VE',
    name: 'Firmware Version',
    category: 'status',
    supports: { set: false, read: true, answer: true, ai: false },
    setForm: 'none',
    paramTotalDigits: 0,
    params: [],
    description: 'Firmware version of a sub-CPU (MAIN/DISPLAY/SDR/DSP/SPA-1/FC-80). Read-only.',
    manualPage: 26,
  },
  {
    code: 'VG',
    name: 'VOX Gain',
    category: 'audio',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 3,
    params: [
      { name: 'P1', label: 'VOX gain', digits: 3, type: 'int_range', min: 0, max: 100 },
    ],
    paramDefault: '050',
    description: 'VOX gain 000–100.',
    manualPage: 26,
  },
  {
    code: 'VM',
    name: 'VFO / Memory Channel',
    category: 'memory',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 3,
    params: [
      SIDE_PARAM,
      { name: 'P2', label: 'Source', digits: 2, type: 'enum', enum: [
        { value: '00', label: 'VFO' },
        { value: '10', label: 'MT' },
        { value: '11', label: 'Memory' },
        { value: '20', label: 'PMS' },
        { value: '21', label: 'P-01L..P-50U' },
        { value: '51', label: '5 MHz Band Memory' },
        { value: '91', label: 'EMG' },
      ] },
    ],
    paramDefault: '000',
    description: 'Switch the chosen side between VFO and memory variants.',
    manualPage: 26,
  },
  {
    code: 'VS',
    name: 'VFO Select',
    category: 'vfo',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'TX/RX assignment', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'MAIN TX/RX, SUB RX' },
        { value: '1', label: 'MAIN RX, SUB TX/RX' },
      ] },
    ],
    paramDefault: '0',
    description: 'Select which side carries the transmit assignment.',
    manualPage: 26,
  },
  {
    code: 'VX',
    name: 'VOX',
    category: 'ptt',
    supports: { set: true, read: true, answer: true, ai: true },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [
      { name: 'P1', label: 'VOX', digits: 1, type: 'enum', enum: [
        { value: '0', label: 'OFF' },
        { value: '1', label: 'ON' },
      ] },
    ],
    paramDefault: '0',
    description: 'Voice-operated transmit (VOX) on/off.',
    manualPage: 26,
  },

  // ── Z ────────────────────────────────────────────────────────────────
  {
    code: 'ZI',
    name: 'Zero In',
    category: 'frequency',
    supports: { set: true, read: false, answer: false, ai: false },
    setForm: 'fixed',
    paramTotalDigits: 1,
    params: [SIDE_PARAM],
    paramDefault: '0',
    description: 'CW auto-zero-in for the chosen side.',
    manualPage: 27,
  },
]

// ─────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────

const CMD_BY_CODE = new Map<string, CommandDef>(
  CAT_COMMANDS.map((c) => [c.code, c]),
)

export function findCommand(code: string): CommandDef | null {
  if (!code) return null
  return CMD_BY_CODE.get(code.toUpperCase()) ?? null
}

/**
 * True iff the given command code is a single-parameter binary toggle —
 * the eligibility predicate for "Toggle switch" presets.
 *
 * A command qualifies when ALL of the following hold:
 *   • the catalogue knows it (otherwise we can't validate it);
 *   • `supports.set === true` AND `supports.read === true`;
 *   • exactly one parameter with `digits === 1`;
 *   • that parameter is an `enum` whose values contain both `'0'` and `'1'`.
 *
 * Initial eligible commands at the time of writing: **BI**, **LK**, **MX**,
 * **ST**, **TS**, **VX**. New 0/1 commands added to the catalogue later
 * automatically become eligible without code changes.
 *
 * Multi-parameter "VFO + 0/1" toggles (RA, NA, BC, …) intentionally do NOT
 * qualify here — they need a VFO picker which is a separate batch.
 */
export function isBinaryToggleCommand(code: string): boolean {
  const def = findCommand(code)
  if (!def) return false
  if (!def.supports.set || !def.supports.read) return false
  if (def.params.length !== 1) return false
  if (def.paramTotalDigits !== 1) return false
  const p = def.params[0]
  if (p.type !== 'enum' || !p.enum) return false
  let has0 = false
  let has1 = false
  for (const e of p.enum) {
    if (e.value === '0') has0 = true
    else if (e.value === '1') has1 = true
  }
  return has0 && has1
}

/**
 * Mapping from binary-toggle CAT command codes to the field on the
 * front-end `TransceiverState` that the (external) serial server already
 * tracks. When a code is present here, the LED reads its state from SSE
 * directly — including front-panel-originated changes. When a code is
 * absent (e.g. `BI`, `TS`), the LED falls back to a local cache that is
 * refreshed by an explicit read on mount and on every click.
 *
 * NOTE: keep this map in lock-step with the `TransceiverState` interface
 * declared in `pages/index.vue`. Adding a new field here without the
 * matching state-server tracking will silently produce a "stuck unknown"
 * LED.
 */
export const TOGGLE_STATE_FIELDS: Readonly<Record<string, string>> = {
  LK: 'lock',
  MX: 'mox',
  ST: 'split',
  VX: 'vox',
  BI: 'breakIn',      // parsed by serial-server.mjs: case 'BI'
  TS: 'txWatch',      // parsed by serial-server.mjs: case 'TS' (TXW / TX Watch)
}

/**
 * Compute a quick human-readable "shape" of the SET form, suitable for the
 * help-modal quick-reference table.
 *
 *   FA → "FA<P1×9>;"
 *   IS → "IS<P1×1><P2×1><sign><P4×4>;"
 *   AB → "AB;"
 */
export function setFormShape(d: CommandDef): string {
  if (d.setForm === 'none') return `${d.code};`
  if (d.setForm === 'variable') {
    const min = typeof d.paramTotalDigits === 'object' ? d.paramTotalDigits.min : d.paramTotalDigits
    const max = typeof d.paramTotalDigits === 'object' ? d.paramTotalDigits.max : d.paramTotalDigits
    return `${d.code}<${min}..${max} chars>;`
  }
  return `${d.code}${d.params
    .map((p) => p.digits === -1 ? `<${p.name}:var>` : `<${p.name}×${p.digits}>`)
    .join('')};`
}

// Legacy adapters — the PresetBuilder.vue UI uses these three fields on the
// command definition (paramType / paramHint / paramLabel / paramDigits /
// paramDefault). Expose them as derived helpers so the UI keeps working.

export function legacyParamType(d: CommandDef): 'none' | 'digits' | 'text' {
  if (d.setForm === 'none' || d.params.length === 0) return 'none'
  const hasStringPart = d.params.some((p) => p.type === 'string' || p.digits === -1)
  if (hasStringPart) return 'text'
  // Pure digit/enum/sign/fixed/int_range — keep "digits" for the spinbox-ish hint
  // (the UI doesn't actually constrain to digits-only here; this is just a label).
  const allNumeric = d.params.every((p) =>
    p.type === 'enum' || p.type === 'int_range' || p.type === 'fixed' || p.type === 'sign' || p.type === 'signed_int' || p.type === 'any')
  return allNumeric ? 'digits' : 'text'
}

export function legacyParamHint(d: CommandDef): string | undefined {
  if (d.params.length === 0) return undefined
  if (d.params.length === 1) {
    const p = d.params[0]
    if (p.hint) return p.hint
    if (p.type === 'int_range' && p.min != null && p.max != null) {
      return `${p.digits} digits, ${String(p.min).padStart(p.digits, '0')}–${String(p.max).padStart(p.digits, '0')}`
    }
    if (p.type === 'enum' && p.enum) {
      return p.enum.map((e) => `${e.value}=${e.label}`).slice(0, 6).join(', ')
        + (p.enum.length > 6 ? ', …' : '')
    }
  }
  // Multi-param: build a structural hint
  return d.params.map((p) =>
    p.digits === -1 ? `${p.name}(var)` : `${p.name}×${p.digits}`,
  ).join(' + ')
}

export function legacyParamLabel(d: CommandDef): string | undefined {
  if (d.params.length === 0) return undefined
  if (d.params.length === 1) return d.params[0].label
  return d.params.map((p) => p.label).join(' / ')
}

export function legacyParamDigits(d: CommandDef): number | undefined {
  if (d.setForm === 'fixed' && typeof d.paramTotalDigits === 'number') {
    return d.paramTotalDigits
  }
  return undefined
}

// ─────────────────────────────────────────────────────────────────────────
// Validation engine
// ─────────────────────────────────────────────────────────────────────────

export type ValidationLevel = 'ok' | 'warn' | 'error'

export interface ValidationIssue {
  level: ValidationLevel
  message: string
}

export interface ValidationResult {
  level: ValidationLevel              // worst issue level (ok if none)
  issues: ValidationIssue[]
}

const OK: ValidationResult = { level: 'ok', issues: [] }

function asciiHasControlOrTerminator(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 0x20 || code === 0x3b /* ; */) return true
  }
  return false
}

function isAllDigits(s: string): boolean {
  return /^[0-9]+$/.test(s)
}

function bumpLevel(current: ValidationLevel, incoming: ValidationLevel): ValidationLevel {
  if (current === 'error' || incoming === 'error') return 'error'
  if (current === 'warn'  || incoming === 'warn')  return 'warn'
  return 'ok'
}

function validateParamSegment(
  spec: ParamDef,
  segment: string,
  issues: ValidationIssue[],
): ValidationLevel {
  let worst: ValidationLevel = 'ok'

  if (spec.digits !== -1 && segment.length !== spec.digits) {
    issues.push({
      level: 'error',
      message: `${spec.name} (${spec.label}): expected ${spec.digits} char(s), got ${segment.length} ("${segment}").`,
    })
    return 'error'
  }

  switch (spec.type) {
    case 'enum': {
      if (!spec.enum || !spec.enum.some((e) => e.value === segment)) {
        issues.push({
          level: 'error',
          message: `${spec.name} (${spec.label}): "${segment}" is not one of ${
            spec.enum?.map((e) => `${e.value}=${e.label}`).join(', ') ?? '(none)'
          }.`,
        })
        worst = 'error'
      }
      break
    }
    case 'int_range': {
      if (!isAllDigits(segment)) {
        issues.push({
          level: 'error',
          message: `${spec.name} (${spec.label}): expected digits only, got "${segment}".`,
        })
        worst = 'error'
        break
      }
      const n = parseInt(segment, 10)
      if (spec.min != null && n < spec.min) {
        issues.push({
          level: 'warn',
          message: `${spec.name} (${spec.label}): value ${n} below documented minimum ${spec.min}.`,
        })
        worst = bumpLevel(worst, 'warn')
      } else if (spec.max != null && n > spec.max) {
        issues.push({
          level: 'warn',
          message: `${spec.name} (${spec.label}): value ${n} above documented maximum ${spec.max}.`,
        })
        worst = bumpLevel(worst, 'warn')
      }
      break
    }
    case 'sign': {
      if (segment !== '+' && segment !== '-') {
        issues.push({
          level: 'error',
          message: `${spec.name} (${spec.label}): expected "+" or "-", got "${segment}".`,
        })
        worst = 'error'
      }
      break
    }
    case 'fixed': {
      if (spec.fixed != null && segment !== spec.fixed) {
        issues.push({
          level: 'warn',
          message: `${spec.name} (${spec.label}): expected fixed value "${spec.fixed}", got "${segment}".`,
        })
        worst = bumpLevel(worst, 'warn')
      }
      break
    }
    case 'string': {
      if (asciiHasControlOrTerminator(segment)) {
        issues.push({
          level: 'error',
          message: `${spec.name} (${spec.label}): contains ASCII control character or ";", which is reserved for the terminator.`,
        })
        worst = 'error'
      }
      break
    }
    case 'signed_int':
    case 'any':
    default:
      // No automatic deeper check — rely on length + the conditional note.
      if (asciiHasControlOrTerminator(segment)) {
        issues.push({
          level: 'error',
          message: `${spec.name} (${spec.label}): contains ASCII control character or ";".`,
        })
        worst = 'error'
      }
      break
  }

  if (spec.conditional) {
    issues.push({
      level: 'warn',
      message: `${spec.name} (${spec.label}): meaning is conditional — ${spec.conditional}`,
    })
    worst = bumpLevel(worst, 'warn')
  }

  return worst
}

/**
 * Validate a single Step ({ code, param }) against the catalogue.
 * The returned `level` is the worst observed across all issues.
 *
 * Hard rules (level=error, blocks save):
 *   • Unknown command code
 *   • Wrong total parameter length
 *   • Non-digit where digits were expected
 *   • Enum value not in the allowed set
 *   • ASCII control character or ";" inside a parameter
 *
 * Soft rules (level=warn, save still allowed):
 *   • Numeric value documented out of range
 *   • Conditional parameter where layout depends on another P
 *   • Use of a read-only command in a preset (presets are SET-only)
 */
export function validateStep(code: string, param: string): ValidationResult {
  const safeCode = (code ?? '').toUpperCase().trim()
  const safeParam = param ?? ''

  if (safeCode.length === 0) {
    return { level: 'error', issues: [{ level: 'error', message: 'Empty command code.' }] }
  }
  if (!/^[A-Z]{2}$/.test(safeCode)) {
    return {
      level: 'error',
      issues: [{ level: 'error', message: `"${safeCode}" is not a valid 2-letter command code.` }],
    }
  }

  const def = findCommand(safeCode)
  if (!def) {
    // Unknown command — still allow it (operator may know something), but warn.
    const issues: ValidationIssue[] = [
      { level: 'warn', message: `"${safeCode}" is not in the FTX-1 manual catalogue. Treating as a custom command.` },
    ]
    if (asciiHasControlOrTerminator(safeParam)) {
      issues.unshift({ level: 'error', message: 'Parameter contains an ASCII control character or ";".' })
      return { level: 'error', issues }
    }
    return { level: 'warn', issues }
  }

  const issues: ValidationIssue[] = []
  let worst: ValidationLevel = 'ok'

  if (!def.supports.set) {
    issues.push({
      level: 'warn',
      message: `${def.code} is documented as read-only (no SET form). Using it in a preset may have no effect.`,
    })
    worst = bumpLevel(worst, 'warn')
  }

  // Length check
  if (def.setForm === 'none') {
    if (safeParam.length > 0) {
      issues.push({
        level: 'error',
        message: `${def.code} accepts no parameter, but "${safeParam}" was supplied.`,
      })
      worst = 'error'
    }
  } else if (def.setForm === 'fixed' && typeof def.paramTotalDigits === 'number') {
    if (safeParam.length !== def.paramTotalDigits) {
      issues.push({
        level: 'error',
        message: `${def.code}: expected ${def.paramTotalDigits} parameter char(s), got ${safeParam.length} ("${safeParam}").`,
      })
      worst = 'error'
    }
  } else if (def.setForm === 'variable' && typeof def.paramTotalDigits === 'object') {
    const { min, max } = def.paramTotalDigits
    if (safeParam.length < min || safeParam.length > max) {
      issues.push({
        level: 'error',
        message: `${def.code}: parameter length must be between ${min} and ${max} char(s), got ${safeParam.length}.`,
      })
      worst = 'error'
    }
  }

  // If the length is wrong, don't run the per-segment checks (they'd cascade).
  if (worst === 'error' && issues.some((i) => i.message.startsWith(`${def.code}:`))) {
    return { level: worst, issues }
  }

  // Per-segment checks — only meaningful when we know how to slice the param.
  if (def.setForm === 'fixed' && def.params.length > 0) {
    let cursor = 0
    for (const spec of def.params) {
      const len = spec.digits === -1 ? safeParam.length - cursor : spec.digits
      const segment = safeParam.slice(cursor, cursor + len)
      cursor += len
      const level = validateParamSegment(spec, segment, issues)
      worst = bumpLevel(worst, level)
    }
  }

  // Global content check
  if (asciiHasControlOrTerminator(safeParam)) {
    issues.push({
      level: 'error',
      message: 'Parameter contains an ASCII control character (00–1F) or ";", which is reserved as the terminator.',
    })
    worst = 'error'
  }

  return issues.length === 0 ? OK : { level: worst, issues }
}

// Aggregate validation for an entire preset (for the footer summary).
export interface StepsValidationSummary {
  errorCount: number
  warningCount: number
  okCount: number
  worst: ValidationLevel
}

export function summariseSteps(
  steps: ReadonlyArray<{ code: string; param: string }>,
): StepsValidationSummary {
  let errorCount = 0
  let warningCount = 0
  let okCount = 0
  let worst: ValidationLevel = 'ok'
  for (const s of steps) {
    const r = validateStep(s.code, s.param)
    if (r.level === 'error') { errorCount += 1; worst = 'error' }
    else if (r.level === 'warn') { warningCount += 1; if (worst === 'ok') worst = 'warn' }
    else okCount += 1
  }
  return { errorCount, warningCount, okCount, worst }
}
