/**
 * Software simulator that mimics a Yaesu FTX-1 attached over a serial port.
 *
 * Loaded by serial-server.mjs only when the environment variable
 * SIMULATE_RIG=1 is set. Activate by selecting the "SIM-FTX1" port in
 * the UI. Everything else (Bearer-token auth, SSE, HTTP routes,
 * front-end state mirror) works exactly as it would with a real radio.
 *
 * The simulator is deliberately minimal: it understands the small set of
 * CAT prefixes the application actually issues, holds an in-memory state
 * mirror, and echoes back changes so that the existing SerialManager
 * state machine sees plausible frames.
 *
 * Class API mirrors the subset of `serialport` v12 that SerialManager uses:
 *   - new SimulatedSerialPort({ path, baudRate, ... })
 *   - .isOpen (getter)
 *   - .open(cb)
 *   - .close(cb)
 *   - .write(data, cb)
 *   - .pipe(parser)  — receives an @serialport/parser-readline instance
 *   - emits 'close' and 'error' (EventEmitter)
 */

import { EventEmitter } from 'node:events'
import { bandDefaultHz, hzToBandCode, stepBandCode } from './band-defaults.mjs'

export const SIM_PORT_PATH = 'SIM-FTX1'

export class SimulatedSerialPort extends EventEmitter {
  constructor(_options = {}) {
    super()
    this._isOpen = false
    this._parser = null
    this._smeterTicker = null

    // Internal state — sane defaults that look like a healthy FTX-1.
    this.s = {
      fa: 14250000,           // Main VFO: 14.250 MHz (USB band)
      fb: 144800000,          // Sub VFO: 144.800 MHz (FM 2 m)
      md0: '2',               // Main mode = USB
      md1: '4',               // Sub mode  = FM
      tx: '0',
      mox: '0',
      st: '0',                // split off
      gt0: '5', gt1: '5',     // AGC AUTO-M
      ag0: 50, ag1: 50,       // volume
      rg0: 50, rg1: 50,       // RF gain
      sq0: 0,  sq1: 0,        // squelch
      pc: 50,                 // power level 50 W
      ao: 50, mg: 50, pl: 50, vg: 50,
      pr0: '0', pr1: '0',     // speech proc / EQ
      vx: '0',
      sf: '01',               // FUNC KNOB → D-LEVEL
      ai: '0',
      lk: '0',
      ra: '0',
      ct0: '0', ct1: '0',
      pa0: '0', pa1: '0', pa2: '0',
      na0: '0', na1: '0',
      fr: '00',               // dual receive
      ft: '0',                // TX = main
      rl0: 0,  rl1: 0,
      sh0: '02', sh1: '02',
      is0: '+0000', is1: '+0000',
      sm0: 25, sm1: 18,
      ve: ['1010', '1010', '1010', '1010', '0000', '0000'],
      antSelect: '0',
      sqlRfMode: '2',
      scope: { mode: 0, span: 3, speed: 0, level: 50, att: 0, color: 'A' },
    }
  }

  get isOpen() { return this._isOpen }

  open(cb) {
    setImmediate(() => {
      this._isOpen = true
      if (cb) cb(null)
    })
  }

  close(cb) {
    if (!this._isOpen) { if (cb) cb(null); return }
    this._isOpen = false
    this._stopSmeterTicker()
    setImmediate(() => {
      this.emit('close')
      if (cb) cb(null)
    })
  }

  pipe(parser) {
    this._parser = parser
    return parser
  }

  write(data, cb) {
    try {
      const buf = String(data)
      // Multiple CAT frames may arrive in a single write; split on ';'.
      for (const cmd of buf.split(';')) {
        const trimmed = cmd.trim()
        if (!trimmed) continue
        const resp = this._handleCommand(trimmed)
        if (resp != null) this._emit(resp)
      }
      if (cb) cb(null)
    } catch (e) {
      if (cb) cb(e); else this.emit('error', e)
    }
  }

  // ── internals ──────────────────────────────────────────

  _emit(frame) {
    // Asynchronous so callers behave the same as with real serial latency.
    setImmediate(() => {
      if (this._parser && this._isOpen) {
        this._parser.write(frame + ';')
      }
    })
  }

  _startSmeterTicker() {
    if (this._smeterTicker) return
    this._smeterTicker = setInterval(() => {
      // Random walk so the UI shows a live needle without being chaotic.
      this.s.sm0 = clamp(this.s.sm0 + step(), 0, 255)
      this.s.sm1 = clamp(this.s.sm1 + step(), 0, 255)
      if (this._parser && this._isOpen) {
        this._parser.write(`SM0${pad(this.s.sm0, 3)};`)
        this._parser.write(`SM1${pad(this.s.sm1, 3)};`)
      }
    }, 500)
  }

