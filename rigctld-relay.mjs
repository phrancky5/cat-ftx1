/**
 * rigctld-compatible TCP relay
 * ─────────────────────────────
 *
 * Exposes a minimal subset of Hamlib's rigctld text protocol on TCP so that
 * external ham-radio applications (WSJT-X, Fldigi, JS8Call, N1MM, Gpredict,
 * CQRLOG …) can drive the FTX-1 through our serial bridge without us
 * shipping Hamlib itself. See `Hamlib-Research.md` for the design rationale.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Protocol notes
 * ──────────────────────────────────────────────────────────────────────────
 * - rigctld uses a line-based ASCII protocol. Each request is one line; the
 *   response is one or more lines.
 * - "Single-letter mode" (the legacy, default) is what all common clients
 *   use. We do NOT support the "+extended response" mode that prefixes
 *   every line with the command name — it would be cheap to add, but no
 *   widely-used client requires it.
 * - GET commands: response is the value(s), one per line, *no* terminating
 *   `RPRT 0`. (This is Hamlib's actual behaviour in basic mode despite
 *   what some derivative docs say.)
 * - SET commands: response is `RPRT 0\r\n` on success, `RPRT -N\r\n` on
 *   error (where N is a Hamlib errno; see ERR_* table below).
 * - `dump_state` returns a multi-line capabilities dump terminated by a
 *   bare `\n`. WSJT-X parses it to discover frequency ranges and supported
 *   modes.
 * - Unknown commands → RPRT -11 (RIG_ENAVAIL).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Virtual split (Hamlib FTX-1 backend parity)
 * ──────────────────────────────────────────────────────────────────────────
 * The FTX-1's hardware split forces the Sub VFO into a TX-armed state,
 * which breaks satellite Doppler workflows. Hamlib's FTX-1 backend
 * therefore implements a "virtual split" — it never sends a hardware ST1
 * command. Our relay does the same:
 *   - `S 1 VFOB` (turn split on) only sets a per-socket flag.
 *   - `I <Hz>` writes the TX frequency to FB (Sub VFO).
 *   - `T 1` (PTT on) sends FT1 + TX1 (transmit from Sub).
 *   - `T 0` sends TX0 + FT0 (return TX-side to Main).
 *   - `S 0 VFOA` clears the flag.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Configuration (env vars, read once at relay construction)
 * ──────────────────────────────────────────────────────────────────────────
 *   RIGCTLD_ENABLE   "1" (default) / "0"      Enable or disable the relay.
 *   RIGCTLD_PORT     "4532" (default)         TCP port to listen on.
 *   RIGCTLD_HOST     "0.0.0.0" (default)      Bind address. Set to
 *                                             "127.0.0.1" if you want to
 *                                             refuse even SYN packets
 *                                             from outside loopback.
 *                                             Otherwise the IP allowlist
 *                                             (`ALLOWED_IPS`, § 9) is the
 *                                             security boundary.
 *   RIGCTLD_DEBUG    "1" / "0" (default)      Log every line of traffic.
 *
 * IP allowlist (the same `ALLOWED_IPS` env var the Nuxt server uses):
 *
 *   - Every accepted TCP connection has its source IP checked against
 *     the allowlist BEFORE we send anything. Denied connections are
 *     dropped immediately; no protocol traffic, no event emission, no
 *     entry in the UI terminal. A single warning line lands in the
 *     server log so the operator can spot misconfigurations.
 *   - Default allowlist (when ALLOWED_IPS is unset) is loopback only,
 *     so the secure-by-default behaviour matches the rest of the app.
 *   - The check is performed by an `isAllowed(ip)` predicate that the
 *     constructor receives from the host process (serial-server.mjs).
 *     If no predicate is provided, all connections are accepted —
 *     useful for unit-test stubs that need full coverage.
 */

import net from 'node:net'
import { EventEmitter } from 'node:events'

