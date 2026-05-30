# CAT FTX-1 — NXC Session Change Log

- Project: `cat-ftx1` v1.0.1 (operator-visible build label: `V2.2-NX`)
- Date: 2026-05-28 / 2026-05-30
- Status: Phase 0 (security hardening) verified by operator. Follow-on batches through § 14 (LAN allowlist, simulator response, bandscope fix, theming, macros DB backend, macro builder UI) implemented and verified. 2026-05-27 session added §§ 15–18: cross-workstation source sync, **PresetBuilder rewrite + JSON-driven preset workflow**, **appearance-settings persistence in the database** (`settings.theme_overrides` column), and a **`V2.0-NX` fork identifier** rendered in the header (single-source via `runtimeConfig.public.appVersion`). 2026-05-28 session added § 19: **Smart Preset Builder + CAT command catalogue parsed from `docs/CAT-FTX1.pdf`** — 90-command authoritative catalogue, smart parameter validator (Save blocked on hard errors, warns on conditional / out-of-range), and a `?` help modal carrying the manual's page-4 usage primer plus a sortable / filterable quick-reference table. Same session added § 20: **Category-browsing Command Picker** — replaces the browser-native `<datalist>` with a custom viewport-anchored panel that browses all 90 catalogued commands by category, with auto-flip placement, keyboard navigation (`↑↓` / `Enter` / `Esc`), click-outside dismissal, and live tracking on scroll. § 21: **Binary toggle-switch presets** — eligible 0/1 CAT commands (LK, MX, ST, VX, BI, TS) can be marked `toggle: true` and render as stateful on/off buttons with a live green/red LED, mirroring the radio state via SSE (front-panel changes update the UI). § 22: **Rocket-launch toggle-switch visual style** — opt-in cosmetic variant that draws toggle presets as a physical bat-handle switch on a dark machined panel, controlled per preset via a new `toggleSwitch` flag in `cat-presets.json`. § 23: **`rigctld`-compatible TCP relay + live terminal panel** — `serial-server.mjs` now exposes a small subset of Hamlib's `rigctld` text protocol on port 4532 so external apps (WSJT-X, Fldigi, JS8Call, Gpredict, N1MM, CQRLOG, …) can drive the FTX-1 through our existing serial bridge. Includes per-connection gating via the existing § 9 IP allowlist, Hamlib-style virtual split (no hardware `ST1` ever sent), and a UI terminal panel that pops up next to the Band Scope on first client connect, showing colour-coded RX/TX lines with auto-scroll + resize handle. Companion document: `Hamlib-Research.md` (analysis that led to choosing this architecture over a full Hamlib integration). 2026-05-30 session added § 24: **Optional preset step timing + legacy macro UI hidden** — macro-style `delayMs` / `await` ported into JSON presets behind a Settings toggle (default off for FTX-1); macro builder UI hidden in favour of presets. Same session added § 25: **Saved channels, band UX, port fallback, settings polish** — localStorage saved channels with save modal (label, MHz, MAIN/SUB VFO), inline edit with SSE-safe drafts, band picker meter names, BS→FA/FB refresh, serial-server port probing on Windows, settings hex draft fix, `copy-project.bat`, refreshed `docs/main_page.png`. All sessions verified by the operator on the primary workstation.
- Companion document: `SECURITY-AUDIT.md` (full vulnerability report). Day-to-day modification log: `changelog.md` (root of the project).
- Scope of this document: every code change made in the cumulative NXC session, in chronological order. Sections 1–8 describe the initial Phase 0 (security hardening) batch; sections 9+ describe each follow-on batch. Where an earlier design was later superseded, the original section carries a note pointing to the replacement.

---

## 1. Pre-change checks

### 1.1 Malicious-code scan

A full source-tree scan was performed before any modification.

| Check | Result |
|---|---|
| `eval`, `new Function`, `child_process`, `exec`, `spawn` in project source | none |
| Obfuscation (`atob`, base64 `Buffer.from`, hex-escape blobs, `String.fromCharCode` chains, minified one-liners) | none — longest line in real source is 292 chars |
| Outbound network targets in source | only loopback (`127.0.0.1` / `localhost`); single external reference is a GitHub screenshot URL in `README.md` |
| Sockets / DNS / UDP / WebRTC / `sendBeacon` / clipboard / camera / mic / screen capture | none |
| Cryptominer signatures, keyloggers, telemetry beacons | none |
| Hidden / dotfiles with secrets | none (only `.gitignore`) |
| `package.json` install scripts | only `"postinstall": "nuxt prepare"` (standard) |
| Non-`registry.npmjs.org` resolvers in `package-lock.json` | one — `git+ssh://git@github.com/electron/node-gyp.git#06b29aaf…` — legitimate Electron fork used by `@electron/rebuild` (devDep only) |
| Suspect transitive package names | `powershell-utils@^0.1.0` traced to sindresorhus packages (`is-wsl`, `wsl-utils`) — legitimate |

Conclusion: no malicious code in the project's own source or in the dependency tree's resolution origins.

### 1.2 Audit findings addressed in this batch

From `SECURITY-AUDIT.md` section 9 (Prioritized remediation plan), the following P0 items are now implemented:

| Finding | Severity | Status |
|---|---|---|
| APP-01 — Nuxt API exposed on the LAN (no `HOST` binding) | HIGH | fixed (loopback by default, optional LAN via `ALLOWED_IPS` env — see § 9) |
| APP-02 — Wildcard CORS on the serial server | HIGH | fixed |
| NUXT-02 — No CSRF / Origin / Host check on Nuxt API | HIGH | fixed (host-check middleware in Phase 0; replaced by IP allowlist middleware in § 9) |
| APP-04 (partial) — Unauthenticated SSE stream | MEDIUM | fixed (token gate; later evolved to server-side proxy in § 9) |

Remaining P0 / P1 items not yet touched in this batch:

| Finding | Severity | Status |
|---|---|---|
| APP-03 — No CAT command allow-list | HIGH | pending (Step 3) |
| DEP-01 — Vulnerable transitive deps | HIGH | pending (Step 4) |
| APP-05 — Unbounded request body parser | MEDIUM | pending |
| APP-06 — Arbitrary serial-port path | MEDIUM | pending |
| EL-01 — Explicit `webPreferences` + CSP | MEDIUM | pending |
| NUXT-01 — Input schema validation | MEDIUM | pending |
| EL-02, EL-03, APP-07, APP-08, SC-02, FE-01 | LOW | pending |

---

## 2. Design summary

Two concerns are addressed:

1. **Network exposure.** Both local HTTP servers (the standalone serial server on `:3001` and the Nitro/Nuxt server on `:3000`) are now bound to `127.0.0.1` only, in both `npm run dev` and packaged Electron builds. The serial server additionally validates the `Host` header to defeat DNS-rebinding attacks.

2. **Authentication and CSRF.** A 256-bit per-launch random token (`SERIAL_TOKEN`) gates the serial server. The Nuxt server adds it as `Authorization: Bearer …` on every server-to-server call. The renderer obtains the same token via a host-gated `GET /api/sse-token` endpoint and includes it as a query-string parameter on the `EventSource` URL (since browsers cannot put custom headers on SSE). The Nuxt API additionally enforces an allow-list of `Host` + `Origin` values via Nitro middleware, blocking CSRF / DNS-rebinding before any handler runs.

Token resolution order, per process:

| Process | Source 1 (preferred) | Source 2 (fallback) |
|---|---|---|
| `serial-server.mjs` | `SERIAL_TOKEN` env (Electron build) | tmpdir token file (dev mode) |
| Nitro / `server/api/*` | `runtimeConfig.serialToken` from `NUXT_SERIAL_TOKEN` env (Electron build) | tmpdir token file (dev mode) |
| Renderer (browser) | `GET /api/sse-token` over the host-gated Nuxt API |  |

The token file lives at `os.tmpdir()/cat-ftx1-token`, mode `0600` on POSIX. It is created with `flag: 'wx'` to make the dev-mode startup race safe.

No new npm dependencies were added. Every new import is a Node built-in (`node:crypto`, `node:fs`, `node:os`, `node:path`) or a Nitro / h3 type already in the project.

---

## 3. Files modified

### 3.1 `serial-server.mjs`

Added top-of-file imports and the token bootstrapper:

```js
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
```

```js
const TOKEN_FILE = path.join(os.tmpdir(), 'cat-ftx1-token')

function ensureSerialToken() {
  const fromEnv = process.env.SERIAL_TOKEN?.trim()
  if (fromEnv) return fromEnv
  for (let i = 0; i < 5; i++) {
    try {
      const existing = readFileSync(TOKEN_FILE, 'utf-8').trim()
      if (existing) return existing
    } catch { /* file missing — fall through to create */ }
    try {
      const fresh = randomBytes(32).toString('hex')
      writeFileSync(TOKEN_FILE, fresh, { flag: 'wx', mode: 0o600 })
      return fresh
    } catch { /* race: another process just created the file — retry the read */ }
  }
  throw new Error('Unable to establish serial-server token')
}

const SERIAL_TOKEN = ensureSerialToken()

const ALLOWED_SSE_ORIGINS = new Set([
  'http://127.0.0.1:3000',
  'http://localhost:3000',
])
```

Replaced the request-handler entry block. The old wildcard CORS:

```js
res.setHeader('Access-Control-Allow-Origin', '*')
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control')
```

is gone. The new block enforces Host first, then Bearer (with the SSE-only `?token=` fallback):

```js
const hostHeader = req.headers.host ?? ''
if (hostHeader !== `127.0.0.1:${PORT}`) {
  res.writeHead(403, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'forbidden host' }))
  return
}

if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

const authHeader = req.headers.authorization ?? ''
const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
const isEventsGet = url.pathname === '/events' && req.method === 'GET'
const queryToken  = isEventsGet ? (url.searchParams.get('token') ?? '') : ''
const providedToken = headerToken || queryToken
if (!providedToken || providedToken !== SERIAL_TOKEN) {
  res.writeHead(401, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'unauthorized' }))
  return
}
```

Updated `/events` to emit a narrow per-origin CORS header instead of the wildcard:

```js
if (isEventsGet) {
  const origin = req.headers.origin ?? ''
  if (ALLOWED_SSE_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Content-Type', 'text/event-stream')
  ...
}
```

Added startup log line confirming which token source is in use (dev mode prints the token-file path; Electron build prints "loaded from env").

### 3.2 `electron/main.mjs`

Added the token generator and propagated it to both forked processes; also forced the Nitro process to loopback.

```js
import { randomBytes } from 'node:crypto'

const SERIAL_TOKEN = randomBytes(32).toString('hex')
```

```js
serialProc = utilityProcess.fork(wrapperScript, [], {
  env: {
    ...process.env,
    SERIAL_SERVER_PATH: serialScript,
    SERIAL_TOKEN,
  }
})
```

```js
nuxtProc = utilityProcess.fork(
  path.join(root, '.output/server/index.mjs'),
  [],
  {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      NITRO_HOST: '127.0.0.1',
      PORT: '3000',
      NUXT_SERIAL_SERVER_URL: 'http://127.0.0.1:3001',
      NUXT_SERIAL_TOKEN: SERIAL_TOKEN,
      CAT_RESOURCES_PATH: root
    }
  }
)
```

`HOST` and `NITRO_HOST` are both set because different Nitro versions read different variables; setting both is harmless.

### 3.3 `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  devtools: { enabled: false },
  ssr: false,
  devServer: { host: '127.0.0.1' },
  runtimeConfig: {
    serialServerUrl: 'http://127.0.0.1:3001',
    serialToken: '',
    public: {
      serialEventsUrl: 'http://127.0.0.1:3001/events',
    },
  },
})
```

`devServer.host` locks `npm run dev` to loopback. `runtimeConfig.serialToken` is the slot that Nitro auto-populates from `NUXT_SERIAL_TOKEN`.

### 3.4 `pages/index.vue`

> **Superseded by § 9.** This Phase 0 design fetched a token and put it on the `EventSource` URL. The follow-on batch moved SSE behind a server-side Nuxt proxy, so the browser now connects to `new EventSource('/api/events')` with no token in the URL. The function in `pages/index.vue` was simplified accordingly.

Phase 0 design:

Only `startEventSource` was changed. It is now `async`, fetches the per-launch token from the host-gated Nuxt endpoint, and appends it to the `EventSource` URL as a query parameter.

```ts
async function startEventSource() {
  stopEventSource()
  const config = useRuntimeConfig()

  let token: string
  try {
    const data = await $fetch<{ token: string }>('/api/sse-token')
    token = data.token
  } catch (e: any) {
    lastError.value = e.message ?? 'Failed to obtain SSE token'
    return
  }

  const url = `${config.public.serialEventsUrl}?token=${encodeURIComponent(token)}`
  const es = new EventSource(url)

  es.onmessage = (e) => { /* unchanged */ }
  es.onerror = () => { /* unchanged */ }

  eventSource = es
}
```

Both call sites (`toggleConnection` and `onMounted`) already used the fire-and-forget pattern, so the change from sync to async is backward-compatible.

### 3.5 `server/api/command.post.ts`

```ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.command) {
    throw createError({ statusCode: 400, message: 'command is required' })
  }
  try {
    return await serialFetch(event, '/command', { method: 'POST', body })
  } catch (e: any) {
    throw createError({ statusCode: e.status ?? 500, message: e.data?.error ?? e.message })
  }
})
```

Identical behavior; `serialFetch` adds the Bearer header.

### 3.6 `server/api/connect.post.ts`

```ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  try {
    return await serialFetch(event, '/connect', { method: 'POST', body })
  } catch (e: any) {
    throw createError({ statusCode: e.status ?? 500, message: e.data?.error ?? e.message })
  }
})
```

### 3.7 `server/api/disconnect.post.ts`

```ts
export default defineEventHandler(async (event) => {
  try {
    return await serialFetch(event, '/disconnect', { method: 'POST' })
  } catch (e: any) {
    throw createError({ statusCode: e.status ?? 500, message: e.data?.error ?? e.message })
  }
})
```

Handler now receives `event` (it was unused before) so it can pass it through to `serialFetch`.

### 3.8 `server/api/ports.get.ts`

```ts
export default defineEventHandler(async (event) => {
  try {
    return await serialFetch(event, '/ports')
  } catch {
    throw createError({ statusCode: 503, message: 'Serial server unavailable. Make sure serial-server.mjs is running.' })
  }
})
```

### 3.9 `server/api/preset-execute.post.ts`

```ts
export default defineEventHandler(async (event): Promise<PresetExecuteResult> => {
  const body = await readBody(event)

  if (!Array.isArray(body?.commands) || body.commands.length === 0) {
    throw createError({ statusCode: 400, message: 'commands array is required' })
  }

  try {
    return await serialFetch<PresetExecuteResult>(event, '/preset', {
      method: 'POST',
      body: { commands: body.commands },
    })
  } catch (e: any) {
    throw createError({
      statusCode: e.status ?? 500,
      message: e.data?.error ?? e.message,
    })
  }
})
```

Types `CommandResult` and `PresetExecuteResult` are unchanged.

### 3.10 `server/api/status.get.ts`

```ts
export default defineEventHandler(async (event) => {
  try {
    return await serialFetch(event, '/status')
  } catch {
    return {
      connected: false, port: null, baudRate: 38400,
      mainFreq: null, subFreq: null, mainMode: null, subMode: null,
      mainSmeter: null, subSmeter: null, txState: false, mox: false,
      split: false, agcMain: null, rfGainMain: null, afGainMain: null,
      powerLevel: null, radioInfo: null, lastUpdate: Date.now(),
      error: 'Serial server unavailable',
    }
  }
})
```

Disconnected-state fallback is preserved exactly.

---

## 4. Files added

### 4.1 `server/utils/serialAuth.ts`

Nitro auto-imports anything under `server/utils/`, so `getSerialToken` is callable from any server handler with no `import` line.

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'

const TOKEN_FILE = path.join(os.tmpdir(), 'cat-ftx1-token')

function readOrInitTokenFile(): string {
  for (let i = 0; i < 5; i++) {
    try {
      const existing = readFileSync(TOKEN_FILE, 'utf-8').trim()
      if (existing) return existing
    } catch { /* file missing — fall through to create */ }
    try {
      const fresh = randomBytes(32).toString('hex')
      writeFileSync(TOKEN_FILE, fresh, { flag: 'wx', mode: 0o600 })
      return fresh
    } catch { /* race: another process just created it — retry the read */ }
  }
  throw new Error('Unable to load serial-server token')
}

export function getSerialToken(event?: H3Event): string {
  const cfg = event ? useRuntimeConfig(event) : useRuntimeConfig()
  const fromCfg = ((cfg.serialToken as string) ?? '').trim()
  if (fromCfg) return fromCfg
  return readOrInitTokenFile()
}
```

### 4.2 `server/utils/serialFetch.ts`

