# CAT FTX-1 — NXC Session Change Log

- Project: `cat-ftx1` v1.0.1
- Date: 2026-05-26
- Status: Phase 0 (security hardening) verified by operator. Subsequent batches (LAN allowlist, simulator response, bandscope fix, theming, macros database backend, macro builder UI) implemented; macro builder UI awaiting final operator verification.
- Companion document: `SECURITY-AUDIT.md` (full vulnerability report)
- Scope of this document: every code change made in this session, in chronological order. Sections 1–8 describe the initial Phase 0 (security hardening) batch; sections 9+ describe each follow-on batch. Where a Phase 0 design was later superseded, the original section carries a note pointing to the replacement.

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