// ── Hamlib errno table (subset) ─────────────────────────────────────────
//
// Documented in `include/hamlib/rig.h` of the Hamlib source tree. Negative
// values are returned in `RPRT -N` responses. We only cite the ones we
// actually emit.
const ERR = {
  OK: 0,
  EINVAL: 1,     // invalid parameter
  ECONF: 2,      // invalid configuration
  ENOMEM: 3,     // memory allocation failed
  ENIMPL: 4,     // function not implemented (kept distinct from ENAVAIL)
  ETIMEOUT: 5,   // communication timeout
  EIO: 6,        // I/O error (e.g. radio not connected)
  EINTERNAL: 7,
  EPROTO: 8,     // protocol error
  ERJCTED: 9,    // rig rejected the command
  ETRUNC: 10,
  ENAVAIL: 11,   // function not available — what we return for unknown cmds
  ENTARGET: 12,
  BUSERROR: 13,
  BUSBUSY: 14,
  EARG: 15,
  EVFO: 16,      // VFO not targetable
  EDOM: 17,
}

// ── FTX-1 mode code ↔ canonical rigctld mode name ───────────────────────
//
// The relay receives `M USB 2400` from clients and must send `MD0` + an
// FTX-1 mode code byte to the radio. Conversely, the radio reports
// `state.mainMode = 'USB'` (already decoded by serial-server.mjs's
// MODE_MAP) and the relay must hand back `USB` (or `CW`, `CWR`, …) to
// the client.
//
// The two-table layout below is deliberately exhaustive:
//
//   FTX1_MODE_FROM_RIGCTLD : rigctld name → FTX-1 catalogue code (for SET)
//   RIGCTLD_MODE_FROM_FTX1 : FTX-1 decoded string → rigctld name (for GET)
//
// Where the FTX-1 has finer-grained modes than rigctld's vocabulary
// (DATA-FM-N, C4FM-VW, …) we fold them to the closest rigctld mode.
const FTX1_MODE_FROM_RIGCTLD = {
  LSB:    '1',
  USB:    '2',
  CW:     '3',  // CW-U
  CWU:    '3',  // alias
  CWR:    '7',  // CW-L (reverse-CW)
  CWL:    '7',  // alias
  AM:     '5',
  AMN:    'D',  // narrow AM
  AMS:    '5',  // synchronous AM not separate on FTX-1
  FM:     '4',
  FMN:    'B',  // narrow FM
  RTTY:   '6',  // RTTY-L (mark = lower)
  RTTYR:  '9',  // RTTY-U
  PKTLSB: '8',  // DATA-L
  PKTUSB: 'C',  // DATA-U
  PKTFM:  'A',  // DATA-FM
  PKTFMN: 'F',  // DATA-FM-N
  PSK:    'E',
  C4FM:   'H',  // C4FM-DN as default flavour
}

const RIGCTLD_MODE_FROM_FTX1 = {
  'LSB':       'LSB',
  'USB':       'USB',
  'CW-U':      'CW',
  'CW-L':      'CWR',
  'AM':        'AM',
  'AM-N':      'AMN',
  'AMS':       'AM',
  'FM':        'FM',
  'FM-N':      'FMN',
  'RTTY-L':    'RTTY',
  'RTTY-U':    'RTTYR',
  'DATA-L':    'PKTLSB',
  'DATA-U':    'PKTUSB',
  'DATA-FM':   'PKTFM',
  'DATA-FM-N': 'PKTFMN',
  'PSK':       'PSK',
  'C4FM-DN':   'C4FM',
  'C4FM-VW':   'C4FM',
}