```ts
import type { H3Event } from 'h3'
import type { FetchOptions } from 'ofetch'

export function serialFetch<T = unknown>(
  event: H3Event,
  apiPath: string,
  options: FetchOptions = {},
): Promise<T> {
  const cfg = useRuntimeConfig(event)
  const token = getSerialToken(event)
  return $fetch<T>(`${cfg.serialServerUrl}${apiPath}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  }) as Promise<T>
}
```

### 4.3 `server/middleware/host-check.ts`

> **Superseded by § 9 (replaced by `server/middleware/ip-allowlist.ts`).** This file was deleted when the IP-allowlist design landed; LAN access is now controlled by remote-address checks instead of `Host` / `Origin` headers, because headers cannot be trusted when the operator opts into LAN exposure.

Phase 0 design:

Runs before every `/api/*` handler.

```ts
const ALLOWED_HOSTS = new Set([
  '127.0.0.1:3000',
  'localhost:3000',
])

const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:3000',
  'http://localhost:3000',
])

export default defineEventHandler((event) => {
  const req = event.node.req
  const host = (req.headers.host ?? '').toLowerCase()
  if (!ALLOWED_HOSTS.has(host)) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden host' })
  }
  const origin = req.headers.origin
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden origin' })
  }
})
```

Top-level page navigations have no `Origin` header, so the page itself still loads at `http://localhost:3000/`. Same-origin `$fetch` calls from the page include the matching `Origin`. Cross-origin pages (a malicious site) always send their `Origin`, which fails the allow-list.

### 4.4 `server/api/sse-token.get.ts`

> **Superseded by § 9 (file removed).** The browser no longer needs to know the serial-server token: SSE is proxied through the Nuxt server, which holds the token internally. See `server/api/events.get.ts` in § 9.

Phase 0 design:

```ts
export default defineEventHandler((event) => {
  return { token: getSerialToken(event) }
})
```

A cross-origin page cannot read the response body because the host-check middleware throws 403 before this handler ever runs.

### 4.5 `sim-serial-port.mjs`

In-process software simulator that mimics a Yaesu FTX-1 over the serial-port API. Loaded only when `SIMULATE_RIG=1` is set in the environment. Exports `SimulatedSerialPort` (a drop-in replacement for `serialport`'s `SerialPort` for the subset used by `SerialManager`) and `SIM_PORT_PATH` (`'SIM-FTX1'`).

The class implements:
- `.isOpen`, `.open(cb)`, `.close(cb)` — match the `SerialPort` v12 contract.
- `.write(data, cb)` — parses CAT command frames split on `;` and emits responses via the attached parser.
- `.pipe(parser)` — stores the `ReadlineParser` so the simulator can push frames directly into it.
- Auto-pushed `SM0`/`SM1` S-meter frames every 500 ms while AI mode is active, so the UI shows a live needle.

The state mirror is initialised to a sane default (14.250 MHz USB / 144.800 MHz FM, AGC AUTO-M, 50 W power, etc.). All set commands update the mirror and echo the new value back, so the front-end state stays in sync without any extra code paths.

The serial server picks up the simulator via a guarded dynamic import:

```js
const SIMULATE_RIG = process.env.SIMULATE_RIG === '1'
let SimulatedSerialPort = null
let SIM_PORT_PATH = null
if (SIMULATE_RIG) {
  const mod = await import('./sim-serial-port.mjs')
  SimulatedSerialPort = mod.SimulatedSerialPort
  SIM_PORT_PATH = mod.SIM_PORT_PATH
  console.log(`[serial-server] simulator enabled — port "${SIM_PORT_PATH}" available`)
}
```

`SerialManager.listPorts()` prepends the sim port when the flag is on, and `SerialManager.connect(portPath, ...)` constructs `SimulatedSerialPort` instead of `SerialPort` when `portPath === SIM_PORT_PATH`. The rest of the connect flow (ID query, AI1 enable, initial sync, SSE broadcast) is unchanged and runs against the mock exactly as it would against the radio.

---

## 5. Threat-model walkthrough after the change

| Attacker | Path | Result |
|---|---|---|
| LAN host on `192.168.x.x` | `http://A:3000/api/command` | TCP refused at OS layer (Nitro bound to `127.0.0.1`) |
| LAN host on `192.168.x.x` | `http://A:3001/command` | TCP refused at OS layer (serial-server bound to `127.0.0.1`) |
| Malicious page at `https://evil.com` | `fetch('http://localhost:3000/api/command', …)` | Host passes, **Origin `https://evil.com` → 403** by host-check middleware |
| Malicious page at `https://evil.com` | `fetch('http://127.0.0.1:3001/command', …)` | Host passes, **no Bearer → 401** |
| Malicious page at `https://evil.com` | `new EventSource('http://127.0.0.1:3001/events?token=GUESS')` | 256-bit random token → **401**. Even if matched, `Origin` not in `ALLOWED_SSE_ORIGINS`, so the browser blocks reading |
| DNS-rebinding attempt against `attacker.com → 127.0.0.1` | any URL | `Host: attacker.com` fails the Host header check on the serial server, fails the middleware on Nuxt |
| Legitimate Electron renderer at `http://localhost:3000` | every flow | passes Host + Origin, fetches `/api/sse-token`, opens SSE with token, all `/api/*` calls succeed via `serialFetch` → Bearer |

---

## 6. Compatibility notes

- No new npm dependencies, no `npm install` step required.
- Project conventions preserved: `.mjs` for Electron / serial-server code, `.ts` for Nitro server code, `camelCase` symbol names, two-space indentation, single quotes, no semicolons unless already present.
- Existing API request and response shapes are unchanged; only the headers carried between Nuxt and the serial server are different.
- The token-file fallback in `os.tmpdir()` is used only in dev mode (`npm run dev`). In packaged Electron builds, `SERIAL_TOKEN` / `NUXT_SERIAL_TOKEN` are always set, so the file is never created.
- The token-file in dev mode persists between `npm run dev` runs (same token until the OS clears the tmpdir). Acceptable: it remains a 256-bit secret in a user-owned, mode-`0600` file.
- The page reload behavior is unchanged: on reconnect, `EventSource` re-uses the same `?token=` URL, which still matches the running serial server's token.

---

## 7. Verification checklist (operator: please run these before approving)

### 7.1 With the real radio (when available)

1. `npm run dev` and open `http://127.0.0.1:3000`:
   - Port list loads.
   - Connect to the radio succeeds.
   - S-meter / frequencies update live (this proves the SSE-with-token path).
   - A manual CAT command and a preset both execute.
2. `npm run electron:dev` (or a full `npm run electron:build` and run the installer):
   - All of the above, but in the packaged binary. The packaged build uses `SERIAL_TOKEN` from env (no temp file involvement).
3. From another machine on the LAN:
   - `curl http://<your-ip>:3000/api/status` — should fail with connection refused (proves APP-01 fix).
   - `curl http://<your-ip>:3001/status` — should also fail with connection refused.
4. With the dev server running, in a browser console on any external site (e.g. `https://example.com`):
   - `fetch('http://localhost:3000/api/status').then(r => r.json()).catch(e => e)` — expect 403 (forbidden origin) or browser-level CORS error.
   - `new EventSource('http://127.0.0.1:3001/events')` — expect 401 in the Network panel.
5. Optional: verify the temp-mode token path. Stop the Electron app and the dev server, delete `os.tmpdir()/cat-ftx1-token` (Windows: `%TEMP%\cat-ftx1-token`), then `npm run dev` again. The serial-server should log `[serial-server] auth token written to <path>`.

### 7.2 Without the radio — using the built-in simulator

The simulator pretends to be an FTX-1 entirely in-process. No virtual COM port, no extra install. It is gated by the `SIMULATE_RIG=1` environment variable so it never activates in normal use.

PowerShell (Windows):

```powershell
$env:SIMULATE_RIG = "1"
npm run dev
```

bash / zsh (macOS / Linux):

```bash
SIMULATE_RIG=1 npm run dev
```

Then in the renderer at `http://127.0.0.1:3000`:

1. Open the port dropdown — `SIM-FTX1` appears at the top with manufacturer `CAT FTX-1 Simulator`.
2. Pick any baud (the simulator ignores it) and press **Connect**.
3. Confirm:
   - Radio is identified as FTX-1 (no "Unknown radio ID" error).
   - Main VFO shows `14.250.000` MHz / USB.
   - Sub VFO shows `144.800.000` MHz / FM.
   - S-meter for both VFOs ticks every ~500 ms (random walk).
   - Volume, RF gain, power level, AGC, etc. all read sensible values.
4. Exercise mutations:
   - Mouse-wheel on the main frequency digits → MHz/kHz/Hz changes follow.
   - Click a mode button (e.g. CW-U) → mode badge updates after a microsecond round-trip.
   - Drag the VOLUME bar → number updates and an SSE delta arrives.
   - Pick a preset (e.g. "APRS ON") → the multi-command sequence is reflected in the state mirror.
5. Press **Disconnect** → connection drops cleanly, simulator stops ticking.

Files involved in the simulator:
- `sim-serial-port.mjs` — the mock SerialPort class (only loaded when `SIMULATE_RIG=1`).
- `serial-server.mjs` lines 21–35 — the dynamic-import guard, sim port advertisement, and conditional construction of the mock.

The simulator does **not** ship in production unless `SIMULATE_RIG=1` is set in the user's environment, so this addition has no runtime footprint in normal use.

A smoke run with `Invoke-WebRequest` against the running simulator was performed during this change:

| Test | Result |
|---|---|
| GET `/status` with no `Authorization` | 401 (token gate active) |
| GET `/status` with `Host: localhost:3001` | 403 (Host check active) |
| GET `/ports` with valid Bearer | 200, includes `SIM-FTX1` |
| POST `/connect` with `{port:"SIM-FTX1"}` | radio identified, AI mode on, state populated |
| POST `/command` with `{command:"FA014265000"}` | state mirror updates to `mainFreq: 14265000` |
| POST `/disconnect` | clean teardown |

---

## 8. Next steps (not yet implemented)

Once the verification above passes:

- **Step 3 — Server-side CAT command allow-list (APP-03, HIGH).** Restrict `/command` and `/preset` to the ~50 prefixes the UI actually emits. Reject commands longer than 32 bytes. Optionally require an explicit acknowledgement flag for PTT-keying commands (`TX`, `MX`, `MOX`, `FT`).
- **Step 4 — `npm audit fix` for non-breaking advisories; separate change for `@electron/rebuild` v3 → v4 and `electron-builder` v24 → v26.**
- **Steps 5+ — Body-size cap, port-path validation, Electron `webPreferences` + CSP, log location, etc.** as listed in `SECURITY-AUDIT.md` section 9.

`changelog.md` will be updated only after you have verified and approved the modifications described above.

---

## 9. Follow-on batch — LAN exposure with optional IP allowlist (2026-05-26)

### 9.1 Motivation

Operator requested LAN access (other devices on the local network must be able to use the UI). The Phase 0 design hard-bound everything to `127.0.0.1`. The redesign keeps loopback as the safe default and lets the operator opt into LAN exposure by setting `ALLOWED_IPS` to a comma-separated list of IPv4/IPv6 addresses or CIDR blocks. Because `Host`/`Origin` headers can be spoofed by any HTTP client (only browsers send them honestly), the access control switches from header-based to **remote-address based**. The serial server stays bound to loopback unconditionally; only the Nuxt UI server is exposed.

### 9.2 `nuxt.config.ts`

```ts
function computeDevHost(allowedIpsEnv) {
  return (allowedIpsEnv ?? '').trim() ? '0.0.0.0' : '127.0.0.1'
}

export default defineNuxtConfig({
  devtools: { enabled: false },
  ssr: false,
  devServer: { host: computeDevHost(process.env.ALLOWED_IPS) },
  runtimeConfig: {
    serialServerUrl: 'http://127.0.0.1:3001',
    serialToken: '',
  },
})
```

`public.serialEventsUrl` was removed — the browser no longer talks to the serial server directly. A startup `console.log` prints the active `ALLOWED_IPS` and `devServer.host` so the operator can see the binding decision in the dev output.

### 9.3 `electron/main.mjs`

`computeNuxtHost(allowedIps)` mirrors `computeDevHost`; the forked Nitro child receives `HOST` and `NITRO_HOST` set to `127.0.0.1` by default, or `0.0.0.0` when `ALLOWED_IPS` is set. The serial-server child is always passed `HOST=127.0.0.1`. `ALLOWED_IPS` is forwarded to the Nitro child unchanged.

### 9.4 `server/utils/ipAllowlist.ts` (new)

```ts
import net from 'node:net'

let cachedSpec  = ''
let cachedBlock = null

function buildBlockList(spec) {
  const list = new net.BlockList()
  const bad = []
  for (const raw of spec.split(',').map(s => s.trim()).filter(Boolean)) {
    const [addr, mask] = raw.includes('/') ? raw.split('/') : [raw, null]
    const family = addr.includes(':') ? 'ipv6' : 'ipv4'
    try {
      if (mask) list.addSubnet(addr, Number(mask), family)
      else      list.addAddress(addr,           family)
    } catch { bad.push(raw) }
  }
  return { list, bad }
}

export function getAllowedIpsSpec() {
  return (process.env.ALLOWED_IPS ?? '').trim()
}

export function checkRemoteAddress(remote) {
  const spec = getAllowedIpsSpec()
  if (!spec) return { allow: remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1', reason: 'loopback-only' }
  if (spec !== cachedSpec) {
    const { list, bad } = buildBlockList(spec)
    cachedSpec = spec
    cachedBlock = list
    if (bad.length > 0) console.warn('[ip-allowlist] invalid entries ignored:', bad.join(', '))
    console.log(`[ip-allowlist] active allowlist (from env): "${spec}"`)
  }
  const normalised = remote.startsWith('::ffff:') ? remote.slice(7) : remote
  const family = normalised.includes(':') ? 'ipv6' : 'ipv4'
  try {
    return { allow: cachedBlock.check(normalised, family), reason: 'allowlist' }
  } catch {
    return { allow: false, reason: 'invalid-remote' }
  }
}
```

### 9.5 `server/middleware/ip-allowlist.ts` (new, replaces `host-check.ts`)

```ts
const seen = new Set()

export default defineEventHandler((event) => {
  const remote = event.node.req.socket?.remoteAddress
  // In Nuxt dev, in-process requests (Vite SSR shell, internal Nitro fetch) have no
  // remoteAddress. These are trusted and must pass, otherwise the dev server cannot
  // serve its own SPA shell.
  if (!remote) return
  const { allow } = checkRemoteAddress(remote)
  const key = `${allow ? 'ALLOW' : 'DENY'}:${remote}`
  if (!seen.has(key)) {
    seen.add(key)
    console.log(`[ip-allowlist] ${allow ? 'ALLOW' : 'DENY'} remote="${remote}"`)
  }
  if (!allow) throw createError({ statusCode: 403, statusMessage: 'forbidden ip' })
})
```

The duplicate-suppressed logging avoids flooding the console while still showing the first connection from every unique client.

### 9.6 `server/api/events.get.ts` (new, replaces `sse-token.get.ts`)

```ts
export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event)
  const token = getSerialToken(event)
  const upstream = await $fetch.raw(`${cfg.serialServerUrl}/events`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    responseType: 'stream',
  })
  setResponseHeaders(event, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
  })
  return sendStream(event, upstream._data)
})
```

Result:
- The browser connects to `/api/events` (same origin, no token).
- The Nuxt server holds the per-launch token internally and forwards as Bearer.
- IP-allowlist middleware gates the proxy entry exactly like every other `/api/*` handler.
- The serial server's loopback-only binding stays in force.

### 9.7 `pages/index.vue`

`startEventSource` is now a synchronous one-liner:

```ts
function startEventSource() {
  stopEventSource()
  const es = new EventSource('/api/events')
  es.onmessage = (e) => { /* unchanged */ }
  es.onerror = () => { /* unchanged */ }
  eventSource = es
}
```

### 9.8 Operational notes

- Default behavior (no env var) is **loopback only**, equivalent to Phase 0.
- To allow the local subnet plus loopback:
  - Windows PowerShell: `$env:ALLOWED_IPS = "127.0.0.1/8,::1,192.168.1.0/24"; npm run dev`
  - bash / zsh: `ALLOWED_IPS="127.0.0.1/8,::1,192.168.1.0/24" npm run dev`
- Single IPs are accepted alongside CIDR blocks; invalid entries are dropped with a `[ip-allowlist] invalid entries ignored:` warning.

### 9.9 Threat-model update (replaces table in § 5)

| Attacker | Path | Result |
|---|---|---|
| LAN host outside `ALLOWED_IPS` | `http://<server>:3000/api/*` | reachable on TCP, **403 forbidden ip** before any handler |
| LAN host inside `ALLOWED_IPS` (intended user) | `http://<server>:3000/api/*` | allowed, same code path as loopback |
| Any LAN host | `http://<server>:3001/*` | TCP refused (serial server unconditionally on `127.0.0.1`) |
| Malicious page (anywhere) | `fetch('http://<server>:3000/api/command')` | passes IP check only if the attacker is physically on the LAN; if so they can also brute-force the radio anyway. CSRF via embedded `<form>` from a public site to a private IP is the residual risk and is mitigated by browser private-network access rules |
| DNS-rebinding | `attacker.com → 127.0.0.1` | the resolver sees `127.0.0.1` on the renderer side, so the IP check passes; this is acceptable because the renderer itself is the rebinding target and any other route fails the IP check |

The remaining CSRF / rebinding residual is the cost of allowing LAN exposure; the operator must opt in explicitly.

---

## 10. Follow-on batch — manual CAT command response (2026-05-26)

### 10.1 Motivation

In the renderer, the "Send CAT command" text input fired the command but never displayed the radio's reply. With the simulator (and the real rig once it arrives) every query-type command does have a response that should be shown.

### 10.2 `serial-server.mjs`

`POST /command` now accepts an optional `await: true` flag in the body. When set, the handler returns the radio's reply (terminated on `;`) within a configurable timeout (default 1000 ms) and falls back to returning the empty string on timeout. The default `await: false` keeps the existing fire-and-forget contract for callers that don't care.

```js
if (body.await === true) {
  const reply = await sendAndAwait(body.command, { timeoutMs: body.timeoutMs ?? 1000 })
  return res.status(200).json({ ok: true, reply })
}
manager.sendCommand(body.command)
return res.status(200).json({ ok: true })
```

### 10.3 `pages/index.vue`

`sendManualCommand()` now sends `{ command, await: true }`, and the resolved reply is rendered next to the input with a small "→" arrow and a fade-out timer.

### 10.4 `sim-serial-port.mjs`

The simulator now generates a sensible reply for every supported command (read commands echo current state, set commands return the just-applied value), so the manual-command UI behaves the same against the simulator as it will against the rig.

---

## 11. Follow-on batch — bandscope level visual fix (2026-05-26)

### 11.1 Symptom

The bandscope "Level" indicator drew its fill bar past the right edge of the card whenever the signal level went above mid-scale.

### 11.2 Cause and fix

`scopeLevelFillStyle` produced a percentage that could exceed 50 % of the half-track width, so the absolutely-positioned fill overflowed the parent.

The percentage is now clamped between -50 % and 50 %:

```ts
const scopeLevelFillStyle = computed(() => {
  const pct = clamp(((value - center) / range) * 100, -50, 50)
  return { '--scope-level-fill': `${pct}%` }
})
```

CSS belt-and-braces:
- `.scope-level-fill { max-width: 50%; }` — defensive cap.
- `.scope-level-track { min-width: 0; overflow: visible; }` — keep the center-tick visible without clipping the parent card.

No changes outside the bandscope subtree, and the math is identical for negative-direction fills.

---

## 12. Follow-on batch — appearance settings drawer (theming) (2026-05-26)

### 12.1 Goal

Let the operator personalise colors, corner radius and the monospace font from the UI itself, persisting the customisation per device in `localStorage` (`cat_theme` key). Phase 0 already exposed the design tokens as CSS custom properties; this batch adds the drawer that edits them.

### 12.2 `pages/index.vue`

- Header gains a **⚙** icon that opens a right-side drawer (`.settings-overlay` + `.settings-panel`).
- Constants `THEME_DEFAULTS`, `COLOR_VARS`, and `FONT_OPTIONS` declare the editable surface area.
- `themeOverrides` (ref to a Record) stores only operator-modified variables, **not** the defaults — so reverting to default is automatic when an override is cleared.
- `applyTheme()` sets/removes properties on `document.documentElement.style`.
- `loadTheme()` rehydrates from `localStorage` on `onMounted`.
- `resetTheme()` clears the overrides ref and removes every variable from `documentElement`.

The drawer body contains:
- A "Colors" section that lists each color token from `COLOR_VARS` with both a color-picker and a hex input.
- A "Layout" section with a slider for `--radius` and a select for `--font-mono`.
- A footer showing "N override(s) active" plus a "Reset to defaults" button.