  _stopSmeterTicker() {
    if (this._smeterTicker) {
      clearInterval(this._smeterTicker)
      this._smeterTicker = null
    }
  }

  _scopeRead(sub) {
    const sc = this.s.scope
    if (sub === '0') return String(sc.speed)
    if (sub === '2') return '1'
    if (sub === '3') return String(sc.color)
    if (sub === '4') return pad(sc.level, 4)
    if (sub === '5') return String(sc.span)
    if (sub === '6') return String(sc.mode)
    if (sub === '7') return String(sc.att)
    return '0'
  }

  _handleCommand(cmd) {
    const prefix = cmd.substring(0, 2).toUpperCase()
    const params = cmd.substring(2)

    // ── Identity / Auto-Information ────────────────────
    if (cmd === 'ID')                return 'ID0840'
    if (cmd === 'AI1') { this.s.ai = '1'; this._startSmeterTicker(); return 'AI1' }
    if (cmd === 'AI0') { this.s.ai = '0'; this._stopSmeterTicker();  return 'AI0' }
    if (cmd === 'AI')                return `AI${this.s.ai}`

    // ── Frequencies ────────────────────────────────────
    if (prefix === 'FA') {
      if (params.length === 0) return `FA${pad(this.s.fa, 9)}`
      const n = parseInt(params, 10); if (!isNaN(n)) this.s.fa = n
      return `FA${pad(this.s.fa, 9)}`
    }
    if (prefix === 'FB') {
      if (params.length === 0) return `FB${pad(this.s.fb, 9)}`
      const n = parseInt(params, 10); if (!isNaN(n)) this.s.fb = n
      return `FB${pad(this.s.fb, 9)}`
    }

    // ── Modulation ─────────────────────────────────────
    if (prefix === 'MD') {
      if (params.length === 1) {
        return params === '0' ? `MD0${this.s.md0}` : `MD1${this.s.md1}`
      }
      if (params.length === 2) {
        if (params[0] === '0') this.s.md0 = params[1]
        if (params[0] === '1') this.s.md1 = params[1]
        return `MD${params[0]}${params[1]}`
      }
      return null
    }

    // ── PTT / MOX / Split ──────────────────────────────
    if (prefix === 'TX') {
      if (params.length === 0) return `TX${this.s.tx}`
      this.s.tx = params[0]; return `TX${this.s.tx}`
    }
    if (prefix === 'MX') {
      if (params.length === 0) return `MX${this.s.mox}`
      this.s.mox = params[0]; return `MX${this.s.mox}`
    }
    if (prefix === 'ST') {
      if (params.length === 0) return `ST${this.s.st}`
      this.s.st = params[0]; return `ST${this.s.st}`
    }
    if (prefix === 'FR') {
      if (params.length === 0) return `FR${this.s.fr}`
      this.s.fr = params; return `FR${this.s.fr}`
    }
    if (prefix === 'FT') {
      if (params.length === 0) return `FT${this.s.ft}`
      this.s.ft = params[0]; return `FT${this.s.ft}`
    }
    if (prefix === 'LK') {
      if (params.length === 0) return `LK${this.s.lk}`
      this.s.lk = params[0]; return `LK${this.s.lk}`
    }

    // ── AGC / Gains / Squelch ──────────────────────────
    if (prefix === 'GT') return twoSlotRW(params, this.s, 'gt0', 'gt1', (v) => v)
    if (prefix === 'AG') return numericRW (params, this.s, 'ag0', 'ag1', 3)
    if (prefix === 'RG') return numericRW (params, this.s, 'rg0', 'rg1', 3)
    if (prefix === 'SQ') return numericRW (params, this.s, 'sq0', 'sq1', 3)

    // ── Power / TX audio chain ─────────────────────────
    if (prefix === 'PC') {
      if (params.length === 0) return `PC0${pad(this.s.pc, 3)}`
      // Setter is PC P1 P2P2P2 — 4 chars after PC
      if (params.length >= 4) {
        const n = parseInt(params.substring(1), 10)
        if (!isNaN(n)) this.s.pc = n
        return `PC${params[0]}${pad(this.s.pc, 3)}`
      }
      return null
    }
    if (prefix === 'AO') return scalarRW(params, this.s, 'ao', 3)
    if (prefix === 'MG') return scalarRW(params, this.s, 'mg', 3)
    if (prefix === 'PL') return scalarRW(params, this.s, 'pl', 3)
    if (prefix === 'VG') return scalarRW(params, this.s, 'vg', 3)
    if (prefix === 'VX') {
      if (params.length === 0) return `VX${this.s.vx}`
      this.s.vx = params[0]; return `VX${this.s.vx}`
    }
    if (prefix === 'PR') {
      if (params.length === 1) return params === '0' ? `PR0${this.s.pr0}` : `PR1${this.s.pr1}`
      if (params.length === 2) {
        if (params[0] === '0') this.s.pr0 = params[1]
        if (params[0] === '1') this.s.pr1 = params[1]
        return `PR${params[0]}${params[1]}`
      }
      return null
    }
    if (prefix === 'SF') {
      if (params.length === 0) return `SF${this.s.sf}`
      this.s.sf = params; return `SF${this.s.sf}`
    }

    // ── Narrow / Bandwidth / Shift ─────────────────────
    if (prefix === 'NA') return twoSlotRW(params, this.s, 'na0', 'na1', (v) => v)
    if (prefix === 'SH') {
      if (params.length === 1) return params === '0' ? `SH00${this.s.sh0}` : `SH10${this.s.sh1}`
      if (params.length >= 4) {
        const v = params[0]; const idx = params.substring(2, 4)
        if (v === '0') this.s.sh0 = idx
        if (v === '1') this.s.sh1 = idx
        return `SH${v}0${idx}`
      }
      return null
    }
    if (prefix === 'IS') {
      if (params.length === 1) return params === '0' ? `IS00${this.s.is0}` : `IS10${this.s.is1}`
      if (params.length >= 5) {
        const v = params[0]; const sig = params.substring(2)
        if (v === '0') this.s.is0 = sig
        if (v === '1') this.s.is1 = sig
        return `IS${v}0${sig}`
      }
      return null
    }

    // ── Preamp / Attenuator ────────────────────────────
    if (prefix === 'PA') {
      if (params.length === 1) {
        const b = params[0]
        const v = b === '0' ? this.s.pa0 : b === '1' ? this.s.pa1 : this.s.pa2
        return `PA${b}${v}`
      }
      if (params.length === 2) {
        const b = params[0]; const v = params[1]
        if (b === '0') this.s.pa0 = v
        if (b === '1') this.s.pa1 = v
        if (b === '2') this.s.pa2 = v
        return `PA${b}${v}`
      }
      return null
    }
    if (prefix === 'RA') {
      if (params.length === 1) return `RA${params[0]}${this.s.ra}`
      if (params.length === 2) { this.s.ra = params[1]; return `RA${params[0]}${this.s.ra}` }
      return null
    }

    // ── SQL type / CTCSS / DCS ─────────────────────────
    if (prefix === 'CT') {
      if (params.length === 1) {
        return params === '0' ? `CT0${this.s.ct0}` : `CT1${this.s.ct1}`
      }
      if (params.length === 2) {
        if (params[0] === '0') this.s.ct0 = params[1]
        if (params[0] === '1') this.s.ct1 = params[1]
        return `CT${params[0]}${params[1]}`
      }
      return null
    }
    if (prefix === 'CN') {
      // CN P1 P2 (read) or CN P1 P2 P3P3P3 (write); we just echo a default 000.
      if (params.length === 2) return `CN${params}000`
      if (params.length === 5) return `CN${params}`
      return null
    }
    if (prefix === 'RL') {
      if (params.length === 1) {
        const v = params[0]; const n = v === '0' ? this.s.rl0 : this.s.rl1
        return `RL${v}${pad(n, 2)}`
      }
      if (params.length >= 3) {
        const v = params[0]; const n = parseInt(params.substring(1, 3), 10)
        if (v === '0') this.s.rl0 = n
        if (v === '1') this.s.rl1 = n
        return `RL${v}${pad(n, 2)}`
      }
      return null
    }

    // ── Band scope (SS) ────────────────────────────────
    if (prefix === 'SS') {
      if (params.length === 2) {
        return `SS${params[0]}${params[1]}${this._scopeRead(params[1])}`
      }
      if (params.length >= 3) {
        return `SS${params}`
      }
      return null
    }

    // ── Firmware versions (VE) ─────────────────────────
    if (prefix === 'VE') {
      const i = parseInt(params[0], 10)
      if (i >= 0 && i <= 5) return `VE${params[0]}xx${this.s.ve[i]}`
      return null
    }

    // ── Extension menus we mirror (EX) ─────────────────
    if (prefix === 'EX') {
      if (params.startsWith('030704')) {
        const tail = params.substring(6)
        if (tail.length > 0) this.s.antSelect = tail[0]
        return `EX030704${this.s.antSelect}`
      }
      if (params.startsWith('030102')) {
        const tail = params.substring(6)
        if (tail.length > 0) this.s.sqlRfMode = tail[0]
        return `EX030102${this.s.sqlRfMode}`
      }
      return null
    }

    // ── Radio info (RI) ────────────────────────────────
    if (prefix === 'RI') {
      // 8-byte payload after "RI": all zeros = idle, no alarms.
      return 'RI000000000'
    }

    // ── Polled S-meter (SM) — also pushed automatically ─
    if (prefix === 'SM') {
      if (params.length === 1) {
        const v = params[0]
        const n = v === '0' ? this.s.sm0 : this.s.sm1
        return `SM${v}${pad(n, 3)}`
      }
      return null
    }

    // ── Band select / step (silent on real radio) ─────
    if (prefix === 'BS' && params.length >= 3) {
      const vfo = params[0]
      const bandCode = params.substring(1, 3)
      const hz = bandDefaultHz(bandCode)
      if (hz != null) {
        if (vfo === '1') this.s.fb = hz
        else this.s.fa = hz
      }
      return null
    }
    if (prefix === 'BU' && params.length >= 1) {
      const vfo = params[0]
      const key = vfo === '1' ? 'fb' : 'fa'
      const code = hzToBandCode(this.s[key]) ?? '05'
      const next = bandDefaultHz(stepBandCode(code, +1))
      if (next != null) this.s[key] = next
      return null
    }
    if (prefix === 'BD' && params.length >= 1) {
      const vfo = params[0]
      const key = vfo === '1' ? 'fb' : 'fa'
      const code = hzToBandCode(this.s[key]) ?? '05'
      const next = bandDefaultHz(stepBandCode(code, -1))
      if (next != null) this.s[key] = next
      return null
    }

    // ── Commands the radio does not acknowledge ────────
    //   UP / DN / VS / PS — silent (real radio behavior).
    return null
  }
}