// ── dump_state ─────────────────────────────────────────────────────────
//
// Multi-line capabilities dump that clients like WSJT-X parse once at
// connect time. The values below are conservative — they overstate
// nothing and skip the rarely-checked optional fields (announces,
// preamp/attenuator levels, parm capabilities). The frequency ranges
// reflect the FTX-1's documented 1.8 – 50 MHz HF + 6 m ham coverage
// for the FTX-1F variant; users on the wide-band variant can tweak the
// RX range upper bound — it's a stripped-down dump on purpose, not a
// faithful clone of Hamlib's.
//
// Format (each line, fields whitespace-separated):
//   protocol_version
//   rig_model_number
//   itu_region
//   <rx_ranges...> {start_hz end_hz modes vfo_mask antennas low_power high_power}
//   0 0 0 0 0 0 0   ← end of rx ranges
//   <tx_ranges...>
//   0 0 0 0 0 0 0   ← end of tx ranges
//   <tuning_steps...> {modes hz}
//   0 0             ← end of tuning steps
//   <filters...> {modes hz}
//   0 0             ← end of filters
//   max_rit max_xit max_ifshift
//   announces
//   preamp_list  (0-terminated)
//   attenuator_list (0-terminated)
//   get_func_bitmap set_func_bitmap
//   get_level_bitmap set_level_bitmap
//   get_parm_bitmap set_parm_bitmap
//   done
//
// Modes bitmap (subset):
//   0x1   AM
//   0x2   CW
//   0x4   USB
//   0x8   LSB
//   0x10  RTTY
//   0x20  FM
//   0x40  WFM
//   0x80  CWR
//   0x100 RTTYR
//   0x800 PKTLSB
//   0x1000 PKTUSB
//   0x2000 PKTFM
//   ...
//
// Our `MODES_MASK` below = USB|LSB|CW|CWR|AM|FM|RTTY|RTTYR|PKTLSB|PKTUSB|PKTFM
//                       = 0x4 | 0x8 | 0x2 | 0x80 | 0x1 | 0x20 | 0x10 | 0x100 | 0x800 | 0x1000 | 0x2000
//                       = 0x3bbf
const MODES_MASK = '0x3bbf'

function buildDumpState() {
  const lines = []
  lines.push('0')         // protocol version 0 (basic)
  lines.push('1051')      // FTX-1 model id (matches Hamlib for cross-compat)
  lines.push('2')         // ITU region 2 (Americas; close enough — clients rarely care)

  // RX ranges. The FTX-1 (HF variant) covers 30 kHz – 56 MHz; the
  // FTX-1D variant adds 70 MHz / 144 / 430. We declare the union as a
  // single range so clients don't reject tuning to e.g. 14 MHz.
  // {start, end, modes, low_pwr, high_pwr, vfo_mask, ant_mask}
  // low_pwr -1 high_pwr -1 means "n/a" for an RX range.
  lines.push(`30000 56000000 ${MODES_MASK} -1 -1 0x3 0x1`)
  lines.push('0 0 0 0 0 0 0')

  // TX ranges. We declare the standard IARU ham bands the FTX-1
  // supports; clients use these to decide whether a target frequency
  // is legally transmittable. Power range is in milliwatts.
  //   low = 5000   (5 W minimum nominal)
  //   high = 100000 (100 W maximum nominal)
  const TX = [
    '1800000 2000000',
    '3500000 4000000',
    '5300000 5410000',
    '7000000 7300000',
    '10100000 10150000',
    '14000000 14350000',
    '18068000 18168000',
    '21000000 21450000',
    '24890000 24990000',
    '28000000 29700000',
    '50000000 54000000',
  ]
  for (const r of TX) lines.push(`${r} ${MODES_MASK} 5000 100000 0x3 0x1`)
  lines.push('0 0 0 0 0 0 0')

  // Tuning steps. Modes mask + Hz per step. We declare the four steps
  // that match the FTX-1's TS knob. Most clients ignore this entirely.
  lines.push(`${MODES_MASK} 1`)
  lines.push(`${MODES_MASK} 10`)
  lines.push(`${MODES_MASK} 100`)
  lines.push(`${MODES_MASK} 1000`)
  lines.push('0 0')

  // IF filters. Modes mask + bandwidth in Hz. Conservative defaults
  // matching the FTX-1's SH filter widths.
  lines.push('0x2 500')        // CW 500 Hz
  lines.push('0x2 2400')       // CW 2400 Hz
  lines.push('0xc 2400')       // SSB (USB|LSB) 2400 Hz
  lines.push('0x1 6000')       // AM 6 kHz
  lines.push('0x20 12000')     // FM 12 kHz
  lines.push('0 0')

  lines.push('9999')           // max RIT (Hz)
  lines.push('9999')           // max XIT
  lines.push('0')              // max IF shift (we don't expose IS)
  lines.push('0')              // announce capability
  lines.push('0')              // preamp 0-terminated (none reported here)
  lines.push('12 0')           // attenuator: 12 dB then list-terminator 0

  // FUNC bitmaps (rig_func_e). The values below claim the subset we
  // actually map: LOCK | MON | VOX | COMP | FBKIN (break-in) plus split.
  // Most clients only check the bits they need (TUNER, MUTE, VOX, COMP).
  //   FUNC_LOCK    = 0x40000
  //   FUNC_MON     = 0x800
  //   FUNC_VOX     = 0x4
  //   FUNC_COMP    = 0x8
  //   FUNC_FBKIN   = 0x40 (full break-in)
  //   FUNC_TUNER   = 0x80000000
  // We do not advertise TUNER capability because the FTX-1's ATU
  // doesn't speak the standard rig_func enum cleanly.
  const FUNC = '0x4084c'   // LOCK|MON|VOX|COMP|FBKIN
  lines.push(FUNC)         // has_get_func
  lines.push(FUNC)         // has_set_func

  // LEVEL bitmaps. Conservative — we promise nothing here.
  lines.push('0')          // has_get_level
  lines.push('0')          // has_set_level
  lines.push('0')          // has_get_parm
  lines.push('0')          // has_set_parm
  lines.push('done')
  return lines.join('\n') + '\n'
}