### 12.3 Extra design tokens for the VFO cards

Operator requested independent backgrounds for the main and sub VFO cards:

```css
:root {
  --vfo-card-main: #161b22;   /* main VFO card bg */
  --vfo-card-sub:  #161b22;   /* sub  VFO card bg */
}
.main-card { background: var(--vfo-card-main); }
.sub-card  { background: var(--vfo-card-sub);  }
```

`.vfo-card` no longer carries a `background` shorthand of its own, so both child variants are free to differ. The two new variables are included in `COLOR_VARS` so they appear in the drawer.

### 12.4 No persistence schema changes

Theming state lives entirely in `localStorage` (browser-side); the server and DB are unchanged.

---

## 13. Follow-on batch — Macro system **Phase 1 — SQLite backend** (2026-05-26)

### 13.1 Goal

Persist user-defined CAT commands and ordered macros in a SQLite database. Per operator instruction:
- FTX-1 only for now (every row stamped `rig_id = 'ftx1'`).
- **No seed data.** The operator will add commands manually from the UI; the supplied PDF (`CAT-FTX1.pdf`) is the reference for what is possible, not a data source.
- Database backend: `better-sqlite3`.
- DB location: `<project>/data/cat-ftx1.db` in dev mode, `<userData>/cat-ftx1.db` in packaged Electron builds.

### 13.2 `package.json`

- New dependency: `"better-sqlite3": "^11.3.0"` (matching the lockfile that was already aligned).
- `scripts.electron:rebuild` and `scripts.electron:build` extended to include `better-sqlite3` in the native-module rebuild step.
- `build.extraResources` now copies `sql/` and `node_modules/better-sqlite3` into the packaged app.

> **Operator install note:** after pulling this change a one-time `npm install` is required to fetch `better-sqlite3`. Packaged Electron builds additionally need `npm run electron:rebuild` so the native binding matches the Electron ABI.

### 13.3 `sql/schema.sql`

Idempotent — every statement is `IF NOT EXISTS`. The project convention is "no migrations"; schema evolutions are appended as additional `IF NOT EXISTS` statements.

Three tables:
- `cat_commands` — id, rig_id, name, category, raw_template, param_label, param_type (`none`/`int`), param_default, expects_response, description, is_builtin, created_at.
- `cat_macros` — id, rig_id, name, description, created_at, updated_at, `UNIQUE(rig_id, name)`.
- `cat_macro_steps` — id, macro_id (FK CASCADE), position, command_id (FK SET NULL), raw_command, param_value, delay_ms (CHECK 0..60000), note, `UNIQUE(macro_id, position)`.

`PRAGMA foreign_keys = ON;` and `PRAGMA journal_mode = WAL;` enabled.

### 13.4 `server/utils/db.ts`

```ts
let _db = null

export function useDb() {
  if (_db) return _db
  const dbPath = process.env.CAT_DB_PATH
    ?? path.join(process.cwd(), 'data', 'cat-ftx1.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  _db = new Database(dbPath)
  _db.pragma('foreign_keys = ON')
  _db.pragma('journal_mode = WAL')
  const schemaPath = process.env.CAT_RESOURCES_PATH
    ? path.join(process.env.CAT_RESOURCES_PATH, 'sql', 'schema.sql')
    : path.join(process.cwd(), 'sql', 'schema.sql')
  _db.exec(fs.readFileSync(schemaPath, 'utf-8'))
  console.log(`[db] opened ${dbPath}`)
  return _db
}
```

`closeDb()` exists for tests but isn't currently invoked by the runtime — Nitro handles process exit.

### 13.5 `server/utils/templateEngine.ts`

Resolves Python-style `{name:NNd}` placeholders inside `raw_template`. Currently supports:
- `{name}` — plain string substitution.
- `{name:NNd}` and `{name:0NNd}` — zero-padded non-negative integer with explicit width; values exceeding the width are rejected.

`templateHasParameter(template)` returns true iff the template contains exactly one placeholder. The same logic is re-implemented (mirrored) in the browser inside `MacroBuilder.vue` for live preview purposes, but the server remains the source of truth — every macro step's `raw_command` is resolved server-side before insert.

### 13.6 `server/utils/macroValidation.ts`

`resolveSteps(db, stepsInput)` iterates each step, looks up its command row, validates that `param_value` is supplied iff the template needs one, validates `delay_ms` against the SQL CHECK, and returns the fully-resolved row to insert. Throws a structured `createError` on the first invalid step so the UI can surface "step N: …".

### 13.7 API endpoints (Nitro)