// ── helpers ──────────────────────────────────────────────

function pad(n, width) {
  return String(n).padStart(width, '0')
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function step() {
  return (Math.random() < 0.5 ? -1 : 1) * 3
}

/**
 * Two-slot read/write for `<prefix><vfo>[<value>]` style commands with a
 * single-character value (e.g. GT, NA).
 */
function twoSlotRW(params, state, key0, key1, transform) {
  const prefix = key0.substring(0, 2).toUpperCase()
  if (params.length === 1) {
    const v = params
    return v === '0' ? `${prefix}0${state[key0]}` : `${prefix}1${state[key1]}`
  }
  if (params.length === 2) {
    const vfo = params[0]; const val = transform(params[1])
    if (vfo === '0') state[key0] = val
    if (vfo === '1') state[key1] = val
    return `${prefix}${vfo}${val}`
  }
  return null
}

/**
 * Numeric read/write for `<prefix><vfo>[<NNN>]` style commands (AG/RG/SQ).
 */
function numericRW(params, state, key0, key1, width) {
  // We need the original 2-letter prefix to build the response. The caller
  // matches on `prefix === '<XY>'`, then calls this; reconstruct by reading
  // the params string only.
  // Workaround: encode prefix inside the keys (key0[0..1] uppercased).
  const prefix = key0.substring(0, 2).toUpperCase()
  if (params.length === 1) {
    const v = params[0]; const n = v === '0' ? state[key0] : state[key1]
    return `${prefix}${v}${pad(n, width)}`
  }
  if (params.length >= width + 1) {
    const v = params[0]; const n = parseInt(params.substring(1), 10)
    if (!isNaN(n)) {
      if (v === '0') state[key0] = n
      if (v === '1') state[key1] = n
    }
    return `${prefix}${v}${pad(v === '0' ? state[key0] : state[key1], width)}`
  }
  return null
}

/**
 * Scalar read/write for `<prefix>[<NNN>]` style commands (AO/MG/PL/VG).
 */
function scalarRW(params, state, key, width) {
  const prefix = key.substring(0, 2).toUpperCase()
  if (params.length === 0) return `${prefix}${pad(state[key], width)}`
  const n = parseInt(params, 10)
  if (!isNaN(n)) state[key] = n
  return `${prefix}${pad(state[key], width)}`
}