// ── RigctldRelay ────────────────────────────────────────────────────────

/**
 * Emits the following events for consumers (typically the SSE bridge in
 * serial-server.mjs that forwards relay traffic to the browser UI):
 *
 *   'client-connect'    { remote: 'ip:port' }
 *   'client-disconnect' { remote: 'ip:port' }
 *   'line'              { remote: 'ip:port', dir: 'in'|'out', text: 'F 14250000' }
 *
 * `dir: 'in'`  — line received from a client (e.g. WSJT-X → us)
 * `dir: 'out'` — line we sent to a client (e.g. our reply)
 *
 * Multi-line payloads such as `dump_state` are emitted as one event per
 * line so the UI can render them naturally without needing to split.
 */
export class RigctldRelay extends EventEmitter {
  /**
   * @param {object} options
   * @param {import('events').EventEmitter} options.manager - SerialManager
   *   instance from serial-server.mjs. Must expose:
   *     - .state (live state object)
   *     - .sendCommandNoWait(cmd) → Promise<void>
   *     - .sendCommand(cmd, timeoutMs) → Promise<string>
   * @param {number}   [options.port=4532]     TCP port to listen on
   * @param {string}   [options.host='0.0.0.0'] Bind address
   * @param {boolean}  [options.debug=false]   Log every line of I/O
   * @param {(ip: string) => boolean} [options.isAllowed]
   *   Predicate called with the normalised remote IP of every accepted
   *   connection. Returning false causes the socket to be destroyed
   *   immediately and the connection NOT to appear in the UI feed.
   *   Defaults to allow-all (intended for unit tests only); production
   *   callers should always pass the real allowlist check.
   */
  constructor({ manager, port = 4532, host = '0.0.0.0', debug = false, isAllowed } = {}) {
    super()
    this.manager = manager
    this.port = port
    this.host = host
    this.debug = debug
    this.isAllowed = typeof isAllowed === 'function' ? isAllowed : () => true
    this._server = null
    this._sockets = new Set()
    this._dumpState = buildDumpState()  // computed once; never changes
  }