All endpoints are under the IP-allowlist middleware (so they're loopback-only by default, LAN with explicit opt-in).

Commands:
- `GET    /api/cat-commands`              — list, with optional `category`, `q`, `rig_id` filters.
- `POST   /api/cat-commands`              — create a custom command (always `is_builtin = 0`).
- `PUT    /api/cat-commands/[id]`         — update (rejects `is_builtin = 1`).
- `DELETE /api/cat-commands/[id]`         — delete (rejects `is_builtin = 1`).

Macros:
- `GET    /api/macros`                    — list with step counts.
- `GET    /api/macros/[id]`               — full macro with steps joined to command metadata.
- `POST   /api/macros`                    — create with steps in one transaction; 409 on duplicate name per rig.
- `PUT    /api/macros/[id]`               — atomic replace (metadata + steps) in one transaction.
- `DELETE /api/macros/[id]`               — cascade-delete via FK.
- `POST   /api/macros/[id]/run`           — iterates steps, calls `serialFetch(event, '/command', …)` for each, honours per-step `delay_ms`, and returns `{ ok, results: [{ position, raw_command, ok, awaited, response?, error? }] }`. Step responses are awaited only when the source command has `expects_response = 1`.

### 13.8 `server/plugins/db-init.ts`

Eager DB initialisation at Nitro startup, so the file is created the moment the dev server boots rather than on first API call. This fixed an early-test surprise where the `data/` directory existed but `cat-ftx1.db` did not until the first request hit a `useDb()` call.

```ts
export default defineNitroPlugin(() => { useDb() })
```

### 13.9 `electron/main.mjs`

Adds `CAT_DB_PATH` to the env passed into the Nitro child:
- Dev mode: `<project>/data/cat-ftx1.db`.
- Packaged mode: `<userData>/cat-ftx1.db`.
- The `data/` directory is created on startup if missing.

### 13.10 `.gitignore`

`data/` appended so DB files (and WAL/SHM siblings) stay out of source control.

### 13.11 Smoke-test summary

After the changes, an end-to-end PowerShell smoke test was run against the simulator:
- Create three commands (mode, frequency with `{hz:09d}`, NB level with `{level:03d}`).
- Create one macro chaining them with delays.
- `GET /api/macros/{id}` returns steps with resolved `raw_command`.
- `POST /api/macros/{id}/run` runs all steps in order, returns `ok: true`.
- Duplicate-name save returns `409` with `macro "name" already exists for this rig`.
- Delete a custom command, delete a macro — both cascade cleanly.
- Built-in command (`is_builtin = 1`) cannot be updated or deleted (`403`).

All assertions passed.

---

## 14. Follow-on batch — Macro system **Phase 2 — Macro Builder UI** (2026-05-26)

### 14.1 Goal

In-browser editor for creating, editing, deleting and running macros without the operator ever touching the database or the API directly. Plus a header quick-run dropdown so saved macros are one click away from the main dashboard.

### 14.2 `components/MacroBuilder.vue` (new)

Full-screen overlay with two columns and a bottom action bar.

Left pane — command library:
- Text filter and category filter, both live and combinable.
- `+ New cmd` button opens a mini dialog that posts to `/api/cat-commands` (name, category, template, `param_type`, `param_label`, `param_default`, `expects_response`, description).
- Each row is click-to-add. Custom commands (`is_builtin = 0`) show a small `✕` to delete them; built-ins do not.

Right pane — current macro:
- Saved-macro select to switch which macro is being edited (or start a new one).
- Name (required) and description (optional) inputs.
- Step list with position, command name, **resolved template preview** (placeholders substituted live as the operator types parameter values), per-step **param value** input (only when the template needs one), per-step **delay (ms)** input, an `⏱` badge for steps whose source command expects a response, and `↑ ↓ ✕` buttons.
- Action bar: `Save` (POST or PUT), `Run` (only enabled once the macro has been persisted), `Clear steps`, and a status line. A `Delete` button appears whenever a saved macro is loaded.
- Last-run result block underneath, listing each step's outcome with the awaited reply (when applicable) or the error message.
- `Esc` closes the builder; clicking outside the panel also closes it.

The placeholder regex (`/\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^}]*))?\}/g`) and the integer-format resolver are re-implemented locally in the component for live preview only; **every save still routes through the server-side template engine**, which remains the canonical resolver.

### 14.3 `pages/index.vue`

Header gets two new controls placed before the existing `⚙` (Appearance) button:
- `▶ Run ▾` quick-run dropdown — lists saved macros (name + step count). A `▶` button on each row runs the macro (disabled when disconnected; the dropdown shows a yellow "connect to run" hint in that state). A `✎` button opens the builder pre-loaded with that macro. A "+ New macro / open builder" footer link opens the empty builder.
- `☰` icon — opens the builder for a new macro directly.

Dropdown behavior:
- Toggled on click. Closed by click-outside via a `mousedown` listener that's attached only while the dropdown is open.
- Refreshes its list whenever the builder emits `saved`.

Toast:
- A bottom-right toast (`.macro-toast`) appears for ~4 s after every quick-run, green on success or red on failure with the first failed step and its error.

Lifecycle:
- `loadQuickMacros()` runs in `onMounted`.
- `onUnmounted` clears the toast timer and removes the global `mousedown` listener.

### 14.4 Styles

All new styles use the existing theme tokens (`--surface`, `--surface2`, `--accent`, `--green`, `--red`, `--yellow`, `--text-muted`, `--border`, `--font-mono`). This means the theming drawer from § 12 affects the macro builder and the quick-run UI without any extra wiring. Style classes are prefixed `.mb-…` inside the component (scoped) and `.macro-…` for the header pieces inside `pages/index.vue` (unscoped).

### 14.5 No new npm dependencies

The UI batch added no dependencies; everything builds on what § 13 already pulled in.

### 14.6 Verification checklist (operator: please run before approving § 14)

1. `npm run dev` (optionally with `ALLOWED_IPS=…`).
2. Click `☰` in the header. The builder opens with both panes empty (DB starts blank per operator instruction).
3. Click `+ New cmd` and add at least two commands — one with no param (`MD02;` mode USB), one with a parameter (`FA{hz:09d};`, param_type `int`, default `14225000`).
4. The new commands appear in the left pane; verify the category filter and text filter both behave.
5. Click rows on the left to add steps; reorder with `↑/↓`; tweak param values and delays. Confirm the resolved template preview updates as you type.
6. Enter a name ("USB"), click `Save` → status line shows `Saved "USB"`.
7. Close the builder. The header `▶ Run ▾` dropdown now lists USB. Click it. Toast confirms success (or shows the failing step).
8. Reopen the macro via the `✎` icon in the dropdown. Make a change, `Save` → status line confirms update; the dropdown reflects the new step count after `saved` is emitted.
9. Try to save a second macro with the same name → status shows the 409 message verbatim ("macro "USB" already exists for this rig").
10. Delete a custom command from the left pane; confirm any step referencing it still survives (the FK uses `ON DELETE SET NULL`, and the step's `raw_command` was resolved at save time so it stays runnable).
11. Delete the macro from the right pane; confirm it disappears from the header dropdown.

Once verified, `changelog.md` will be updated to cover §§ 9–14 in one entry dated 2026-05-26.

---

## 15. Follow-on batch — cross-workstation source synchronization (2026-05-27)

### 15.1 Motivation

Development continued on a secondary workstation. The operator copied
the changed source files into `D:\cat-ftx1-main\nxc\cat-ftx1\` on the
primary workstation and asked for the working tree at
`D:\cat-ftx1-main\cat-ftx1-main\` to be brought into sync.

### 15.2 Three-stage diff

A hash compare (MD5) of every file under `components/`, `pages/`,
`server/`, plus `sql/` and `data/`, identified:

- **2 modified files**: `pages\index.vue`, `server\api\presets.get.ts`.
- **10 new files**: `components\PresetBuilder.vue`,
  `server\api\json-presets.{get,put}.ts`, `server\api\settings.{get,put}.ts`,
  `server\api\presets.post.ts`,
  `server\api\presets\[id].{get,put,delete}.ts`,
  `server\api\presets\[id]\run.post.ts`.
- **1 schema upgrade**: `sql\schema.sql` extended (additive) with three
  new tables: `settings`, `presets`, `preset_steps`. All statements use
  `CREATE TABLE IF NOT EXISTS` and the existing tables are unchanged,
  so re-applying the schema on an existing DB is a no-op.
- **1 DB file**: `data\cat-ftx1.db` overwritten with the source DB
  (81 920 B vs 45 056 B locally). The previous local DB was preserved
  as `data\cat-ftx1.db.bak` before the overwrite.
- **0 files only in destination** — pure additive + 2 overwrites,
  nothing removed.

### 15.3 Schema vs endpoint cross-check

Each new endpoint's SQL was checked column-by-column against the new
`schema.sql` before adopting the synced files:

| Endpoint | Tables / columns used | Verdict |
|---|---|---|
| `GET  /api/presets` | `presets(id,name,description) ⋈ preset_steps(raw_command)` | matches |
| `POST /api/presets` + `PUT/DELETE /api/presets/[id]` | full CRUD with FK cascade on `preset_steps` | matches |
| `POST /api/presets/[id]/run` | reads `preset_steps`, subselects `cat_commands.expects_response` | matches |
| `GET/PUT /api/settings` | `settings(rig_id,call_sign,color_primary,color_accent,color_bg,font_mono,radius_px)` — single-row guarded by `id INTEGER PRIMARY KEY CHECK (id = 1)` | matches |
| `GET/PUT /api/json-presets` | filesystem only (reads/writes `cat-presets.json`) | n/a |

Because `db.exec(schemaSql)` re-runs at every startup via
`server/plugins/db-init.ts` and the schema is idempotent, the existing
DB auto-upgrades to the new shape on first launch — no manual migration
was needed at this stage.

### 15.4 better-sqlite3 ABI mismatch (flagged)

While inspecting the synced DB with the project's own
`better-sqlite3`, the runtime reported

> `NODE_MODULE_VERSION 141. This version of Node.js requires
> NODE_MODULE_VERSION 127.`

`node_modules/better-sqlite3` was prebuilt for Node 26+ on the
secondary workstation, but the local Node is 22.22.0. The fix is one
of

```
npm rebuild better-sqlite3
```

or a fresh `npm install`. The defect was flagged to the operator in
the session messages; no code change was needed in the project itself.

---

## 16. Follow-on batch — PresetBuilder rewrite + JSON-driven preset workflow (2026-05-27)

### 16.1 Symptom

Application failed to load with

> `Failed to fetch dynamically imported module:
> http://localhost:3000/_nuxt/components/PresetBuilder.vue`

### 16.2 Root cause

`components/PresetBuilder.vue` (one of the files brought over by § 15)
was the product of an interrupted previous editing session that left
two competing designs entangled:

- Lines 1–113: a clean first `<template>` block (a simple textarea
  editor for `cat-presets.json`) closed at line 113.
- Lines 114–311: an **orphan template fragment** from an incompatible
  DB-backed design (no opening `<template>` tag, ending with another
  `</template>`) referencing dozens of identifiers that the
  `<script setup>` block never defined (`PRESET_CATEGORIES`, `addStep`,
  `editing.steps`, `showNewCommand`, `newCmd`, `step.preview`,
  `step.expectsResponse`, …).
- Lines 313–520: a `<script setup lang="ts">` that only matched the
  first (JSON-file) design.

The Vue SFC compiler refused the file, so Nuxt could not build the
chunk → the dynamic import failed at runtime.

### 16.3 Design decision (operator-confirmed)

After two parallel preset surfaces (the DB-backed CRUD synced in § 15
and the JSON-file `/api/json-presets` pair) the operator chose to **keep
the JSON workflow as the single source of truth for preset buttons**.
The DB-backed `/api/presets*` endpoints and the `presets` /
`preset_steps` tables remain in place as dormant code that no UI
references.

### 16.4 `components/PresetBuilder.vue` (full rewrite, ~1285 lines)

Clean SFC with a single, valid `<template>` / `<script setup
lang="ts">` / `<style scoped>` structure.

Two-pane editor:

- **Left**: list of presets from `cat-presets.json`. Click to load,
  inline delete with confirm, `+ New Preset` footer.
- **Right**: structured editor. Each command is a step row consisting
  of
  - a 2-letter code input with a `<datalist>` populated from the
    built-in catalogue,
  - a parameter input with placeholder / hint / default from the
    catalogue when the code matches a known command (and free-form
    text when it doesn't),
  - a live preview of the exact string that will be sent to the radio
    (e.g. `FB144800000;`),
  - move up / move down / remove buttons.
- **Built-in catalogue** of 14 common FTX-1 commands derived from the
  manual excerpt and the existing `aprs-on`/`aprs-off` presets: `FA`,
  `FB` (9-digit freq), `VS`, `BS`, `MD`, `FR`, `FT`, `EX`, `IS`, `PC`,
  `AG`, `AI`, `TX`, `ID`. Each entry carries
  `{ code, name, category, paramType, paramDigits?, paramLabel,
  paramHint, paramDefault, description }`. Any 2-letter code outside
  the catalogue is still accepted as a "Custom command" with free-form
  parameter.
- **Raw-mode toggle** — textarea (one command per line) for power
  users / commands not in the catalogue; round-trips both ways with
  the structured step editor.
- Optimistic save with snapshot rollback on PUT failure; `Esc` closes;
  ID validation (lowercase letters/digits/hyphens, must start
  alphanumeric, uniqueness check); confirmation prompts on delete and
  reset.
- Reads/writes **only** `cat-presets.json` via `GET/PUT
  /api/json-presets`. Accepts an `open-preset-id: string | number |
  null` prop so the parent can pre-select a preset.

### 16.5 `pages/index.vue` — coordinated patches

- **`loadPresets()`** changed to read `/api/json-presets` instead of
  `/api/presets`. The DB-backed endpoint preferred DB content and
  silently hid the JSON-file presets as soon as any preset existed in
  the DB. After this change, the main preset button row mirrors
  `cat-presets.json` exactly.
- **`onPresetSaved()`** simplified to just call `loadPresets()` after
  the builder emits `saved`; the builder stays open so the operator
  can keep editing other presets in the same session.
- **`builderTargetPresetId`** widened from `ref<number | null>` to
  `ref<string | null>` (JSON preset IDs are strings such as
  `"aprs-on"`); `editPreset(id)` stringifies its argument so the
  legacy DB Preset Manager edit-pencil still works (it just opens the
  builder in "New" mode because the numeric DB id doesn't match any
  JSON id).

### 16.6 Subsequent UI consolidation

The operator confirmed the JSON workflow and asked for the Preset
Manager UI to be simplified. Applied:

- **Removed** the top-toolbar `◈` button.
- **Removed** the DB-backed Preset Manager modal in full (markup,
  refs, functions, and ~55 lines of orphan CSS — `.presets-list`,
  `.preset-item`, `.preset-info`, `.preset-name`, `.preset-step-count`,
  `.preset-desc`, `.preset-actions`, `.presets-empty`).
- **Removed** dead identifiers from the script: `dbPresets`,
  `showPresetManager`, `openPresetManager`, `closePresetManager`,
  `loadDbPresets`, `editPreset` (DB version), `deletePreset` (DB
  version), `createNewPreset`. `loadDbPresets()` also dropped from
  the `onMounted` `Promise.all`.
- **Added** a single `◈` button to the right end of the
  `.presets-header` (`margin-left: auto`) that calls the new
  `openPresetBuilder()` helper. The Presets section is now always
  visible (was previously hidden when `presets.length === 0`, which
  prevented adding the first preset); an empty-state panel
  (`.presets-empty-state`, dashed border / muted text) is shown when
  no presets are defined.

### 16.7 Vue runtime prop-type warning (StatusBadge `active`)

While verifying the page reload, this warning surfaced in the
console:

> `[Vue warn]: Invalid prop: type check failed for prop "active".
> Expected Boolean, got Number with value 0. at <StatusBadge
> label="ATT" value="OFF" active=0 …>`

`StatusBadge.vue` declares `active?: boolean`. The page was passing
`state.rfAttenuator` straight through to that prop. The
`TransceiverState` interface labels `rfAttenuator` as `boolean`, but
the radio-state ingestion path is in fact writing the raw CAT
numeric flag (`0` / `1`) into that field. Three sister bindings have
the same latent shape — `state.split`, `state.mox`,
`state.radioInfo?.tuning` — and would log the same warning the
moment the serial bridge encodes them as numbers too.

Fixed at the consumer side by coercing with `!!` (`:active="!!state.rfAttenuator"`,
`:active="!!state.split"`, `:active="!!state.mox"`,
`:active="!!state.radioInfo?.tuning"`). `StatusBadge.vue`, the state
interface, and the serial bridge are untouched. The right place to
fix the underlying mismatch is the state-update handler that builds
the runtime object, but that is outside the scope of this batch.

### 16.8 Files changed in this batch

| Path | Change |
|---|---|
| `components\PresetBuilder.vue` | Full rewrite (NEW clean SFC). |
| `pages\index.vue` | `loadPresets` endpoint switch, header button moved, empty-state added, dead DB-Preset-Manager code/CSS removed, `!!`-coercion on four StatusBadge `active` bindings. |
| `cat-presets.json` | Edited via the new builder during verification. |
| `changelog.md` | **NEW** — first entry, dated 2026-05-27 19:33. |

---

## 17. Follow-on batch — settings persistence hardening (2026-05-27)

### 17.1 Symptoms

1. **`PUT /api/settings` returned 500 "Database error"** whenever the
   operator edited the Call Sign field.
2. **Appearance settings did not survive a browser-cache / site-data
   clear** — colours, radius, font, and the two VFO-card background
   variables all reverted to the built-in `:root` defaults.

### 17.2 Root cause — Symptom 1

`server/api/settings.put.ts` built the dynamic UPDATE with

```ts
updates.push('updated_at = datetime("now")')
```

In SQLite, double-quoted strings denote an identifier (column name),
not a string literal. The engine therefore looked for a column called
`now`, didn't find one, and threw `no such column: now`. The catch-all
in the endpoint reported it as the generic 500.

The same pattern occurs in `server/api/presets/[id].put.ts:46`. (The
DB-backed preset code is dormant after § 16, but the bug was fixed
for hygiene.) `server/api/macros/[id].put.ts:35` already used the
correct single-quoted form.

### 17.3 Root cause — Symptom 2

The Appearance drawer's `themeOverrides` (a `Record<string, string>`
of all the CSS variable customizations in `THEME_DEFAULTS` — 14
variables: `--bg`, `--surface`, `--accent`, `--radius`, `--font-mono`,
…) was persisted only to `localStorage` under the `cat_theme` key.
The DB had five typed colour columns (`color_primary`, `color_accent`,
`color_bg`, `font_mono`, `radius_px`) but they were loaded into
`userSettings.value` and then **never applied** to the document — pure
dead data.

A site-data clear wipes `localStorage` and there is no server-side
copy to recover from, so the theme reverts.

### 17.4 Design

Single new TEXT column on the existing `settings` table holding a JSON
blob:

```
theme_overrides TEXT   -- e.g. {"--bg":"#101820","--radius":"12px"}
                       -- NULL = no customisation, fall back to :root
```

- `localStorage` remains as a **fast offline shadow** so the theme
  applies instantly on cold load before `/api/settings` responds.
- The DB column is the **authoritative copy** that survives any
  client-side wipe. On load, the DB value overrides whatever was in
  `localStorage` from a previous session.
- Setting an empty overrides map automatically writes `NULL` to the
  column (and clears the local mirror) so the stored shape is
  consistent with "no customisation".
- The `PUT /api/settings` call is debounced 400 ms so dragging a colour
  slider doesn't spam requests.

### 17.5 `sql/schema.sql`

`settings` `CREATE TABLE` now includes the new column with an
explanatory comment:

```sql
theme_overrides TEXT,   -- JSON: {"--bg":"#...",...} or NULL
```

This only affects DBs created fresh from `schema.sql`; existing DBs
need the migration script below.

### 17.6 `sql/migrate-add-theme-overrides.sql` (new, manual one-time)

```sql
ALTER TABLE settings ADD COLUMN theme_overrides TEXT;
```

SQLite has no `ADD COLUMN IF NOT EXISTS`; re-running the script on an
already-migrated DB reports `duplicate column name:
theme_overrides`, which is the expected outcome confirming the
column is in place.

The local DB at `data\cat-ftx1.db` was migrated in-place during this
session by reading the script and executing it via Python's stdlib
`sqlite3`. Verified afterwards with `PRAGMA table_info(settings)`:

```
columns: ['id', 'rig_id', 'call_sign', 'color_primary',
          'color_accent', 'color_bg', 'font_mono', 'radius_px',
          'created_at', 'updated_at', 'theme_overrides']
```

The pre-existing row (id=1, rig_id='ftx1', call_sign='PA0NOX', …)
survived with `theme_overrides = NULL`.

### 17.7 `server/api/settings.put.ts` (full rewrite)

- Fixed the `datetime('now')` quoting bug.
- UPDATE builder rewritten with parallel `setClauses[]` / `values[]`
  arrays (no implicit dependency on JS object-key insertion order).
- Accepts `theme_overrides: Record<string, string> | null` in the
  body, validates that every key and value is a string, serialises to
  JSON before storing.
- Returns the parsed `theme_overrides` object (or `null`) in the
  response — never a raw JSON string.

```ts
let themeJson: string | null | undefined = undefined  // undefined = "do not touch"
if (theme_overrides !== undefined) {
  if (theme_overrides === null) themeJson = null
  else if (typeof theme_overrides === 'object' && !Array.isArray(theme_overrides)) {
    for (const [k, v] of Object.entries(theme_overrides)) {
      if (typeof k !== 'string' || typeof v !== 'string') {
        throw createError({ statusCode: 400, statusMessage: 'theme_overrides must be an object of string→string' })
      }
    }
    themeJson = JSON.stringify(theme_overrides)
  } else {
    throw createError({ statusCode: 400, statusMessage: 'theme_overrides must be an object or null' })
  }
}
...
if (themeJson !== undefined) { setClauses.push('theme_overrides = ?'); values.push(themeJson) }
...
setClauses.push("updated_at = datetime('now')")    // fixed quoting
```

### 17.8 `server/api/settings.get.ts`

SELECTs `theme_overrides` and returns it as a parsed object (or
`null`):

```ts
function parseThemeOverrides(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch { /* fall through */ }
  return null
}
```

### 17.9 `server/api/presets/[id].put.ts`

One-line fix — the same `datetime("now")` → `datetime('now')`
correction as in `settings.put.ts`, applied even though the endpoint
is currently unused by the UI.

### 17.10 `pages/index.vue`

`persistTheme()` rewritten to do both the local mirror and a
debounced authoritative server save:

```ts
let themePutTimer: ReturnType<typeof setTimeout> | null = null

function persistTheme(): void {
  // Local mirror — synchronous, offline-safe
  try {
    if (Object.keys(themeOverrides.value).length === 0) {
      localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeOverrides.value))
    }
  } catch { /* localStorage unavailable */ }

  // Debounced server save — authoritative
  if (themePutTimer) clearTimeout(themePutTimer)
  themePutTimer = setTimeout(() => {
    themePutTimer = null
    const payload = Object.keys(themeOverrides.value).length === 0
      ? null                              // null clears the column
      : { ...themeOverrides.value }
    $fetch('/api/settings', {
      method: 'PUT',
      body: { theme_overrides: payload },
    }).catch((err: any) => {
      console.warn('[persistTheme] /api/settings PUT failed:',
        err?.data?.statusMessage ?? err?.message ?? err)
    })
  }, 400)
}
```

`loadUserSettings()` extended to also hydrate `themeOverrides` from
the API response (the DB copy wins over the local mirror), re-mirror
it to `localStorage`, and call `applyTheme()`. If the DB column is
`null` the local mirror is cleared so the page falls back to its
built-in `:root` defaults.

### 17.11 Files changed in this batch

| Path | Change |
|---|---|
| `sql\schema.sql` | `settings.theme_overrides TEXT` added to fresh-DB recipe. |
| `sql\migrate-add-theme-overrides.sql` | **NEW** one-time ALTER. |
| `server\api\settings.put.ts` | Full rewrite (bug fix + theme support). |
| `server\api\settings.get.ts` | Returns parsed `theme_overrides`. |
| `server\api\presets\[id].put.ts` | Same `datetime('now')` fix. |
| `pages\index.vue` | `persistTheme` + `loadUserSettings` wired to the API. |
| `data\cat-ftx1.db` | Migrated in place. |
| `changelog.md` | New entry dated 2026-05-27 22:16. |

### 17.12 Operator action on the secondary workstation

Once before launching the app on the secondary PC, run the migration
once (idempotent — running twice prints "duplicate column name", which
is fine):

```powershell
$db  = '<other PC>\data\cat-ftx1.db'
$sql = '<other PC>\sql\migrate-add-theme-overrides.sql'
python -c "import sqlite3, pathlib; con=sqlite3.connect(r'$db'); con.executescript(pathlib.Path(r'$sql').read_text(encoding='utf-8')); con.commit(); con.close(); print('migration applied')"
```

### 17.13 Verification (operator)

1. Re-launch the app. Open the settings drawer, type a Call Sign, blur.
   - Expected: `PUT /api/settings` returns **200**, the row's
     `call_sign` column updates, `updated_at` reflects the change.
2. Open the Appearance section, change `--bg` to e.g. `#101820`.
   - Expected: within ~400 ms a single `PUT /api/settings` request fires
     with `{ theme_overrides: { "--bg": "#101820" } }`. The
     `settings.theme_overrides` cell now holds that JSON string.
3. Reload the page.
   - Expected: theme stays.
4. Browser DevTools → Application → Clear site data → reload.
   - Expected: theme **still in effect** (this was the originally
     reported regression).
5. Click `Reset to defaults` in the drawer.
   - Expected: a final PUT with `theme_overrides: null` is sent; the
     column reads `NULL`; the local mirror is cleared.

All five items were verified by the operator on the primary
workstation. Status of § 17 is **closed**.

### 17.14 Notes on the remaining state mismatch

The `state.rfAttenuator` (and `state.split`, `state.mox`,
`state.radioInfo?.tuning`) runtime mismatch documented in § 16.7 is
worked around at the consumer (`!!state.*` coercion on the
`StatusBadge :active` bindings). The proper fix is at the
state-ingestion layer (where the serial bridge writes the raw CAT
flag into the typed object) and is left for a future batch.

---

## 18. Follow-on batch — header version label `V2.0-NX` (single-source) (2026-05-27)

### 18.1 Motivation

The project diverged from upstream at v1.0. Operator requested a
visible fork identifier in the application header — `V2.0-NX` — so
each running instance is unambiguously this fork.

Two implementation goals on top of the bare label:

1. **Single source of truth**: the label must live in exactly one
   place so future bumps don't have to be hunted across the template
   tree.
2. **Runtime override**: the same packaged build should be able to
   announce a different label when the operator chooses, without
   recompiling.

### 18.2 `nuxt.config.ts`

`runtimeConfig.public` (previously empty) gains the `appVersion`
key. Because `public` config is automatically exposed to the
renderer, the browser can read it via `useRuntimeConfig()` without
any extra plumbing.

```ts
runtimeConfig: {
  serialServerUrl: 'http://127.0.0.1:3001',
  serialToken: '',
  public: {
    // Single source of truth for the version label shown in the header.
    // Bump here when forking / releasing; the UI reads it via useRuntimeConfig().
    // Overridable at runtime via the NUXT_PUBLIC_APP_VERSION env var.
    appVersion: 'V2.0-NX',
  },
},
```

Nuxt 3's standard environment-variable bridge means any key under
`runtimeConfig.public.foo` is overridable at launch time via
`NUXT_PUBLIC_FOO`. Here that's `NUXT_PUBLIC_APP_VERSION="V2.1-NX"`
(etc.). The default declared in `nuxt.config.ts` is the dev fallback.

### 18.3 `pages/index.vue` — script setup

A single line consumes the runtime config and binds it to a
component-local constant. `useRuntimeConfig` is auto-imported by
Nuxt 3 (`#imports`), so no explicit `import` line is required —
matching the existing convention in this file for `$fetch` and
similar Nuxt-provided composables.

```ts
const appVersion = useRuntimeConfig().public.appVersion as string
```

The `as string` cast is defensive; Nuxt's generated `RuntimeConfig`
type already widens the literal `'V2.0-NX'` to `string`.

### 18.4 `pages/index.vue` — template

```html
<header class="header">
  <div class="header-brand">
    <span class="brand-logo">FTX-1</span>
    <span class="brand-sub">CAT Controller</span>
    <span class="brand-version">{{ appVersion }}</span>
    <span v-if="userSettings.call_sign" class="header-callsign">{{ userSettings.call_sign }}</span>
  </div>
  …
</header>
```

The new span sits between `CAT Controller` and the optional call-sign
chip, inheriting the `.header-brand` row's
`display: flex; align-items: baseline; gap: 8px;` so it joins the
existing baseline without any layout reflow.

### 18.5 `pages/index.vue` — styles

```css
.brand-sub {
  font-size: 12px;
  color: var(--text);          /* was var(--text-muted) */
  text-transform: uppercase;
  letter-spacing: 1px;
}

.brand-version {
  font-size: 12px;             /* matches .brand-sub */
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
```

Two notes on the styling decision:

- **`--text` instead of `--text-muted`** for `.brand-sub` — operator
  chose to read `CAT Controller` at primary contrast; the version
  pill then carries the secondary, decorative role.
- **`--accent` / `--font-mono`** — using existing theme tokens means
  the version pill participates automatically in the Appearance
  drawer (§ 12). Changing `--accent` recolors the `FTX-1` logo
  and the version pill in lock-step.

### 18.6 Why not `package.json`?

The natural-looking alternative would be to import the version from
`package.json`. Rejected because:

1. `package.json:"version"` must be a valid semver string for
   `electron-builder` to derive the installer filename. `V2.0-NX` is
   not semver. A semver-legal form (`2.0.0-nx.1`) would have to be
   different from the displayed label.
2. The fork identifier (`-NX`) is **brand**, not release metadata.
   We may bump it independently of the installer's package version,
   or vice versa.
3. `runtimeConfig.public` is the idiomatic Nuxt way to expose
   build-time constants to the renderer and gives us the env-var
   override for free.

When (and if) the fork warrants a packaged release, the
`package.json:"version"` field will be bumped to a semver-legal value
in a separate batch on operator's signal. The two values are
deliberately decoupled.

### 18.7 Files changed in this batch

| Path | Change |
|---|---|
| `nuxt.config.ts` | Added `runtimeConfig.public.appVersion = 'V2.0-NX'`. |
| `pages\index.vue` | Template binding, script-setup constant, `.brand-sub` color, `.brand-version` size + new pill style. |
| `changelog.md` | New entry dated 2026-05-27 22:35. |

### 18.8 Verification (operator confirmed)

1. `npm run dev`, open the renderer.
2. Header reads `FTX-1  CAT CONTROLLER  V2.0-NX  PA0NOX`.
3. `CAT CONTROLLER` is at primary text contrast (no longer muted).
4. `V2.0-NX` renders as a small mono-font pill with accent border,
   12 px, same baseline as `CAT Controller`.
5. Adjust `--accent` in the Appearance drawer → `FTX-1` and `V2.0-NX`
   recolor together.
6. No vertical-baseline shift in the header row.

### 18.9 Bumping the label later

Three options, in increasing order of friction:

- **Edit one line** in `nuxt.config.ts`:
  ```ts
  appVersion: 'V2.1-NX',
  ```
  Restart dev server (HMR also picks it up reliably from this file).
- **Launch with an env var** (no code change):
  ```powershell
  $env:NUXT_PUBLIC_APP_VERSION = "V2.1-NX"
  npm run dev
  ```
- **Release-coupled bump** — only when the packaged installer
  version needs to change too. At that point also bump
  `package.json:"version"` to a semver-legal value and update
  `README.md` / `SECURITY-AUDIT.md` headers. Each of those is left
  as an explicit operator-approved batch.

---

## 19. Follow-on batch — Smart Preset Builder + CAT command catalogue from manual (2026-05-28)

### 19.1 Motivation

The Preset Builder shipped with a hand-curated catalogue of 14 commands
in `components/PresetBuilder.vue`. That sufficed for the half-dozen
canonical presets the operator was authoring by hand (APRS on/off,
band selectors, mode toggles), but it left the editor without
parameter-shape awareness for the long tail of less-frequent commands
(menu access, memory writes, filter tuning, repeater shift, CTCSS /
DCS configuration, etc.). The operator's request was three-fold:

1. **Parse the official Yaesu manual** (`docs/CAT-FTX1.pdf`) and lift
   every command into the dropdown / parameter helpers.
2. **Make the editor "smart"** — validate the parameter the operator
   types and flag invalid input before the preset is saved or sent.
3. **Add a `?` button** that surfaces the manual's page-4 usage
   primer in-app, plus a sortable / filterable quick reference of
   every catalogued command.

Operator-approved scope choices (questionnaire answered before
implementation):

| Question | Operator's choice |
|---|---|
| Which UIs consume the catalogue? | **Presets only** — macro builder untouched. |
| How strict is the validator on Save? | **Block on hard errors**, warn on conditional / out-of-range. |
| How much manual content in the `?` modal? | **Page 4 only** + quick-reference table of all commands. |
| EX-menu picker for Table 3 (~300 items)? | **Defer** — EX stays a free-form text param this batch. |
| Execute step-by-step or all at once? | **All four phases**, verify at the end. |

### 19.2 Architecture — single source of truth in TypeScript

A new module **`components/cat-commands-ftx1.ts`** (~2030 lines)
holds the parsed catalogue alongside the validator. Co-locating both
in one file keeps the consumer surface in `PresetBuilder.vue`
narrow (a single `import { … } from './cat-commands-ftx1'`), and
ensures that whoever updates a command spec also sees and updates the
validator's expectations.

The PDF is not parsed at runtime: extraction was a one-off authoring
step, the result is checked-in typed data. `docs/CAT-FTX1.pdf`
remains in the repo purely as the authoritative reference document.

### 19.3 `components/cat-commands-ftx1.ts` — type model

```ts
export interface ParamDef {
  name: string                              // 'P1', 'P2', …
  label: string
  digits: number                            // exact width; -1 = variable
  type: 'enum' | 'int_range' | 'signed_int' | 'sign'
       | 'fixed' | 'string' | 'any'
  enum?: ReadonlyArray<{ value: string; label: string }>
  min?: number; max?: number
  fixed?: string
  hint?: string
  conditional?: string                      // when meaning depends on another P
}

export interface CommandDef {
  code: string
  name: string
  category: 'frequency' | 'vfo' | 'mode' | 'band' | 'filter' | 'memory'
          | 'power' | 'audio' | 'ptt' | 'tuner' | 'menu' | 'status'
          | 'misc'
  supports: { set: boolean; read: boolean; answer: boolean; ai: boolean }
  setForm: 'none' | 'fixed' | 'variable'
  paramTotalDigits: number | { min: number; max: number }
  params: ReadonlyArray<ParamDef>
  paramDefault?: string
  description: string
  manualPage: number
  examples?: ReadonlyArray<string>
}
```

`supports` mirrors the manual's page-5 table (columns Set / Read /
Answer / AI). `setForm` distinguishes commands that take no parameter
(`AB`, `AM`, `UP`, …), commands with a fixed-width parameter
(`FA<9>`, `BS<3>`, `MD<2>`, …), and commands whose total length varies
(`DT`, `KM`, `MT`, `EX`).

Conditional parameter layouts (where a later P-segment's meaning
changes based on an earlier P-value — `CF P4..P8` driven by `P3`,
`BP P3` driven by `P2`, `CO P3` driven by `P2`, `ML P2` driven by
`P1`, `PA P2` driven by `P1`, `PC P2` driven by `P1`, `SS P3..P7`
driven by `P2`) are modelled with `type: 'any'` + a `conditional`
explanation. The validator enforces the structural rules
(total length, character class, control / terminator presence) and
emits a non-blocking warning that carries the conditional note — so
the operator always sees exactly what the variable suffix is
supposed to be, but the editor doesn't try to outsmart the manual.

### 19.4 `components/cat-commands-ftx1.ts` — coverage

| Section | Commands |
|---|---|
| A | `AB`, `AC`, `AG`, `AI`, `AM`, `AO` |
| B | `BA`, `BC`, `BD`, `BI`, `BM`, `BP`, `BS`, `BU` |
| C | `CF`, `CH`, `CN`, `CO`, `CS`, `CT` |
| D | `DA`, `DN`, `DT` |
| E | `EO`, `EX` |
| F | `FA`, `FB`, `FN`, `FR`, `FT` |
| G | `GP`, `GT` |
| I | `ID` ⁽ʳ⁾, `IF` ⁽ʳ⁾, `IS` |
| K | `KM`, `KP`, `KR`, `KS`, `KY` |
| L | `LK`, `LM` |
| M | `MA`, `MB`, `MC`, `MD`, `MG`, `ML`, `MR` ⁽ʳ⁾, `MS`, `MT`, `MW`, `MX`, `MZ` |
| N | `NA`, `NL` |
| O | `OI` ⁽ʳ⁾, `OS` |
| P | `PA`, `PB`, `PC`, `PL`, `PR`, `PS` |
| Q | `QI`, `QR` |
| R | `RA`, `RG`, `RI` ⁽ʳ⁾, `RL`, `RM` ⁽ʳ⁾ |
| S | `SC`, `SD`, `SF`, `SH`, `SM` ⁽ʳ⁾, `SQ`, `SS`, `ST`, `SV` |
| T | `TS`, `TX` |
| U | `UP` |
| V | `VD`, `VE` ⁽ʳ⁾, `VG`, `VM`, `VS`, `VX` |
| Z | `ZI` |

**Total: 90 commands.** Entries marked ⁽ʳ⁾ are documented as
read-only on page 5 (no Set form). They are still listed so the
validator can warn the operator when one slips into a preset.

### 19.5 Validator — exact rules

`validateStep(code, param)` returns a `ValidationResult`:

```ts
export type ValidationLevel = 'ok' | 'warn' | 'error'

export interface ValidationIssue { level: ValidationLevel; message: string }
export interface ValidationResult { level: ValidationLevel; issues: ValidationIssue[] }
```

The `level` is the worst observed level across all issues; the issue
list is forwarded verbatim into the badge's hover-tooltip and into
the footer summary.

Decision matrix (operator's policy: **block-errors**):

| Detected condition | Level | Effect on Save |
|---|---|---|
| Code is empty / not two A–Z chars | **error** | blocked |
| Off-catalogue 2-letter code | **warn** | allowed (treated as custom) |
| Read-only command in a preset | **warn** | allowed |
| Parameter supplied to a no-parameter command | **error** | blocked |
| Wrong total parameter length (fixed) | **error** | blocked |
| Length outside `{min,max}` (variable) | **error** | blocked |
| Non-digit char where digits expected | **error** | blocked |
| Enum value not in the allowed set | **error** | blocked |
| Sign-character expected, got non-sign | **error** | blocked |
| ASCII control code (00–1F) or `;` inside param | **error** | blocked |
| Numeric value below `min` / above `max` | **warn** | allowed |
| `type: 'fixed'` segment differs from `fixed` value | **warn** | allowed |
| Parameter has `conditional` note | **warn** | allowed |

`summariseSteps(steps[])` aggregates per-step results into
`{ errorCount, warningCount, okCount, worst }` for the footer line.

### 19.6 `components/PresetBuilder.vue` — wiring (no breaking template changes)

The existing template kept its bindings — what changed is **where the
data comes from**. The local 14-entry `COMMANDS` array and the local
`interface CommandDef` were removed; everything now flows through the
catalogue:

```ts
import {
  CAT_COMMANDS,
  findCommand,
  legacyParamHint, legacyParamLabel, legacyParamType,
  setFormShape,
  summariseSteps, validateStep,
  type CommandDef, type ValidationResult,
} from './cat-commands-ftx1'

function defFor(code: string): CommandDef | null { return findCommand(code) }
function paramTypeOf(code: string)    { const d = findCommand(code); return d ? legacyParamType(d) : 'text' }
function paramHintOf(code: string)    { const d = findCommand(code); return d ? legacyParamHint(d) : undefined }
function paramLabelOf(code: string)   { const d = findCommand(code); return d ? legacyParamLabel(d) : undefined }
function paramDefaultOf(code: string) { return findCommand(code)?.paramDefault }
```

The four `paramTypeOf` / `paramHintOf` / `paramLabelOf` /
`paramDefaultOf` shims keep the template bindings stable while the
underlying catalogue carries richer per-parameter information. The
`<datalist>` for command suggestions now feeds off `CAT_COMMANDS`
directly (90 entries instead of 14).

`canSave` gained one new clause:

```ts
return steps.value.every((s) => /^[A-Z]{2}$/.test(s.code))
  && !hasValidationErrors.value
```

`hasValidationErrors` is derived from the per-step validator results
and from `validationSummary` (which also drives the footer text).

### 19.7 `components/PresetBuilder.vue` — UI additions

1. **Per-step badge column** between the live "Sent to radio" preview
   and the row actions. New 28 px grid track in
   `.pb-steps-headrow / .pb-step-row`. The mobile (`≤640 px`) layout
   adds a `validate` grid-area to the existing `pos / cmd / param /
   preview / act` template:
   ```css
   .pb-steps-headrow, .pb-step-row {
     grid-template-columns: 24px 1fr 24px 88px;
     grid-template-areas:
       'pos cmd validate act'
       'pos param param param'
       'pos preview preview preview';
   }
   ```
2. **Row tint** — `pb-step-row--error` paints a faint red overlay and
   a red border; `pb-step-row--warn` paints an amber border. Cuts the
   distance between "this step has a problem" and "where exactly".
3. **Validation summary bar** above the Save row, only rendered when
   `errorCount + warningCount > 0`. Reads e.g.
   *"1 error, 0 warnings — fix errors to enable Save."* or
   *"0 errors, 1 warning — warnings won't block save."* and ships a
   shortcut button **"Open reference ?"** that triggers the help
   overlay.
4. **Raw-mode per-line issues list.** When `advancedRaw === true` we
   parse each non-empty line on the fly and render a compact list of
   ✓/⚠/✗ pills with the first issue text, so the operator gets the
   same diagnostics in the textarea mode without writing a separate
   parser.
5. **Header `?` button** — circular, 30 × 30 px, sits to the left of
   the existing close (`✕`) button. Tooltip:
   *"CAT command reference (FTX-1 manual page 4 + quick-reference
   table)"*.

### 19.8 Help modal (overlay on top of the editor)

Mounted inside `.pb-container` as `position: absolute; inset: 0;
z-index: 20`. Backdrop click closes; the panel itself absorbs clicks.
Escape key precedence is now `help → editor` so a stray Escape never
nukes unsaved edits in the editor while the operator is consulting
the help. `.pb-container` was given `position: relative` so the
overlay anchors correctly and remains clipped to the editor's rounded
corners.

Content laid out in two scrolling sections:

- **Manual page 4 prose** — Control-command structure (with ASCII
  diagram), the set / read / answer model, the FA worked example,
  the four "common mistakes" rendered as a `<table>` (matching the
  IS00+1000 example from the manual verbatim), the ASCII-control /
  terminator caveat, and the terminator note. All static HTML, no
  PDF fetch at runtime.
- **Quick-reference table** of all `CAT_COMMANDS.length` entries:
  - **Filter** box matches `code | name | category | description`.
  - **Sortable** column headers: `Code`, `Name`, `Category`, `Page`.
    First click sets ascending; subsequent clicks on the same column
    toggle direction.
  - **`SRAI`** column shows the four-letter support badge generated
    by `supportsBadge` (e.g. `SRAI` = all four supported,
    `··RA` = read + answer only).
  - **`Shape`** column shows the auto-generated SET shape via
    `setFormShape(d)` — e.g. `FA<P1×9>;`,
    `IS<P1×1><P2×1><P3×1><P4×4>;`. Computed from the catalogue's
    `params[]` so it stays in sync if the catalogue is edited.
  - Hover a row to read the full `description`.
  - `<thead>` is `position: sticky; top: 0` so column headers stay
    visible while the body scrolls.

### 19.9 Files changed in this batch

| Path | Change |
|---|---|
| `components/cat-commands-ftx1.ts` | **NEW** — 90-command catalogue + validator + help helpers. |
| `components/PresetBuilder.vue` | Removed in-file catalogue, added per-step badge, summary bar, raw-mode issue list, `?` button + help modal, grid-template adjustments, `.pb-container { position: relative }`. |
| `changelog.md` | New entry dated 2026-05-28 02:58. |
| `cat-ftx1-NXC.md` | This § 19; header `Status:` line refreshed. |

### 19.10 Verification (operator confirmed)

1. `npm run dev`, open Preset Manager.
2. Existing presets (APRS on/off etc.) load with all ✓ badges and
   the summary bar reads "0 errors, 0 warnings" → does not appear.
3. Editing `FB144800000` → `FB1448000` immediately flips the row
   badge to red ✗, summary bar reads "1 error, 0 warnings — fix
   errors to enable Save", Save button disabled.
4. Editing `FA014250000` → `FA999999999` flips badge to amber ⚠
   ("value 999999999 above documented maximum 470000000"), Save
   remains enabled.
5. Typing the manual's canonical mistake `IS001000` produces the
   exact error described on page 4 of the PDF.
6. Unknown code `ZZ0` is accepted as a custom command with a single
   warning, Save remains enabled.
7. `?` button opens the help overlay. Page-4 prose renders, the
   quick-reference table lists 90 rows, sort toggles work on every
   sortable column, filter narrows results live. First Escape closes
   the help, second Escape closes the editor.
8. Switching to Raw mode preserves all diagnostics in the per-line
   issues list with matching ✓ / ⚠ / ✗ colors.

### 19.11 Deliberately deferred

- **Macro Builder** (DB-backed; see §§ 13.3, 14) is untouched. If
  the operator later wants the same validator there, the catalogue
  is already shaped to drive it — only the consumer-side wiring
  would need to be added. The DB-backed macro registry can either
  keep co-existing or be reduced to a thin index that points into
  the TypeScript catalogue.
- **EX-menu cascading picker** for the ~300 entries in manual
  Table 3 (RADIO / CW / OPERATION / DISPLAY / EXTENSION / APRS /
  APRS BEACON trees). The `EX` command remains in the catalogue
  with a single free-form payload field; existing EX-based presets
  keep working unchanged.
- **Tables 1, 2, 4, 5** (CTCSS tones, DCS codes, MY SYMBOL chart,
  bandwidth chart) are described in the catalogue via `hint`
  / `conditional` strings on the parameters that consume them
  (`CN`, `SH`, etc.) but are not yet picker-driven. Future work.
- **`docs/ui-screenshot.png`** is the only non-PDF asset in `docs/`
  and is unchanged.

### 19.12 Why a single TypeScript module, not JSON?

Three reasons:

1. **Validator and catalogue are co-evolving.** Adding a new
   command means adding both an entry and (potentially) a new
   `ParamType` variant or a new validation rule. Keeping both in the
   same file means PRs are atomic and reviewers see the data + the
   code that interprets it together.
2. **TypeScript types catch shape regressions at edit time.**
   `enum`-only with no `enum: [...]` array, an `int_range` missing
   `min`/`max`, a typo in `category` — all flagged by `tsc` before
   the editor ever boots.
3. **`ReadonlyArray<…>` everywhere** prevents accidental in-place
   mutation of the catalogue at runtime. Cheap insurance.

JSON would have meant either lossy round-tripping (loses the
`as const` discriminated union benefits) or a parallel
`.d.ts`-style type file that has to be kept in sync by hand.

### 19.13 Bumping the catalogue later

Edit `components/cat-commands-ftx1.ts`:

- **Add a command** — append a new `CommandDef` to the
  `CAT_COMMANDS` array. Mind the alphabetic ordering for
  reviewability. The dropdown and the help-modal table auto-update
  on next dev-server reload.
- **Tighten validation** — add or refine a `ParamDef` entry. If the
  new check needs a new `ParamType`, add it to the union and extend
  the `validateParamSegment` switch.
- **Surface a new manual section in `?`** — add another `<section
  class="pb-help-section">` block to the template. Quick-reference
  table requires no changes (it's data-driven).

The `Status:` line at the top of `cat-ftx1-NXC.md` and a fresh
`changelog.md` entry should be added in the same edit, per the
operator's standing documentation policy.

---

## 20. Follow-on batch — Category-browsing Command Picker (2026-05-28)

### 20.1 Motivation

§ 19 introduced the 90-command CAT catalogue but left the in-builder
command selection on the browser-native `<datalist>` widget driven
by the existing 2-letter code input. With 90 commands across 13
categories (`frequency`, `vfo`, `mode`, `band`, `filter`, `memory`,
`power`, `audio`, `ptt`, `tuner`, `menu`, `status`, `misc`) and the
catalogue's rich per-command metadata (full name, manual page,
read-only flag, SRAI form support), the native popup became
unusable:

- The popup width follows the input width — about 56 px for a
  2-letter code field — so command names are clipped at ~12
  characters.
- It has no grouping; 90 options scroll past as one undifferentiated
  list.
- Its styling cannot be customised beyond what the OS exposes.
- On a short laptop viewport (1024×510 px in the operator's case),
  the popup also gets clipped by the parent modal's
  `overflow-y: auto`, visible as the modal cutting the popup to
  about three rows.

§ 20 replaces the native popup with a custom **command picker**
panel that browses the full catalogue by category, runs inside the
viewport (not inside the editor's scroll container), and exposes
the catalogue's metadata in every row.

### 20.2 Design — viewport-anchored panel, not a `<Teleport>`

The picker is a Vue subtree inside `PresetBuilder.vue` rendered
with `position: fixed`. Its `top` / `left` / `width` /
`max-height` are computed from the anchor row's
`getBoundingClientRect()` by a new `recomputePickerPos()` helper.

Why `position: fixed` rather than a Vue `<Teleport to="body">`:

- None of the picker's ancestors establish a containing block for
  fixed positioning. `.modal-overlay` and `.modal-container` use
  neither `transform`, `filter`, nor `perspective`, so a fixed
  child correctly anchors to the viewport.
- This is enough to escape the editor's `overflow-y: auto` clip
  without restructuring the modal DOM tree.
- A `<Teleport>` would produce the same end result, but at the cost
  of splitting the picker's reactive state across two render
  trees, which complicates focus / keyboard wiring.

### 20.3 Structure — header / body / footer

The picker panel has three regions:

| Region | Contents |
|---|---|
| Header | Filter `<input>` (matches `code` / `name` / `category` / `description`), `X / 90` live match count, ✕ close button. |
| Body   | Sticky **category headers** with grouped command rows. Each row: code badge (mono, accent), full command name, `read-only` tag when no SET form exists, truncated description, SRAI flag string (`SRAI`, `··RA`, `S··I`, etc.), manual page reference (`p.16`). |
| Footer | Keyboard-shortcut hints (`↑↓ navigate`, `Enter select`, `Esc close`) plus an "Open full reference ?" shortcut that closes the picker and opens the § 19 help modal. |

Category headers use `position: sticky; top: 0` within the picker
body, so as the operator scrolls down a long category the header
stays pinned and identifies the current group.

### 20.4 Anchoring + auto-flip

`recomputePickerPos()` runs:

- Once on open.
- On `window resize`.
- On every `scroll` event in the **document capture phase** — so
  any nested scroll container (the editor body, the presets list)
  keeps the picker glued to its anchor as the operator scrolls.

The placement algorithm:

1. Read the anchor row's `getBoundingClientRect()`.
2. Default placement is **below** the row, full editor width,
   `max-height` = remaining viewport height minus a small padding.
3. If there is less than 220 px of room below the row **and** more
   space above than below, flip to **above** by adding a
   `pb-picker--above` modifier class. The class reverses the
   box-shadow direction so the picker still appears to come out of
   the row (shadow points away from the anchor).

On a 510 px-tall viewport with the anchor row in the lower half of
the modal, the flip turns "3 visible rows" into 5–6.
Operator-verified.

### 20.5 Interaction model — one input, two open paths

The 2-letter code input on each step row is the picker's anchor.
It supports two flows:

| Flow | Behaviour |
|---|---|
| **Type directly** | Operator types `F` → input value is `'F'` → picker filter mirrors the input → matching rows narrow live. Direct typing of a known 2-letter code (`FA`, `FB`, …) still works as it always did, picking the command on each keystroke. |
| **Click ▾ Browse** | Operator clicks the new ▾ button next to the code input → picker opens with the **filter input focused** so operators who don't know the code can search by name. |

Both flows go through the same `onPickerKey` handler:

- `↑` / `↓` — move highlight with
  `scrollIntoView({ block: 'nearest' })`.
- `Enter` — pick the highlighted command, auto-fill its default
  parameter via `paramDefaultOf` (matching the existing
  typed-code behaviour from § 19).
- `Esc` — close only the picker. A second `Esc` falls through to
  the help-modal / editor close chain.

A document-level `mousedown` listener (registered in `onMounted`,
removed in `onUnmounted`) closes the picker on any click outside
the picker itself and outside the code input.

### 20.6 Auto-open on new step

Clicking **"+ Add command"** now:

1. Creates an empty step (as before).
2. Scrolls the new step row into the centre of the editor's
   viewport via `scrollIntoView({ block: 'center' })`.
3. Immediately opens the picker, focused on its filter input.

This drops the friction from "new row → click the code field →
see a tiny popup → re-click ▾ Browse" down to "click + Add
command → type to filter → press Enter" — three keystrokes vs ten.

### 20.7 `pages/index.vue` — modal cap tweak

The modal container's `max-height` is raised from `90vh` to
`95vh` to claw back a small extra slice of viewport on short
laptop screens. This pairs with the auto-flip logic in § 20.4:
every extra percent of viewport is one more visible category row.

### 20.8 Files changed in this batch

| Path | Change |
|---|---|
| `components/PresetBuilder.vue` | All picker UI, state, helpers, CSS. Removed `<datalist id="pb-cat-cmd-list">` and the `list="..."` attribute on the code input. Added `onPickerKey`, `recomputePickerPos`, click-outside listener, ▾ Browse button, `+ Add command` auto-open behaviour. |
| `pages/index.vue` | Single CSS rule — `.modal-container { max-height: 95vh; }`. |
| `changelog.md` | Entry dated 2026-05-28 04:26. |
| `cat-ftx1-NXC.md` | This § 20 (narrative backfilled 2026-05-28); header `Status:` line refreshed. |

### 20.9 Verification (operator confirmed)

1. `npm run dev`, open the Preset Editor on a 1024×510 viewport.
2. Click an existing step's 2-letter code input — picker opens
   anchored below, showing the full editor row width (~660 px),
   with category headers `frequency` / `vfo` / `mode` / `band` …
   visible.
3. Type `F` in the code input — picker filter mirrors live and
   narrows to the F-family commands.
4. Click **+ Add command** — new step scrolls to centre of the
   editor; picker auto-opens with the filter input focused.
5. With the picker open, scroll the editor with the mouse wheel —
   picker stays glued to the step row (regression-free vs the
   earlier `position: absolute` build where it clipped to ~3 rows).
6. Open the picker on a step near the bottom of a short viewport
   — picker flips to **open upward** instead of being cut off.
7. `↑` / `↓` / `Enter` / `Esc` and click-outside all behave per
   the table in § 20.5.

### 20.10 Rationale — why a custom picker, not the native popup

- The native `<datalist>` is rendered by the browser and **cannot
  be styled** beyond what the OS exposes. Its width follows the
  input width (~56 px here), it truncates option text at
  ~12 characters, and it offers no grouping. With 90 commands it
  became unusable.
- Using `position: fixed` was preferred over a Vue
  `<Teleport to="body">` because, as noted in § 20.2, none of the
  picker's ancestors establish a fixed-positioning containing
  block. Fixed positioning is enough to escape the editor's
  overflow without restructuring the DOM tree, and keeps the
  picker's keyboard handler / focus chain inside a single
  component subtree.

### 20.11 Deliberately deferred

- **`<Teleport>` migration** — not on the radar; the current
  `position: fixed` approach is robust on every viewport size
  verified by the operator. Revisit if any future ancestor needs
  to acquire a fixed-positioning containing block (e.g. a CSS
  `transform` for a modal entrance animation).
- **Recent / favourites pinning** — discussed during testing,
  deferred. The category-grouped browse covers the discovery use
  case; if "I always use the same 8 commands" becomes a friction
  point, a small `localStorage`-backed recents list can be added
  at the top of the picker body.
- **Mobile / touch fine-tuning** — the current touch behaviour is
  inherited from the `<input>` + click-outside listener
  combination. Not exercised in this batch; the desktop / laptop
  case was the operator's focus.

---

## 21. Follow-on batch — Binary toggle-switch presets (2026-05-28)

### 21.1 Motivation

The FTX-1 CAT set contains six commands whose only SET parameter is a
single `0`/`1` enum — `LK` (key lock), `MX` (monitor), `ST` (side-tone),
`VX` (VOX), `BI` (break-in), `TS` (TX-Watch). Operators routinely build
a "press once → toggle" preset for these by stacking a one-step preset
in the builder, but the result is a plain sequence button: it always
sends the same value, gives no feedback on the current state, and
diverges from the radio whenever the operator changes the function on
the front panel. § 21 turns those six commands into first-class
**stateful toggle switches** that read the radio's live state, send
the inverse, and stay in sync with the radio (including front-panel
changes) via the existing SSE stream.

### 21.2 Design — eligibility as catalogue data

`isBinaryToggleCommand(code)` lives next to the existing 90-command
`CAT_COMMANDS` table in `components/cat-commands-ftx1.ts`. It returns
`true` only when:

1. The command exists in the catalogue.
2. Its SET form has exactly one parameter.
3. That parameter's type is `enum` with the value set `{ '0', '1' }`.

This means the toggle gate is **data-driven**: if Yaesu adds a new
binary toggle in a future firmware revision, adding it to
`CAT_COMMANDS` automatically makes it eligible — no condition in the
builder, no condition in PresetButton needs editing.

`TOGGLE_STATE_FIELDS` — a small `Record<CatCode, keyof TransceiverState>` —
maps each toggle-eligible code to the boolean field on the
serial-server's `TransceiverState` object that already (or now)
carries its live value:

| CAT code | TransceiverState field |
|---|---|
| `LK` | `keyLock`           |
| `MX` | `monitorOn`         |
| `ST` | `sideToneEnabled`   |
| `VX` | `voxEnabled`        |
| `BI` | `breakIn`           |
| `TS` | `txWatch`           |

PresetButton resolves its `currentValue` through this map at render
time, so the LED stays in sync with the device without any per-button
polling.

### 21.3 `serial-server.mjs` — add `BI` and `TS` to the SSE state

`LK`, `MX`, `ST`, `VX` were already mirrored. `BI` and `TS` had to be
added in three places:

1. **Default state.** `this.state.breakIn = null` and
   `this.state.txWatch = null` next to the other boolean fields.
2. **`_parseResponse`.** Two new `case` arms set the booleans from
   incoming `BI` / `TS` frames:
   ```js
   case 'BI': this.state.breakIn = params[0] === '1'; break
   case 'TS': this.state.txWatch = params[0] === '1'; break
   ```
3. **`_initialSync2`.** `'BI'` and `'TS'` added to the `INIT_CMDS`
   array so both values are queried during the connection handshake
   and present in the very first SSE frame.

These additions are non-invasive — `null` (unknown) is the safe
default for any consumer that doesn't yet know about the new fields.

### 21.4 `pages/index.vue` — wire the new state through

- `TransceiverState` interface gains `breakIn: boolean | null` and
  `txWatch: boolean | null`.
- `defaultState()` initialises both to `null`.
- The reactive `state` object is forwarded to every `<PresetButton>`
  as a prop so the button can read its toggle's current value
  through `TOGGLE_STATE_FIELDS`.

### 21.5 `components/PresetButton.vue` — toggle-mode behaviour

A new `isToggle` computed gates the toggle-specific rendering and
event handling:

```ts
const isToggle = computed<boolean>(() =>
  props.preset.toggle === true && isBinaryToggleCommand(toggleCode.value),
)
```

The `currentValue` computed picks the live value via
`TOGGLE_STATE_FIELDS[code]` when the field exists, otherwise falls
back to a per-component `localCache` ref (kept for any future toggle
that isn't yet SSE-tracked).

`onClick` dispatches to `executeToggle` instead of the multi-step
sequencer when `isToggle` is `true`. `executeToggle`:

1. Computes the inverse value (`'0'` ↔ `'1'`, defaulting to `'1'`
   when the current state is `null`).
2. Sends a **fire-and-forget** SET (`await: true` removed — see
   § 21.7) via `/api/command`.
3. Optimistically updates `localCache` for codes that aren't in
   `TOGGLE_STATE_FIELDS`. SSE-tracked codes will overwrite this from
   the next state delta anyway, which is the correct end-of-flow.
4. Shows a brief `"ON"` / `"OFF"` flash via the existing status
   overlay.

The LED status (`'on' | 'off' | 'unknown' | 'pending'`) is exposed as
the `is-toggle-{state}` class on the root button so the rocket-switch
in § 22 can drive its lever position from the same source of truth.

### 21.6 `components/PresetBuilder.vue` — UI + validation

- A new "Toggle switch (on/off button)" checkbox is added between the
  identity fields and the command-sequence editor, with a paragraph
  of inline help listing the eligible codes.
- `toggleValidation` is a computed that returns `{ ok, reason }`:
  - `ok: false` when toggle mode is on AND (`steps.length !== 1` OR
    the single step's code does not satisfy `isBinaryToggleCommand`).
  - `reason` is a one-sentence explanation rendered as a red callout
    below the checkbox when `ok` is false.
- `canSave` now includes `!toggleValidation.value.ok` in its guard,
  so the Save button is disabled while the rule fails.
- `loadPresetIntoForm` and the default form object both round-trip
  `toggle: p.toggle === true` so the checkbox state survives an edit
  cycle.
- `save()` writes `newPreset.toggle = true` only when the operator
  ticked the box (keeps non-toggle presets diff-clean).

### 21.7 The `BI` virtual-COM timeout — root cause & fix

Symptom: clicking a `BI` toggle on a virtual-COM-pair backed by a
3rd-party emulator caused the SET to time out and surface a red ✕
flash, while `LK` worked fine on the same port. Why?

- The original `executeToggle` did a **read-then-set** sequence:
  `await $fetch('/api/command', { body: { command: 'BI;', await: true }})`
  followed by the SET. The `await: true` flag tells the serial-server
  to wait for an echo before resolving — on virtual COM pairs that
  don't faithfully emulate the radio's `BI;` response timing, this
  blocks indefinitely until the command-level timeout fires.
- `LK` worked because it was already SSE-tracked: the read step was
  unnecessary, so it never ran, so it never hung.

The fix in this batch raises `BI` and `TS` to the same SSE-tracked
status as the other four codes (`LK` / `MX` / `ST` / `VX`) by editing
the serial-server (§ 21.3). With `TOGGLE_STATE_FIELDS` populated for
all six codes, `executeToggle` can drop both the pre-read and the
`await: true` flag and just fire the SET; the new state arrives back
via SSE within milliseconds. Result: instant LED flip, no timeout,
correct front-panel mirroring.

The fallback `localCache` path is retained in the code (with a
comment explaining its role) so any future toggle command added to
`CAT_COMMANDS` but not yet mirrored in the serial server still works
optimistically — the operator just won't see front-panel changes
until the serial-server gains parser support for that code.

### 21.8 Files changed in this batch

| Path | Change |
|---|---|
| `components/cat-commands-ftx1.ts` | Added `isBinaryToggleCommand` helper + `TOGGLE_STATE_FIELDS` map. |
| `components/PresetButton.vue` | New `isToggle`, `currentValue`, `ledStatus` computeds; `executeToggle()`; `state` prop; restored inline `.btn-led*` styles. |
| `components/PresetBuilder.vue` | New "Toggle switch (on/off button)" checkbox + `toggleValidation` + Save guard; form / loader / save round-trip the `toggle` field. |
| `pages/index.vue` | `TransceiverState` gains `breakIn` / `txWatch`; `state` forwarded as a prop to `PresetButton`. |
| `serial-server.mjs` | `breakIn` / `txWatch` defaults; `BI` / `TS` cases in `_parseResponse`; `BI` / `TS` added to `_initialSync2`. |
| `server/api/json-presets.{get,put}.ts` | `Preset` interface gains `toggle?: boolean` (handlers JSON-stringify the body so no logic change is required). |
| `changelog.md` | New entry dated 2026-05-28 15:30. |
| `cat-ftx1-NXC.md` | This § 21; header `Status:` line refreshed. |

### 21.9 Verification (operator confirmed)

1. `npm run dev`, connect to the radio (real or simulator).
2. Open a preset in the builder, tick **Toggle switch (on/off button)**,
   set the sequence to a single `LK0` (or `LK1` — both default-fill
   to `LK1` regardless), Save. Button now shows the LED.
3. LED reflects the radio's actual key-lock state at startup; pressing
   `LOCK` on the radio's front panel flips the on-screen LED within
   one SSE frame.
4. Repeat the test for each of `MX`, `ST`, `VX`, `BI`, `TS` — every
   LED tracks the device and clicks send the inverse.
5. On the virtual-COM-pair test rig: `BI` and `TS` toggles no longer
   time out. LED flips immediately, then settles on the SSE-confirmed
   value.
6. In the builder, attempt to mark a multi-step preset as a toggle:
   the row turns red, the inline message reads "Toggle switches need
   exactly one step that uses a binary 0/1 CAT command (LK, MX, ST,
   VX, BI, TS).", Save is disabled.
7. Untick the toggle option on a previously-toggle preset: the JSON
   file is rewritten without the `toggle` field; reloading the page
   renders the preset as a classic sequence button again.

### 21.10 Deliberately deferred

- **Catalogue expansion** — the six codes above are the only binary
  toggles the manual currently exposes. If Yaesu adds more in a
  firmware update, a single new entry in `CAT_COMMANDS` (plus, for
  device-state mirroring, one `case` in `_parseResponse` and one line
  in `_initialSync2`) is enough.
- **EX-menu mass-toggles** — the manual's EX menu contains many
  0/1-style entries, but each is identified by an EX index rather
  than a stand-alone 2-letter code. Treating those as toggles would
  require the EX-menu cascading picker work already noted in § 19.11.
- **Bulk-toggle macros** — the Macro Builder is still DB-backed and
  does not consume the new helper. Out of scope for § 21 (operator's
  decision).

---

## 22. Follow-on batch — Rocket-launch toggle-switch visual style (2026-05-28)

### 22.1 Motivation

§ 21 made toggle presets work correctly and look like a normal preset
button with a small green/red LED dot next to the label. The operator
asked for a **second, more conspicuous visual style** for toggle
presets — a "rocket-launch-like toggle switch" rendering — to clearly
distinguish stateful on/off controls from one-shot sequence buttons
when both appear in the same grid. The new style had to be **opt-in
per preset**, because the busy bat-handle visual is appropriate for a
dedicated row of toggles but visually overwhelming when interleaved
with frequency presets in the same grid.

### 22.2 Design — cosmetic flag only, no new state

A new optional field is added to the preset schema:

```ts
toggleSwitch?: boolean
```

Semantics:

- Only meaningful when `toggle === true`.
- `true` ⇒ render the bat-handle switch visual.
- `false` / missing ⇒ render the flat button + small LED from § 21
  (the historical default).

The flag is **purely presentational**. It does not affect any
runtime behaviour, the SSE flow, the validation rules, or the JSON
payload sent to the radio. PresetButton hosts both renderings inside
a single `v-if` / `v-else` branch in the template, so every existing
behaviour (running spinner, ok/err flash, disabled-state styling,
click-debounce) is inherited unchanged.

### 22.3 `components/PresetButton.vue` — `useSwitchStyle` + markup

A single computed gates the new template branch:

```ts
const useSwitchStyle = computed<boolean>(() =>
  isToggle.value && props.preset.toggleSwitch === true,
)
```

The root `<button>` gets two state classes:

- `is-toggle` (from § 21) — whenever toggle mode is active.
- `is-toggle-switch` (new) — whenever the rocket-switch visual is
  active. This is the hook for all switch-specific CSS so plain LED
  toggles never accidentally inherit switch-only styling.

The `.rocket-switch` markup (rendered only when `useSwitchStyle`) is:

```
.rocket-switch
├── .rs-label.rs-label-on             "ON"   (stencil)
├── .rs-housing                       (recessed dark slot)
│   ├── .rs-screw.rs-screw-{tl,tr,bl,br}   (4 corner screws)
│   ├── .rs-slot                      (vertical travel guide)
│   └── .rs-lever                     (the bat handle)
│       ├── .rs-lever-tip             (bright cap)
│       └── .rs-lever-base            (darker shank)
└── .rs-label.rs-label-off            "OFF"  (stencil)
```

When `useSwitchStyle` is `false` the `<button>` instead renders the
original left accent bar followed by the body with the inline
`.btn-led` dot — pixel-identical to the § 21 output.

### 22.4 CSS architecture — selectors carry the visual contract

Lever position, label highlight, and panel halo are all derived from
the existing `is-toggle-{on|off|unknown|pending}` class on the root
button — the same class that drives the small LED's colour. This
keeps the state model and the two visual modes literally
interchangeable: any future change to "what does *unknown* mean" only
needs to be expressed in one place.

Concrete selectors (abbreviated):

```css
.preset-btn.is-toggle.is-toggle-on  .rs-lever  { top: 2px;  }
.preset-btn.is-toggle.is-toggle-off .rs-lever  { top: 17px; }
.preset-btn.is-toggle.is-toggle-unknown .rs-lever {
  top: 9px; opacity: .45; filter: grayscale(.6) …;
}
.preset-btn.is-toggle.is-toggle-pending .rs-lever {
  animation: rs-lever-vibrate .45s ease-in-out infinite alternate;
}
```

These selectors are written against `.is-toggle-…` (not `.is-toggle-switch.is-toggle-…`)
because `.rs-lever` only exists inside the rocket-switch markup
anyway. Selectors that mention switch-only properties (panel
background, hover background, ON/pending halo) are scoped to
`.is-toggle-switch` so plain LED toggles keep the pre-§-21 look:

```css
.preset-btn.is-toggle-switch {
  background: linear-gradient(145deg, #1d2228 0%, #11141a 100%);
  min-height: 66px;
}
.preset-btn.is-toggle-switch.is-toggle-on    { box-shadow: …green halo… }
.preset-btn.is-toggle-switch.is-toggle-pending { box-shadow: …amber halo… }
```

### 22.5 `components/PresetBuilder.vue` — opt-in checkbox

A second checkbox is added immediately under the existing "Toggle
switch (on/off button)" option:

> **Use rocket-switch visual style**
>
> *Cosmetic. When ticked, this toggle preset is drawn as a physical
> bat-handle switch on a dark panel; when un-ticked it uses the
> standard flat button with a small green/red LED. Set per preset so
> you can mix plain on/off buttons and fancy switches in the same
> grid.*

The new label uses the existing `.pb-toggle-check` styling, plus a
new modifier `.pb-toggle-style-check` that:

- Indents the sub-option (`margin-left: 26px`).
- Adds a thin vertical rule on its left (`border-left: 2px solid #30363d`)
  to read as "this option belongs to the option above".
- Greys out (`.pb-toggle-style-check--disabled`) and sets
  `cursor: not-allowed` on the checkbox when the parent toggle option
  is off. The disabled state is enforced both visually (CSS) and
  functionally (`:disabled` binding on the input element).

Form-state changes:

| Step | Edit |
|---|---|
| `form.value` default | Added `toggleSwitch: false`. |
| `startNewPreset()` | New form object includes `toggleSwitch: false`. |
| `loadPresetIntoForm(p)` | `toggleSwitch: p.toggleSwitch === true` round-trips the flag. |
| `save()` | Persists `newPreset.toggleSwitch = true` only when **both** `form.toggle` and `form.toggleSwitch` are true. |

The double-guard in `save()` ensures non-toggle presets and unstyled
toggle presets never carry a stale `toggleSwitch` field, keeping the
JSON diff clean for git review.

### 22.6 Type alignment across the stack

| Location | Field added |
|---|---|
| `components/PresetBuilder.vue` — local `Preset` interface | `toggleSwitch?: boolean` |
| `components/PresetButton.vue` — local `Preset` interface | `toggleSwitch?: boolean` |
| `pages/index.vue` — local `Preset` interface | `toggleSwitch?: boolean` |
| `server/api/json-presets.put.ts` — exported `Preset` | `toggleSwitch?: boolean` |
| `server/api/json-presets.get.ts` — exported `Preset` | `toggleSwitch?: boolean` |

All five interfaces now match. The server handlers JSON-stringify the
body unchanged, so adding the field to their type is documentation
only — no logic change.

### 22.7 Files changed in this batch

| Path | Change |
|---|---|
| `components/PresetButton.vue` | `useSwitchStyle` computed; `is-toggle-switch` class; `.rocket-switch` markup; new CSS for switch panel + lever + screws + halo; restored `.btn-led*` rules used by the non-switch toggle style. |
| `components/PresetBuilder.vue` | "Use rocket-switch visual style" checkbox + `.pb-toggle-style-check` CSS; `form.toggleSwitch` round-trip in default / load / save. |
| `pages/index.vue` | `Preset` interface gains `toggleSwitch?: boolean`. |
| `server/api/json-presets.{get,put}.ts` | Exported `Preset` types gain `toggleSwitch?: boolean`. |
| `changelog.md` | New entry dated 2026-05-28 16:24. |
| `cat-ftx1-NXC.md` | This § 22; header `Status:` line refreshed. |

### 22.8 Verification (operator confirmed)

1. `npm run dev`. Existing toggle presets render exactly as in § 21
   (flat button + small LED). No visual regressions.
2. Edit an existing toggle preset in the builder. Tick the new
   **Use rocket-switch visual style** checkbox, Save. The on-screen
   button changes to the bat-handle switch immediately.
3. The lever flips correctly between UP / DOWN as the radio state
   changes (front-panel toggles included). The ON / OFF stencil
   labels illuminate in the matching colour.
4. Clicking the switch sends the inverse; the lever briefly
   oscillates (pending) and settles on the new state after the next
   SSE frame.
5. Edit a non-toggle preset: the rocket-switch checkbox is greyed
   out and refuses input. Saving the preset does not write the
   `toggleSwitch` field.
6. Edit a toggle preset, tick the rocket-switch option, then untick
   the parent toggle option: Save writes neither flag (per the
   double-guard in § 22.5).
7. Open `cat-presets.json` and confirm: non-toggle presets and
   unstyled toggle presets have **no** `toggleSwitch` key; only
   styled toggle presets carry `toggleSwitch: true`.

### 22.9 Deliberately deferred

- **Other switch styles** (rocker, slider, guarded missile cover) —
  the `toggleSwitch` flag is currently boolean. If the operator ever
  asks for a third style, promoting it to a `'led' | 'switch' | 'guarded'`
  union is a one-line schema change plus an extra `v-if` branch.
- **Macro-button equivalent** — the Macro Builder UI does not yet
  expose a "toggle" mode at all; if it ever does, the same
  `useSwitchStyle` computed pattern can be lifted straight across.

### 22.10 Why opt-in (not auto-applied)

- The bat-handle visual is conspicuously larger and busier than the
  flat button + LED. For a preset row that mixes a `MX` toggle with
  five frequency presets, the small LED is cleaner. For a dedicated
  row of six toggles, the showy switches give a clear cockpit-style
  layout.
- Auto-applying the new visual to every existing toggle preset on
  load would have been a silent visual regression for operators who
  had already laid out their preset grid carefully — exactly the
  surprise that the project's documentation policy is written to
  avoid. Opt-in keeps every existing preset looking identical until
  the operator chooses otherwise.

---

## 23. `rigctld`-compatible TCP relay + live terminal panel (2026-05-28)

### 23.1 Motivation

Every serious ham-radio program — WSJT-X, Fldigi, JS8Call, N1MM,
Gpredict, CQRLOG, Logger32 — speaks Hamlib's `rigctld` text protocol
to control whatever radio the operator owns. The standard way to
join that ecosystem is to integrate Hamlib itself: bundle `libhamlib`
+ the FTX-1 backend into the Electron installer, replace
`serial-server.mjs` with a `rigctld` child process (or drive
`libhamlib` via FFI), and hand the operator's PTT / freq / mode
commands off to Hamlib's model 1051 driver.

That option was assessed in detail and explicitly **rejected** —
see `Hamlib-Research.md` §§ 1–4 for the full reasoning. Headline
points:

- Hamlib's FTX-1 backend was at **Alpha** quality as of 2026-02
  (PR [#1826](https://github.com/Hamlib/Hamlib/pull/1826)). Shipping
  it as the *single* CAT layer would mean any FTX-1 bug becomes the
  visible face of *our* app.
- Hamlib's public C API doesn't speak our existing rich vocabulary:
  bandscope (`SS`, `BS`), BI/TS/ST/MX binary toggles tracked via
  SSE, the FTX-1 EX-menu (~300 items), the 90-command catalogue
  with smart parameter validation (§§ 19, 20). Replacing
  `serial-server.mjs` with `rigctld` would surrender all of it.
- Packaging `libhamlib` per-platform into the Electron build is real
  engineering work that pays no immediate dividend on the only
  radio we actually own.

But the *external* benefit of the Hamlib ecosystem — being able to
run WSJT-X against the same radio our app is driving, without the
two fighting over the serial port — is the real prize. The
architecture that captures that benefit at the lowest cost is to
**expose** a `rigctld`-compatible TCP port from our own server, not
to *consume* Hamlib's library. § 23 implements that architecture.

### 23.2 Architecture

```
                  ┌──────────────────────────────────────┐
                  │  serial-server.mjs (Node, port 3001) │
WSJT-X ──TCP:4532─┤  ┌──────────────┐                    │
Fldigi  ──TCP:4532┤  │ rigctld-relay│  manager.state     │
Gpredict──TCP:4532┤  │     .mjs     │  manager.send*()   │
                  │  └─────┬────────┘                    │
                  │        │ events  ┌───────────────┐   │
                  │        ├────────►│ SSE bridge    │   │
                  │        ▼         │ event: rigctld│   │
                  │  ┌──────────────┐│  data: …      │   │ ──/events/─►  browser
                  │  │ SerialManager├┤               │   │
                  │  │  (CAT bridge)│ └───────────────┘   │
                  │  └──────┬───────┘                     │
                  └─────────┼─────────────────────────────┘
                            ▼  USB / RS-232 / virtual COM
                       ┌───────────┐
                       │  FTX-1    │
                       └───────────┘
```

Three layers, each independent enough to be tested and reasoned
about in isolation:

1. **Protocol relay** (`rigctld-relay.mjs`) — TCP server that speaks
   the `rigctld` text protocol and translates it into our existing
   internal CAT vocabulary (`manager.sendCommandNoWait('FA…')`).
2. **SSE bridge** (in `serial-server.mjs`) — forwards three relay
   events (`client-connect`, `client-disconnect`, `line`) onto the
   existing SSE stream as a *named* event so the existing
   `/api/events` proxy passes them through unmodified.
3. **UI terminal panel** (in `pages/index.vue`) — pops up next to
   the Band Scope panel on first client connect, shows colour-coded
   RX/TX lines with timestamps, auto-scroll, drag-to-resize.

Plus a security gate (`ip-allowlist.mjs`) shared with the existing
§ 9 middleware so the relay honours the same `ALLOWED_IPS` env var
as the rest of the app.

### 23.3 Why a custom protocol implementation, not a `rigctld` proxy

The alternative implementation is "run a real `rigctld` process and
have it talk to `serial-server` over its HTTP API". That would let
us reuse Hamlib's protocol code verbatim. It was rejected because:

- It would still require packaging `rigctld.exe` + its DLLs into the
  Electron installer per platform — the very cost the architectural
  decision (`Hamlib-Research.md` § 3) was trying to avoid.
- It would chain three processes (`rigctld` → HTTP client →
  `serial-server` → serial port) instead of two, doubling the
  latency budget on every PTT for no protocol-correctness gain.
- The relay's command surface is small enough (about a dozen
  commands cover 95 % of real-world usage) that re-implementing it
  in 600 lines of JS is comparable in maintenance cost to
  shipping + signing + updating a bundled `rigctld.exe`.
- We gain full control over response timing and virtual-split
  semantics, which lets us fix the FTX-1's hardware-split quirk
  (§ 23.6) at our protocol boundary instead of inheriting Hamlib's
  workaround.

The result is one self-contained `.mjs` file, no native
dependencies, and zero impact on the existing serial-server's
runtime behaviour when no `rigctld` client is connected.

### 23.4 Supported command surface

The relay accepts both the **single-letter form** (legacy default,
what every common client uses) and the **long form** with `\`
prefix. Empty / blank lines are silently dropped.

| Single | Long | Effect | Wire to radio |
|---|---|---|---|
| `f` | `\get_freq` | Main RX freq (Hz) | reads `state.mainFreq` |
| `F <hz>` | `\set_freq <hz>` | Set Main RX freq | `FA{9-digit Hz}` |
| `i` | `\get_split_freq` | Split / Sub TX freq | reads `state.subFreq` |
| `I <hz>` | `\set_split_freq <hz>` | Set split TX freq | `FB{9-digit Hz}` |
| `m` | `\get_mode` | Main mode + bandwidth | reads `state.mainMode` |
| `M <mode> <bw>` | `\set_mode <mode> <bw>` | Set Main mode (bw ignored) | `MD0{code}` |
| `x` | `\get_split_mode` | Sub mode | reads `state.subMode` |
| `X <mode> <bw>` | `\set_split_mode …` | Set Sub mode | `MD1{code}` |
| `t` | `\get_ptt` | PTT state | reads `state.txState` |
| `T <0|1>` | `\set_ptt <0|1>` | Set PTT (split-aware) | `TX1`/`TX0` + optional `FT1`/`FT0` |
| `v` | `\get_vfo` | Current VFO | always `VFOA` |
| `V <vfo>` | `\set_vfo <vfo>` | Accept VFO selection | no-op (Main = VFOA) |
| `s` | `\get_split_vfo` | Split flag + TX VFO | per-socket virtual state |
| `S <0|1> <vfo>` | `\set_split_vfo …` | Set split | per-socket only, NO `ST1` to radio |
| `\dump_state` | (or numeric `1`) | Capabilities dump | static template, see § 23.5 |
| `\chk_vfo` | — | VFO-style check | `CHKVFO 0` |
| `q` / `Q` | `\quit` | Close socket | — |
| anything else | — | — | `RPRT -11` (ENAVAIL) |

Responses follow standard `rigctld` basic-mode shape:

- GET: data lines (one per value), no `RPRT 0`.
- SET: `RPRT 0` on success, `RPRT -N` on error.
- Errors mapped from Hamlib's `rig.h`:
  `-1` EINVAL (bad arg), `-6` EIO (no radio), `-11` ENAVAIL
  (unsupported command), `-16` EVFO (invalid VFO), `-7` EINTERNAL.

### 23.5 `dump_state` capabilities — deliberately conservative

WSJT-X and friends call `dump_state` once at connect time and parse
the result to decide what's possible on this radio. The relay
serves a static 30-line template:

```
0                       protocol version
1051                    rig model number (matches Hamlib's FTX-1)
2                       ITU region
30000 56000000 0x3bbf -1 -1 0x3 0x1     RX: 30 kHz – 56 MHz
0 0 0 0 0 0 0           (end of RX ranges)
1800000 2000000 0x3bbf 5000 100000 0x3 0x1     TX: 160 m
3500000 4000000 0x3bbf 5000 100000 0x3 0x1     TX: 80 m
…                                              TX: 60-, 40-, 30-, 20-, 17-, 15-, 12-, 10-, 6-m
0 0 0 0 0 0 0           (end of TX ranges)
0x3bbf 1 / 10 / 100 / 1000                     tuning steps
0 0
0x2 500 / 0x2 2400 / 0xc 2400 / 0x1 6000 / 0x20 12000   filter widths
0 0
9999 / 9999 / 0         max RIT / XIT / IF shift
0 / 0 / 12 0            announces / preamps / attenuator
0x4084c / 0x4084c       get_func / set_func   (LOCK|MON|VOX|COMP|FBKIN)
0 / 0 / 0 / 0           LEVEL / PARM bitmaps
done
```

Modes-mask `0x3bbf` advertises USB | LSB | CW | CWR | AM | FM | RTTY |
RTTYR | PKTLSB | PKTUSB | PKTFM. This is intentionally narrower than
the FTX-1's full mode set: rigctld doesn't have standard names for
`C4FM-DN`, `C4FM-VW`, `DATA-FM-N`, `PSK`, or `AMS`, so the relay
folds them to the nearest standard mode when sending and rejects
unknown mode names on SET (with `RPRT -1`). The mapping lives in
two constants (`FTX1_MODE_FROM_RIGCTLD`, `RIGCTLD_MODE_FROM_FTX1`)
derived from the same `MODE_PARAM_ENUM` used by the smart Preset
Builder (§ 19), so the table stays in sync with the rest of the
catalogue.

LEVEL and PARM bitmaps are deliberately zeroed — we don't yet expose
S-meter, power, ALC, SWR, AGC, RF/AF/SQL, IF shift over `rigctld`.
Clients that need these silently fall back to defaults; if a
real-world client breaks without them, the implementation pattern
is identical to FUNC handling (read from `manager.state.*`).

### 23.6 Virtual split — Hamlib FTX-1 backend parity

The FTX-1's hardware split (`ST1`) forces the Sub VFO into a
TX-armed state, which breaks satellite Doppler workflows where
TX-side frequency tracking needs to be independent of the displayed
Sub VFO. Hamlib's own FTX-1 backend works around this by
synthesising the split semantics entirely in software and never
sending `ST1` to the hardware (issue
[Hamlib/Hamlib#1972](https://github.com/Hamlib/Hamlib/issues/1972)).

The relay does the same:

- `S 1 VFOB` (split on) sets a **per-socket** flag, never touches
  the radio.
- `I <hz>` writes the TX freq to Sub VFO (`FB`).
- `T 1` (PTT on) checks the per-socket split flag — if set, sends
  `FT1` (TX side = Sub) before `TX1`.
- `T 0` sends `TX0` first, then `FT0` (TX side back to Main) when
  split is on.
- `S 0 VFOA` clears the flag.

Per-socket scoping means two `rigctld` clients can be in different
operating modes simultaneously: a Gpredict session running virtual
split for satellite tracking, plus a WSJT-X session running
non-split for HF SSB, on the same radio at the same time. The
underlying radio just sees `FA` / `FB` / `FT` / `TX` writes.

### 23.7 SSE bridge — named events, byte-for-byte proxy

The existing `/api/events` SSE proxy (`server/api/events.get.ts`)
is a transparent `upRes.on('data', …)` pipe — it doesn't parse the
SSE stream, it just forwards bytes. That means the serial-server
can introduce a new SSE *event type* without changing the proxy at
all. The relay traffic uses:

```
event: rigctld
data: {"kind":"line","remote":"127.0.0.1:54321","dir":"in","text":"f","ts":1716901234567}

```

versus the existing default-event frames:

```
data: {"_delta":true,"mainFreq":14250000}

```

The browser distinguishes them via:

```ts
es.onmessage = (e) => { /* state deltas */ }
es.addEventListener('rigctld', (e) => { /* relay traffic */ })
```

Three event shapes:

| `kind` | Payload fields | Meaning |
|---|---|---|
| `'connect'` | `remote, ts` | A new TCP client passed the allowlist gate. |
| `'disconnect'` | `remote, ts` | The client's TCP socket closed. |
| `'line'` | `remote, dir, text, ts` | One line of traffic. `dir: 'in'` = received from client; `dir: 'out'` = sent by relay. |

`remote` is the already-normalised `ip:port` string (IPv4-mapped
IPv6 stripped). Multi-line responses (`dump_state`) emit one
`'line'` event per line so the UI renders them naturally without
needing its own splitter.

When zero SSE subscribers exist, the broadcast function returns
early — there's no JSON serialisation, no allocations, no overhead.
The relay therefore costs nothing at rest.

### 23.8 IP allowlist gating

The existing § 9 LAN allowlist (`ALLOWED_IPS` env var, defaults to
`127.0.0.1/8,::1`) is the single source of truth for what's allowed
to reach our HTTP surface. The `rigctld` relay honours the same
list — there is no separate `RIGCTLD_ALLOWED_IPS`.

Implementation detail: the existing allowlist lives in
`server/utils/ipAllowlist.ts`, which is only loaded by the Nuxt /
Nitro server. The standalone `serial-server.mjs` process can't
import it directly. § 23 therefore adds a sibling `ip-allowlist.mjs`
at the repo root that mirrors the .ts logic exactly (same defaults,
same CIDR + single-address support for IPv4 and IPv6, same
`::ffff:` → IPv4 normalisation). Both files share the same
environment variable and produce identical decisions. Keep them in
sync — both carry cross-reference comments to that effect.

The gate runs at the *very top* of `_onConnection`:

```js
let ip = socket.remoteAddress ?? ''
if (ip.startsWith('::ffff:')) ip = ip.substring(7)
const remote = `${ip}:${socket.remotePort}`
if (!this.isAllowed(ip)) {
  console.warn(`[rigctld-relay] rejected connection from ${remote} (not on ALLOWED_IPS)`)
  try { socket.destroy() } catch {}
  return
}
```

Denied connections see only a closed TCP socket — no protocol
traffic, no event emission, no entry in the UI terminal feed. A
single server-side warning line is logged so the operator can spot
scanner or misconfigured-client activity in the console. The
`isAllowed` predicate is *injected* by the constructor, so the
relay itself has no compile-time dependency on `ip-allowlist.mjs`;
the production caller (`serial-server.mjs`) passes the real
predicate, while unit-test stubs can pass `() => true` or `() => false`
to exercise both branches deterministically.

Default bind address changed from `127.0.0.1` to `0.0.0.0` in this
batch. Rationale: the allowlist is the security boundary, so
binding loopback-only at the OS layer is redundant for safe
operators and prevents intentional LAN access for ones who've
configured `ALLOWED_IPS` to include their LAN. Operators who
explicitly want kernel-level loopback enforcement can still set
`RIGCTLD_HOST=127.0.0.1`. Both layers are independent — bind
address controls *which packets reach userspace*; allowlist
controls *which packets get a protocol response*.

### 23.9 UI terminal panel

A new bottom-panel `.rigctld-panel` slots into the existing
`.bottom-panels` row immediately to the right of the Band Scope.
Behaviour (all in `pages/index.vue`):

- **Hidden by default.** First `'connect'` event from the SSE
  stream sets `rigctldOpen = true`; the panel slides in.
- **Manual ×-close** sets `rigctldOpen = false`. Next client
  connect re-opens it.
- **Header status pill** shows the connected client IP(s):
  - 0 clients → `● no clients` (gray dot)
  - 1 client → `● 127.0.0.1` (green dot)
  - 2–3 → `● 127.0.0.1, 192.168.1.42`
  - 4+ → `● 127.0.0.1, 192.168.1.42 +N (count)`
  - Full `ip:port` per line in the hover tooltip.
- **Three icon buttons**: ↧/↥ auto-scroll toggle, ⌫ clear log,
  × close panel.
- **Line rendering** is a CSS grid with three columns
  (`92px 18px 1fr`): tabular-numeric timestamp, direction arrow,
  text. Four colour classes:
  - `.rigctld-line--in` — cyan `«` (client → us)
  - `.rigctld-line--out` — green `»` (us → client)
  - `.rigctld-line--connect` — violet italic `+`
  - `.rigctld-line--disconnect` — red italic `−`
- **300-line ring buffer** (`RIGCTLD_LOG_MAX`) — drops oldest line
  via `splice(0, n)`.
- **Auto-scroll** follows the tail by default. When the user
  scrolls up, `onRigctldScroll` notes `nearBottom = false` and
  pauses auto-scroll. Scrolling back to the bottom (or clicking
  the ↧ button) re-arms it.

#### 23.9.1 Height matched to the Band Scope panel

Default panel height tracks `.scope-panel`'s height via a
`ResizeObserver` (`startRigctldHeightSync()`). Whenever the scope
panel resizes — including when more controls appear after radio
connect — the rigctld panel matches in lock-step. Synchronisation
attaches when `rigctldOpen` flips to true and detaches when it
flips back to false or on `onUnmounted`.

A drag handle (`.rigctld-resize`) pinned to the bottom edge lets
the operator override that default. The handle uses **pointer
events** (mouse + trackpad + touch), tracks `clientY` deltas,
enforces a 140 px floor, and stores the resulting height in
`localStorage["rigctld_panel_height"]`. Once the user has dragged,
the panel stops tracking the scope panel — until a double-click on
the grip clears the saved height and re-arms auto-tracking.

### 23.10 Configuration surface

Four env vars, all read once at `serial-server.mjs` startup; plus
the shared `ALLOWED_IPS`:

| Variable | Default | Effect |
|---|---|---|
| `RIGCTLD_ENABLE` | `1` | `0` skips starting the relay entirely. |
| `RIGCTLD_PORT` | `4532` | TCP port. Standard Hamlib port. |
| `RIGCTLD_HOST` | `0.0.0.0` | Bind address. `127.0.0.1` to refuse non-loopback SYNs at the kernel layer. |
| `RIGCTLD_DEBUG` | `0` | `1` logs every line of I/O to the serial-server console. |
| `ALLOWED_IPS` | `127.0.0.1/8,::1` | Shared with § 9 Nuxt middleware. The allowlist gate runs on every accepted connection. |

The relay is **enabled by default**. The combination of the default
allowlist (loopback only) and the secure-by-default `RIGCTLD_HOST`
behaviour means a fresh install accepts only same-machine clients
without any operator configuration. Adding a LAN client is two
steps: (1) add the client's IP/CIDR to `ALLOWED_IPS`; (2) point
the client at `<server-IP>:4532`.

### 23.11 Files changed in this batch

| Path | Change |
|---|---|
| `rigctld-relay.mjs` | NEW. ~640 lines: protocol implementation, virtual split, allowlist gate, EventEmitter surface, dump_state template. |
| `ip-allowlist.mjs` | NEW. ~75 lines: Node-native sibling of `server/utils/ipAllowlist.ts`. |
| `serial-server.mjs` | + import of `RigctldRelay` and `ip-allowlist.mjs`; constructs the relay with `isAllowed: isAllowedRemoteAddress`; subscribes to relay events and broadcasts as named SSE event; unified `shutdown()` helper replaces the duplicated SIGTERM/SIGINT handlers. |
| `pages/index.vue` | + `RigctldLogLine` type, reactive state for the panel, SSE listener for `'rigctld'` events, ResizeObserver wiring, pointer-event resize handlers, new `<section class="rigctld-panel">` template, ~125 lines of scoped CSS. |
| `Hamlib-Research.md` | NEW. Research document + § 8 smoke-test guide (telnet/`ncat` walkthrough + WSJT-X "Hamlib NET rigctl" configuration). |
| `changelog.md` | Entry dated 2026-05-28 22:43. |
| `cat-ftx1-NXC.md` | This § 23; header `Status:` line refreshed. |

### 23.12 Verification (operator confirmed)

Automated, then deleted:

- **52-case protocol smoke-test** against a stubbed `SerialManager`:
  every command path (frequency, mode, PTT, virtual split lifecycle,
  disconnected-state behaviour, malformed input). All green; final
  process exits with code 0. Removed after run.
- **5-case allowlist smoke-test**: loopback accepted under default
  allowlist; injected blanket-deny predicate drops + logs without
  sending data; injected blanket-allow predicate gets a real
  response back. All green; removed after run.

Manual, operator-confirmed:

1. Restart `serial-server.mjs`. Console shows:
   ```
   [rigctld-relay] listening on 0.0.0.0:4532 (rigctld-compatible)
   [serial-server] rigctld relay allowlist: "127.0.0.1/8,::1"
   ```
2. `ncat 127.0.0.1 4532` from same machine — accepted. Type `f`,
   get a frequency back. Type `\dump_state`, get the 30-line dump
   ending in `done`. Browser panel pops up next to the Band Scope
   showing both directions of the conversation in real time.
3. Connect a second `ncat` session. Browser header now lists both
   IPs (`127.0.0.1, 127.0.0.1`), tooltip shows both full `ip:port`.
4. Drag the bottom grip of the panel up and down. Panel resizes
   smoothly. Reload the browser tab — chosen height persists.
   Double-click the grip — panel snaps back to Band Scope height
   and resumes auto-tracking.
5. Set `ALLOWED_IPS=192.168.99.99` (an address that doesn't exist
   on this machine) and restart. Try `ncat 127.0.0.1 4532` — TCP
   connection closes immediately, console logs
   `[rigctld-relay] rejected connection from 127.0.0.1:nnnnn (not on ALLOWED_IPS)`,
   browser panel shows no `+` event for this attempt.
6. Configure WSJT-X: **Rig → Hamlib NET rigctl**, **Network Server →
   127.0.0.1:4532**, **PTT Method → CAT**, **Split Operation → Rig**.
   Click **Test CAT** → green OK. Click **Test PTT** → radio keys.
   Tune frequency in WSJT-X — radio QSYs. Tune frequency on the
   front panel — WSJT-X's frequency display updates within one
   poll interval (SSE-driven, no extra polling needed).

### 23.13 Deliberately deferred

- **LEVEL / PARM bitmaps in `dump_state`** are zeroed — we don't yet
  expose S-meter, ALC, SWR, VDD, RF/AF/SQL, IF-shift, AGC over
  `rigctld`. Most clients ignore these; if a client needs them, the
  implementation pattern is the same as FUNC handling — pull from
  `state.*`, format per `rigctld` spec.
- **`+` extended response mode** (each line prefixed with the command
  name). No widely-used client requires it.
- **Memory channel / antenna selection / tuner commands** (`E`/`e`,
  `B`/`b`, `H`/`h`, `y`/`Y`, …) — out of scope.
- **EX-menu cascading picker over `rigctld`** — the FTX-1's ~300 EX
  items remain catalogued in the Preset Builder (§ 19) but aren't
  exposed as `rigctld` commands.
- **DSI / `dump_caps`** — only `\dump_state` is implemented; the
  more verbose `\dump_caps` shape isn't widely used.

### 23.14 Why this aligns with the project's broader design

§ 23 is the first feature that lets a *third-party process* drive
the radio through our bridge. It's worth noting why the
implementation respects the project's existing security and
documentation patterns:

- **Same allowlist, no second config surface** — `ALLOWED_IPS`
  controls the relay exactly as it controls the HTTP surface. There
  is no `RIGCTLD_ALLOWED_IPS` to keep in sync.
- **No new auth scheme** — the relay deliberately does *not*
  implement a Bearer token like the serial-server's HTTP endpoints.
  Hamlib-aware clients don't speak our Bearer token, and the
  allowlist is a stronger gate at this layer (a token must travel
  with every request; an IP-block check is intrinsic to the TCP
  handshake).
- **No new SSE channel for browsers** — relay traffic re-uses the
  existing `/api/events` stream via a named event, so the
  middleware allowlist / token authentication that already protects
  the SSE channel automatically protects the new event flow too.
- **Same logging conventions** — `[rigctld-relay]` prefix, same
  format as `[serial-server]` and `[ip-allowlist]`. The console is
  the single audit surface; no new log file.
- **Backward-compatible failure mode** — a `RIGCTLD_ENABLE=0` env
  var short-circuits the entire feature without any further config.
  Existing operators who don't want the relay see exactly the
  pre-§ 23 behaviour.

The result is one new TCP port, ~700 lines of new code, two new
files at the repo root, no native dependencies, no schema changes,
no installer changes — and the entire Hamlib client ecosystem
suddenly works against our radio.

## 24. Optional preset step timing; legacy macro UI hidden (2026-05-30)

### 24.1 Motivation

The original macro system stored per-step `delay_ms` and optional await in SQLite (`cat_macro_steps`). For this fork, **JSON presets** (`cat-presets.json`) are the primary operator workflow. Future multi-rig support (e.g. Kenwood TS-850S @ 4800 bps, Raspberry Pi hosts) needs the same pacing controls without re-exposing the full macro UI. The FTX-1 on a modern PC should stay on the fast path by default.

### 24.2 Design

| Control | Default | Effect |
|---|---|---|
| `settings.preset_timing_enabled` | `0` (off) | When off, preset execution is unchanged: 60 ms between steps; AI fire-and-forget when AI streaming is active. Per-step `delayMs` / `await` in JSON are ignored. |
| `settings.preset_default_delay_ms` | `100` | Used when timing is on and a step leaves Delay empty. |
| Per-step `delayMs` | optional | Pause after that command (ms). |
| Per-step `await: true` | optional | Wait for radio reply (`sendCommand`, 2000 ms timeout) before the next step. |

Preset command entries in JSON:

```json
"commands": [
  "FA014074000",
  { "command": "MD2", "delayMs": 200, "await": true }
]
```

### 24.3 Implementation

- **`preset-steps.mjs`** — Node helper used by `serial-server.mjs`.
- **`components/preset-command-utils.ts`** — browser-safe duplicate (`parsePresetCommandEntry`, `normalizePresetSteps`, `presetCommandCount`).
- **`server/utils/presetSteps.ts`** — TypeScript types for API layer.
- **`serial-server.mjs`** — `/preset` accepts `{ steps, timingEnabled, defaultDelayMs }`; branches between legacy loop and timed loop.
- **`server/api/preset-execute.post.ts`** — loads timing flags from `settings`, normalizes commands, POSTs to serial-server.
- **`server/api/settings.get.ts` / `settings.put.ts`** — read/write `preset_timing_enabled`, `preset_default_delay_ms` (graceful fallback if columns missing).
- **`components/PresetBuilder.vue`** — Delay/Await columns when `presetTimingEnabled` prop is true; `serializeCommands()` writes objects when timing fields differ from defaults.
- **`components/PresetButton.vue`** — progress overlay uses `presetCommandCount()`.
- **`pages/index.vue`** — Settings → Preset execution section; `SHOW_MACRO_UI = false` hides macro quick-run, ☰, modal, toast.

### 24.4 Schema

New columns on `settings`:

```sql
preset_timing_enabled INTEGER NOT NULL DEFAULT 0 CHECK (preset_timing_enabled IN (0, 1)),
preset_default_delay_ms INTEGER NOT NULL DEFAULT 100 CHECK (preset_default_delay_ms BETWEEN 0 AND 60000)
```

Migration: `sql/migrate-add-preset-timing-settings.sql`.

### 24.5 Operator verification checklist

1. **Timing off (default):** run a multi-step preset — behaviour matches pre-§ 24 (no extra delay beyond existing 60 ms).
2. **Settings → Preset execution:** enable timing, set default delay 100 ms — Preset Builder shows Delay/Await columns.
3. **Save preset** with one step `await: true` and a 200 ms delay — inspect `cat-presets.json` for object form.
4. **Run preset** with timing on — observe slower pacing / awaited steps on a slow path or simulator.
5. **Macro UI:** confirm quick-run dropdown, ☰, and macro modal are not visible; presets still work.
6. **Migration on second PC:** after `git pull`, run migration SQL once if `data/cat-ftx1.db` already exists.

### 24.6 Deliberately retained

- Macro SQLite tables and `/api/macros*` endpoints — dormant but not deleted; set `SHOW_MACRO_UI = true` in `pages/index.vue` to restore the UI for development.

## 25. Saved channels, band UX, port fallback, settings polish (2026-05-30)

### 25.1 Saved channels (`localStorage` / `cat_channels`)

SP9AX’s original README described saving frequency/mode/SQL to local storage on **SAVE CH: Add**. The NX fork replaces the one-click save with a **Save Channel** modal and richer cards.

| Field | Storage | Notes |
|---|---|---|
| `label` | string | User-editable; default from band meter + mode (e.g. `40m USB`) |
| `vfo` | `'0'` \| `'1'` | MAIN or SUB — set in save modal; recall uses **FA** vs **FB** |
| `freq` | Hz | Editable in modal and on card (MHz text) |
| `mode`, `sqlType`, `ctcssIdx`, `dcsIdx` | snapshot | From VFO at save time; applied on recall |

**Save modal:** opened from **SAVE CH → ADD** on MAIN or SUB; **MAIN/SUB** segmented toggle initialised from the originating VFO card; switching VFO reloads live frequency/mode/SQL from that side.

**Inline edit:** label and MHz use draft-on-focus (same pattern as § 25.4 settings hex fix) so SSE re-renders in simulator mode do not revert keystrokes. Card list order frozen while an input inside a card has focus.

**Legacy:** channels saved before `vfo` was added load as MAIN (`'0'`).

### 25.2 Band selector meter names + frequency refresh

- **`BANDS`** table in `pages/index.vue` extended with `meter` (160m … 70cm). Band modal shows meter + MHz; VFO band button shows meter when known.
- **`band-defaults.mjs`** — calling frequencies per BS band code; **`hzToBandCode`**, **`stepBandCode`** for simulator.
- **`serial-server.mjs`** — `scheduleFreqRefreshAfterBandChange()` after **BS** / **BU** / **BD**: delayed **FA** or **FB** read so UI MHz tracks band changes (radio is silent on BS).
- **`sim-serial-port.mjs`** — implements **BS** / **BU** / **BD** using `band-defaults.mjs`.

### 25.3 Serial-server port fallback (Windows)

Some Windows hosts reserve TCP **3001** (and sometimes **3000**) via Hyper-V/Docker → `EACCES` on bind.

- **`serial-server.mjs`** probes **3001…3026**, writes `%TEMP%/cat-ftx1-serial-port`.
- **`server/utils/serialServerUrl.ts`** — Nuxt server-side URL resolution: env override → port file → default.
- **`.env.example`** — `SERIAL_SERVER_PORT`, `PORT`, etc.
- **`README.md`** — operator troubleshooting (*Port errors on startup*).

### 25.4 Settings hex colour draft

Controlled `:value` on appearance hex text fields reverted on each SSE re-render while typing. Fixed with `hexDraft` + commit on blur/Enter (see also channel drafts in § 25.1).

### 25.5 Offline sync

- **`copy-project.bat`** — robocopy project tree to a CLI path (documented in README).

### 25.6 Screenshot

- **`docs/main_page.png`** updated by operator to reflect saved channels panel, band labels, and current NX main UI (referenced from README screenshots table).

### 25.7 Verification checklist

1. **SAVE CH** from SUB → modal opens with **SUB** selected; save; card shows SUB badge; recall sets **FB** not **FA**.
2. Edit MHz on card — typing is stable in simulator; blur saves; invalid MHz shows error banner.
3. Band picker — **2m** / 144 MHz; select band — MHz updates within ~300 ms.
4. Windows (or forced busy port) — serial-server logs alternate port; Nuxt connects via port file.
5. Settings — type new hex colour; Enter — persists and does not snap back while typing.
6. README / GitHub — `main_page.png` renders in NX fork screenshots table.

### 25.8 Files touched

- `pages/index.vue` — channels UI/logic, band meters, settings hex draft
- `band-defaults.mjs` (new)
- `serial-server.mjs`, `sim-serial-port.mjs`
- `server/utils/serialServerUrl.ts` (new)
- `server/utils/serialFetch.ts`, `server/api/events.get.ts`
- `nuxt.config.ts`, `.env.example` (new)
- `copy-project.bat`
- `docs/main_page.png`
- `README.md`, `changelog.md`, `cat-ftx1-NXC.md`