  /** Begin accepting connections. Idempotent. */
  start() {
    if (this._server) return
    this._server = net.createServer((socket) => this._onConnection(socket))
    this._server.on('error', (err) => {
      console.error(`[rigctld-relay] server error: ${err.message}`)
    })
    this._server.listen(this.port, this.host, () => {
      console.log(`[rigctld-relay] listening on ${this.host}:${this.port} (rigctld-compatible)`)
    })
  }

  /** Stop accepting new connections and end all existing ones. Idempotent. */
  async stop() {
    if (!this._server) return
    const server = this._server
    this._server = null
    // 1. Forcibly close existing per-client connections FIRST.
    //    net.Server.close() only stops accepting new connections; it
    //    will not return until all existing sockets are closed. If we
    //    don't tear them down ourselves, shutdown can hang indefinitely
    //    on a client that holds the connection open (e.g. WSJT-X).
    for (const s of this._sockets) {
      try { s.destroy() } catch { /* socket may already be gone */ }
    }
    this._sockets.clear()
    // 2. Now close the listening socket; callback fires once it's done.
    await new Promise((resolve) => server.close(() => resolve()))
    console.log('[rigctld-relay] stopped')
  }

  // ── Per-connection setup ──────────────────────────────────────────────
  _onConnection(socket) {
    // Normalise the remote address before the allowlist check. The
    // raw `socket.remoteAddress` arrives in whatever form the kernel
    // gave us — IPv4 ("192.168.1.5"), IPv6 ("::1"), or IPv4-mapped
    // IPv6 ("::ffff:192.168.1.5"). The allowlist predicate handles
    // the mapped form itself; we only strip it here so the log line
    // and the `remote` identifier in events are readable.
    let ip = socket.remoteAddress ?? ''
    if (ip.startsWith('::ffff:')) ip = ip.substring(7)
    const remote = `${ip}:${socket.remotePort}`

    // ── Allowlist gate ──
    // Reject *before* registering the socket, before emitting any
    // event, and before sending any protocol response. A scanner or
    // misconfigured client therefore sees only a closed TCP
    // connection — they don't get a `RPRT 0` for `dump_state`, and
    // they don't appear in the UI's traffic feed at all.
    if (!this.isAllowed(ip)) {
      console.warn(`[rigctld-relay] rejected connection from ${remote} (not on ALLOWED_IPS)`)
      try { socket.destroy() } catch { /* already gone */ }
      return
    }

    this._sockets.add(socket)
    if (this.debug) console.log(`[rigctld-relay] connect ${remote}`)
    this.emit('client-connect', { remote })

    // Per-socket state — most importantly the virtual split flags.
    // Each client tracks its own split state independently so two
    // clients can be in different operating modes simultaneously.
    const ctx = {
      socket,
      remote,
      buffer: '',
      // Virtual split (see header comment).
      split: false,
      splitTxVfo: 'VFOA',
    }

    socket.setEncoding('utf8')
    socket.on('data', (chunk) => this._onData(ctx, chunk))
    socket.on('error', (err) => {
      if (this.debug) console.log(`[rigctld-relay] socket error from ${remote}: ${err.message}`)
    })
    socket.on('close', () => {
      this._sockets.delete(socket)
      if (this.debug) console.log(`[rigctld-relay] disconnect ${remote}`)
      this.emit('client-disconnect', { remote })
    })
  }

  _onData(ctx, chunk) {
    ctx.buffer += chunk
    // Process one line at a time. rigctld lines are LF-terminated; we
    // accept CRLF too. A trailing partial line stays in the buffer for
    // the next chunk.
    let nl
    while ((nl = ctx.buffer.indexOf('\n')) !== -1) {
      const line = ctx.buffer.slice(0, nl).replace(/\r$/, '')
      ctx.buffer = ctx.buffer.slice(nl + 1)
      if (line.length === 0) continue
      this.emit('line', { remote: ctx.remote, dir: 'in', text: line })
      this._dispatch(ctx, line).catch((err) => {
        console.error(`[rigctld-relay] handler error: ${err.message}`)
        this._writeRprt(ctx, ERR.EINTERNAL)
      })
    }
  }

  // ── Dispatch one request line ────────────────────────────────────────
  async _dispatch(ctx, line) {
    if (this.debug) console.log(`[rigctld-relay] < ${ctx.remote} ${line}`)

    // Normalise: rigctld accepts both single-letter (`F`) and long
    // (`\set_freq`) command names. We dispatch on a normalised key.
    let rest = line.trim()
    let key
    if (rest.startsWith('\\')) {
      const sp = rest.indexOf(' ')
      key = sp === -1 ? rest : rest.slice(0, sp)
      rest = sp === -1 ? '' : rest.slice(sp + 1).trim()
    } else {
      key = rest[0]
      rest = rest.slice(1).trim()
    }

    switch (key) {
      // ── frequency (RX) ─────────────────────────────────────────────
      case 'f':
      case '\\get_freq':
        return this._handleGetFreq(ctx)
      case 'F':
      case '\\set_freq':
        return this._handleSetFreq(ctx, rest)

      // ── frequency (TX / split) ─────────────────────────────────────
      case 'i':
      case '\\get_split_freq':
        return this._handleGetSplitFreq(ctx)
      case 'I':
      case '\\set_split_freq':
        return this._handleSetSplitFreq(ctx, rest)

      // ── mode ───────────────────────────────────────────────────────
      case 'm':
      case '\\get_mode':
        return this._handleGetMode(ctx, /*sub=*/false)
      case 'M':
      case '\\set_mode':
        return this._handleSetMode(ctx, rest, /*sub=*/false)
      case 'x':
      case '\\get_split_mode':
        return this._handleGetMode(ctx, /*sub=*/true)
      case 'X':
      case '\\set_split_mode':
        return this._handleSetMode(ctx, rest, /*sub=*/true)

      // ── PTT ────────────────────────────────────────────────────────
      case 't':
      case '\\get_ptt':
        return this._handleGetPtt(ctx)
      case 'T':
      case '\\set_ptt':
        return this._handleSetPtt(ctx, rest)

      // ── VFO ────────────────────────────────────────────────────────
      case 'v':
      case '\\get_vfo':
        return this._handleGetVfo(ctx)
      case 'V':
      case '\\set_vfo':
        return this._handleSetVfo(ctx, rest)

      // ── split ──────────────────────────────────────────────────────
      case 's':
      case '\\get_split_vfo':
        return this._handleGetSplit(ctx)
      case 'S':
      case '\\set_split_vfo':
        return this._handleSetSplit(ctx, rest)

      // ── capabilities ───────────────────────────────────────────────
      case '\\dump_state':
      case '1':
        return this._writeRaw(ctx, this._dumpState)
      case '\\chk_vfo':
        // Reports whether the client must include a VFO arg with each
        // command. We answer 0 = "no, single-VFO style is fine".
        return this._writeRaw(ctx, 'CHKVFO 0\n')

      // ── housekeeping ───────────────────────────────────────────────
      case 'q':
      case 'Q':
      case '\\quit':
        ctx.socket.end()
        return

      default:
        // Anything else: we politely return "not implemented" so the
        // client can fall back to dump_state-based feature detection
        // instead of erroring out.
        return this._writeRprt(ctx, ERR.ENAVAIL)
    }
  }

  // ── Frequency handlers ────────────────────────────────────────────────
  _handleGetFreq(ctx) {
    const f = this.manager.state.mainFreq
    if (typeof f !== 'number' || !this.manager.state.connected) {
      return this._writeRprt(ctx, ERR.EIO)
    }
    return this._writeRaw(ctx, `${f}\n`)
  }

  async _handleSetFreq(ctx, arg) {
    const hz = parseInt(arg, 10)
    if (!Number.isFinite(hz) || hz < 0) return this._writeRprt(ctx, ERR.EINVAL)
    if (!this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    try {
      // Always Main VFO. Apps that want to set the sub VFO use \set_split_freq.
      await this.manager.sendCommandNoWait(`FA${String(hz).padStart(9, '0')}`)
      return this._writeRprt(ctx, ERR.OK)
    } catch (err) {
      return this._writeRprt(ctx, ERR.EIO)
    }
  }

  _handleGetSplitFreq(ctx) {
    // In virtual-split mode the TX frequency is whatever's on Sub VFO.
    const f = this.manager.state.subFreq
    if (typeof f !== 'number' || !this.manager.state.connected) {
      return this._writeRprt(ctx, ERR.EIO)
    }
    return this._writeRaw(ctx, `${f}\n`)
  }

  async _handleSetSplitFreq(ctx, arg) {
    const hz = parseInt(arg, 10)
    if (!Number.isFinite(hz) || hz < 0) return this._writeRprt(ctx, ERR.EINVAL)
    if (!this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    try {
      // Virtual split: write to Sub VFO. We never enable hardware split
      // — see header comment for why (Hamlib/Hamlib#1972).
      await this.manager.sendCommandNoWait(`FB${String(hz).padStart(9, '0')}`)
      return this._writeRprt(ctx, ERR.OK)
    } catch (err) {
      return this._writeRprt(ctx, ERR.EIO)
    }
  }

  // ── Mode handlers ────────────────────────────────────────────────────
  _handleGetMode(ctx, sub) {
    const m = sub ? this.manager.state.subMode : this.manager.state.mainMode
    if (!m || !this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    const rigctldName = RIGCTLD_MODE_FROM_FTX1[m] ?? m
    // We don't expose IF bandwidth as a queryable value (the FTX-1's
    // SH index needs a mode-specific lookup table that's not worth
    // building yet); return 0 = "use rig's current width". Clients
    // accept this — WSJT-X displays no bandwidth in that case.
    return this._writeRaw(ctx, `${rigctldName}\n0\n`)
  }

  async _handleSetMode(ctx, arg, sub) {
    // arg is "MODE [BANDWIDTH_HZ]" — bandwidth is optional and we
    // ignore it (see _handleGetMode rationale).
    const parts = arg.split(/\s+/)
    const modeName = parts[0]?.toUpperCase()
    if (!modeName) return this._writeRprt(ctx, ERR.EINVAL)
    const code = FTX1_MODE_FROM_RIGCTLD[modeName]
    if (!code) return this._writeRprt(ctx, ERR.EINVAL)
    if (!this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    try {
      const vfoByte = sub ? '1' : '0'
      await this.manager.sendCommandNoWait(`MD${vfoByte}${code}`)
      return this._writeRprt(ctx, ERR.OK)
    } catch {
      return this._writeRprt(ctx, ERR.EIO)
    }
  }

  // ── PTT handlers ─────────────────────────────────────────────────────
  _handleGetPtt(ctx) {
    if (!this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    return this._writeRaw(ctx, `${this.manager.state.txState ? 1 : 0}\n`)
  }

  async _handleSetPtt(ctx, arg) {
    const v = arg.trim()
    if (v !== '0' && v !== '1') return this._writeRprt(ctx, ERR.EINVAL)
    if (!this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    try {
      if (v === '1') {
        // Virtual-split → flip the TX VFO to Sub before keying.
        if (ctx.split) await this.manager.sendCommandNoWait('FT1')
        await this.manager.sendCommandNoWait('TX1')
      } else {
        await this.manager.sendCommandNoWait('TX0')
        // Restore TX VFO to Main when split is being released or kept off.
        if (ctx.split) await this.manager.sendCommandNoWait('FT0')
      }
      return this._writeRprt(ctx, ERR.OK)
    } catch {
      return this._writeRprt(ctx, ERR.EIO)
    }
  }

  // ── VFO handlers ─────────────────────────────────────────────────────
  _handleGetVfo(ctx) {
    // The FTX-1 doesn't really have a single "current VFO" the way an
    // FT-991 does — Main/Sub are both always live. We report VFOA
    // because that's what most clients expect to receive.
    if (!this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    return this._writeRaw(ctx, 'VFOA\n')
  }

  async _handleSetVfo(ctx, arg) {
    // Most clients call \set_vfo VFOA or VFOB before set_freq. Because
    // we always treat Main as VFOA, we accept VFOA / Main as a no-op,
    // and we map VFOB / Sub to "remember to use FB for the next freq
    // write". For simplicity we ignore the choice and let the explicit
    // \set_freq / \set_split_freq do the routing.
    const v = arg.trim().toUpperCase()
    if (!['VFOA', 'VFOB', 'MAIN', 'SUB'].includes(v)) {
      return this._writeRprt(ctx, ERR.EVFO)
    }
    if (!this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    return this._writeRprt(ctx, ERR.OK)
  }

  // ── Split handlers (virtual!) ────────────────────────────────────────
  _handleGetSplit(ctx) {
    if (!this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    // Two lines: 1) split flag, 2) TX VFO.
    return this._writeRaw(ctx, `${ctx.split ? 1 : 0}\n${ctx.splitTxVfo}\n`)
  }

  _handleSetSplit(ctx, arg) {
    // arg: "<0|1> <TX_VFO>"
    const parts = arg.split(/\s+/)
    const splitOn = parts[0] === '1'
    const txVfo = (parts[1] || (splitOn ? 'VFOB' : 'VFOA')).toUpperCase()
    if (!['VFOA', 'VFOB', 'MAIN', 'SUB'].includes(txVfo)) {
      return this._writeRprt(ctx, ERR.EVFO)
    }
    if (!this.manager.state.connected) return this._writeRprt(ctx, ERR.EIO)
    // Per-socket state only; do NOT touch the radio. This is the
    // Hamlib virtual-split behaviour that fixes the GPredict Doppler
    // bug (Hamlib/Hamlib#1972). The actual TX-side routing is done by
    // _handleSetPtt when keying.
    ctx.split = splitOn
    ctx.splitTxVfo = (txVfo === 'MAIN') ? 'VFOA'
                  : (txVfo === 'SUB')  ? 'VFOB'
                  : txVfo
    return this._writeRprt(ctx, ERR.OK)
  }

  // ── Wire helpers ─────────────────────────────────────────────────────
  // rigctld convention: success = "RPRT 0", failure = "RPRT -N" where N
  // is a Hamlib errno (positive in the source, negative on the wire).
  // Our ERR table uses positive constants for readability and we negate
  // here at the wire boundary.
  _writeRprt(ctx, code) {
    const wire = code === 0 ? 0 : -Math.abs(code)
    return this._writeRaw(ctx, `RPRT ${wire}\n`)
  }

  _writeRaw(ctx, payload) {
    if (this.debug) console.log(`[rigctld-relay] > ${ctx.remote} ${payload.replace(/\n/g, '\\n')}`)
    // Emit one 'line' event per outgoing line. Multi-line payloads
    // (dump_state in particular) become N events so the UI can show
    // them naturally without doing its own splitting.
    const lines = payload.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip the trailing empty fragment that .split() leaves when the
      // payload ends with '\n' (every payload does).
      if (i === lines.length - 1 && line === '') break
      this.emit('line', { remote: ctx.remote, dir: 'out', text: line })
    }
    try { ctx.socket.write(payload) } catch { /* socket closed — drop */ }
  }
}
