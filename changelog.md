# Changelog

All notable changes to this project are recorded here.
Format: each entry is dated `YYYY-MM-DD HH:MM` (local Europe/Warsaw, UTC+2).

---

## 2026-05-30 22:38 — Saved channels, band UX, startup port fallback, settings fix

Follow-on UX and reliability batch after preset timing and offline sync tooling. Main-page screenshot updated (`docs/main_page.png`).

### Added

- **Saved channels (localStorage)** — **Save Channel** modal with editable **label**, **frequency (MHz)**, and **MAIN/SUB VFO** toggle (initialized from the VFO card used to save). Cards show label, VFO badge, editable MHz, mode, and tone info; click row to recall on the **saved VFO**.
- **Band picker meter names** — band modal and VFO band button show amateur designations (e.g. **40m** · 7 MHz, **2m** · 144 MHz).
- **`band-defaults.mjs`** — default/calling frequencies per band code; simulator honours **BS** / **BU** / **BD**.
- **Serial-server port auto-probe** — if TCP **3001** is blocked (common on Windows with Hyper-V/Docker), tries **3002…3026** and writes the chosen port for Nuxt (`server/utils/serialServerUrl.ts` reads port file or env).
- **`.env.example`** — documents `SERIAL_SERVER_PORT`, `PORT`, `ALLOWED_IPS`, `SIMULATE_RIG`.

### Changed

- **`serial-server.mjs`** — after **BS** / **BU** / **BD**, re-reads **FA** or **FB** so the MHz display updates when changing band (real radio + simulator).
- **`sim-serial-port.mjs`** — implements silent band-select commands using `band-defaults.mjs`.
- **`pages/index.vue`** — settings **hex colour** inputs use draft-on-focus (fixes revert-while-typing); channel label/freq inputs use the same pattern with stable card order during SSE re-renders.
- **`nuxt.config.ts`** — `serialServerUrl` from `NUXT_SERIAL_SERVER_URL` / `SERIAL_SERVER_PORT`.
- **`docs/main_page.png`** — refreshed to show saved channels, settings, and current NX main UI.

### Operator-facing impact

- **SAVE CH → ADD** opens the modal; edit label/freq/VFO before **Save**. Existing channels without `vfo` load as **MAIN**.
- **Band select** should QSY the displayed frequency within ~300 ms.
- **Windows port errors:** see README → *Port errors on startup*; optional `.env` override.
- **Theme colours:** type `#RRGGBB` in Settings, press Enter or tab away.

### Files touched

- `band-defaults.mjs` (new)
- `.env.example` (new)
- `server/utils/serialServerUrl.ts` (new)
- `serial-server.mjs`
- `sim-serial-port.mjs`
- `server/api/events.get.ts`
- `server/utils/serialFetch.ts`
- `nuxt.config.ts`
- `pages/index.vue`
- `docs/main_page.png`
- `README.md`
- `cat-ftx1-NXC.md`
- `changelog.md`

---

## 2026-05-30 18:00 — Offline sync script; settings hex colour fix

### Added

- **`copy-project.bat`** — robocopy-based project sync to a CLI destination (excludes `node_modules`, build output, `.git`, local `data\`).

### Changed

- **`pages/index.vue`** — appearance settings **hex text fields** use a draft buffer on focus/input; commit on blur/Enter (fixes old colour overwriting keystrokes).

### Files touched

- `copy-project.bat`
- `pages/index.vue`
- `README.md`

---

## 2026-05-30 12:52 — Optional preset step timing; legacy macro UI hidden

Prepares the JSON preset workflow for future multi-rig support (slow serial rigs such as Kenwood TS-850S @ 4800 bps, or low-power hosts such as Raspberry Pi) without slowing down the default FTX-1 path.

### Added

- **Settings → Preset execution** — global toggle `preset_timing_enabled` (default **off**) and `preset_default_delay_ms` (default **100**). Stored in SQLite `settings` table.
- **Per-step timing in presets** — when timing is enabled, each step in `cat-presets.json` may be a string (legacy) or an object `{ "command": "FA014074000", "delayMs": 150, "await": true }`. Delay/await columns appear in Preset Builder only while the setting is on.
- **`preset-steps.mjs`**, **`components/preset-command-utils.ts`**, **`server/utils/presetSteps.ts`** — shared parse/normalize helpers (client + serial-server + API).
- **`sql/migrate-add-preset-timing-settings.sql`** — adds `preset_timing_enabled` and `preset_default_delay_ms` to existing databases.

### Changed

- **`serial-server.mjs` `/preset` endpoint** — when timing is **off** (default): unchanged behaviour (60 ms between steps; AI fire-and-forget when AI is on). When timing is **on**: honours per-step `delayMs` (fallback to settings default) and optional `await: true` (2000 ms command timeout).
- **`server/api/preset-execute.post.ts`** — reads timing settings from DB and passes them to the serial-server.
- **`components/PresetBuilder.vue`** — Delay/Await step columns (when enabled); serializes timed command objects on save.
- **`components/PresetButton.vue`** — step count via `presetCommandCount()` so timed objects count correctly.
- **`pages/index.vue`** — Settings drawer section for preset execution; macro quick-run, ☰ button, macro modal, and macro toast hidden via `SHOW_MACRO_UI = false` (macro DB/API code retained).
- **`server/api/json-presets.get.ts` / `json-presets.put.ts`** — `PresetCommandEntry` type (string or timed object).
- **`sql/schema.sql`** — new columns on fresh installs.

### Operator-facing impact

- **Default (timing off):** FTX-1 presets behave exactly as before; no action required on upgrade except running the SQL migration on existing installs.
- **Timing on:** use Preset Builder to set per-step delays and optional await for slow rigs or weak hosts.
- **Macros:** no longer shown in the main UI; use JSON presets instead. Macro tables and `/api/macros*` endpoints remain in the codebase.

### Existing database migration

On any machine that already has `data/cat-ftx1.db`, run once:

```powershell
sqlite3 data/cat-ftx1.db ".read sql/migrate-add-preset-timing-settings.sql"
```

Fresh installs pick up the columns from `sql/schema.sql` automatically.

### Files touched

- `preset-steps.mjs` (new)
- `components/preset-command-utils.ts` (new)
- `server/utils/presetSteps.ts` (new)
- `sql/migrate-add-preset-timing-settings.sql` (new)
- `serial-server.mjs`
- `server/api/preset-execute.post.ts`
- `server/api/settings.get.ts`
- `server/api/settings.put.ts`
- `server/api/json-presets.get.ts`
- `server/api/json-presets.put.ts`
- `components/PresetBuilder.vue`
- `components/PresetButton.vue`
- `pages/index.vue`
- `sql/schema.sql`
- `README.md`
- `cat-ftx1-NXC.md`
- `changelog.md`

---

## 2026-05-29 00:04 — Header version label bumped `V2.1-NX` → `V2.2-NX`

Marks the addition of § 23 (the only narrative section added since `V2.1-NX`) — a feature substantial enough to deserve its own minor-version digit:

- § 23 — **`rigctld`-compatible TCP relay + live terminal panel**: external Hamlib-aware apps (WSJT-X, Fldigi, JS8Call, Gpredict, N1MM, CQRLOG, …) can now drive the FTX-1 through our existing serial bridge on TCP port 4532. Includes per-connection gating via the existing § 9 `ALLOWED_IPS` allowlist, Hamlib-style virtual split (no hardware `ST1` ever sent), and a bottom-panel terminal next to the Band Scope that pops up automatically on first client connect and shows colour-coded RX/TX traffic in real time. See `Hamlib-Research.md` for the analysis that led to this architecture (rather than a full Hamlib integration), and `cat-ftx1-NXC.md` § 23 for the long-form implementation reference.

### Changed

- **`nuxt.config.ts`** — `runtimeConfig.public.appVersion`:
  ```ts
  appVersion: 'V2.1-NX',  // before
  appVersion: 'V2.2-NX',  // after
  ```
  Same single-source-of-truth pattern as the previous bumps (§ 18.2). Header consumes via `useRuntimeConfig().public.appVersion` in `pages/index.vue`; no other code change needed.

### Files touched

- `nuxt.config.ts`
- `changelog.md`
- `cat-ftx1-NXC.md` (`Status:` line refreshed to reflect the new version label)

### Operator-facing impact

- Header now reads `FTX-1  CAT CONTROLLER  V2.2-NX  PA0NOX` after the next dev restart (HMR also picks this file up reliably).
- No data migration, no `npm rebuild`, no schema change.
- Override at launch time without editing code is still available via `NUXT_PUBLIC_APP_VERSION` (see § 18.9):
  ```powershell
  $env:NUXT_PUBLIC_APP_VERSION = "V2.2-NX"
  npm run dev
  ```

### Out of scope

- **`package.json:"version"`** intentionally left at `1.0.1`. § 18.6 documents the deliberate decoupling: `package.json` is the npm / electron-builder identity (semver-bound, used for installer filenames), while `appVersion` is the operator-visible fork identifier. They're bumped on different cadences and only need to converge at packaged-installer release time — out of scope for this batch.

---

## 2026-05-28 22:43 — § 23 `rigctld`-compatible TCP relay + live terminal panel

External ham-radio applications (WSJT-X, Fldigi, JS8Call, N1MM, Gpredict, CQRLOG, …) can now drive the FTX-1 through our existing serial bridge by speaking the standard Hamlib `rigctld` protocol over TCP. No Hamlib runtime is bundled — we expose a compatible subset directly from `serial-server.mjs`. See `Hamlib-Research.md` (§§ 1–7) for the why-not-Hamlib analysis that led to this design.

The feature has three layers — protocol relay (backend), live terminal panel (UI), and IP-allowlist gating — implemented as one batch and verified end-to-end with WSJT-X against a real FTX-1. NXC § 23 captures the long-form narrative; this entry is the audit trail.

### Added

- **`rigctld-relay.mjs` (new file, ~620 lines)** — standalone module exporting `RigctldRelay`, an `EventEmitter` that owns one `net.Server` and gates each accepted connection through an injectable `isAllowed(ip)` predicate. Implements the legacy single-letter rigctld protocol *and* the long-form `\get_*` / `\set_*` variants. Per-socket virtual-split state (the Hamlib FTX-1 backend's own workaround for the FTX-1 hardware-split → Sub-VFO TX behaviour, [Hamlib/Hamlib#1972](https://github.com/Hamlib/Hamlib/issues/1972)). Supported commands:
  - `f` / `F` (`\get_freq` / `\set_freq`) — Main VFO frequency (Hz) → `FA{9-digit Hz}`.
  - `i` / `I` (`\get_split_freq` / `\set_split_freq`) — TX/Sub VFO frequency → `FB{9-digit Hz}`.
  - `m` / `M` (`\get_mode` / `\set_mode`) — Main mode + bandwidth (bandwidth field accepted but ignored).
  - `x` / `X` (`\get_split_mode` / `\set_split_mode`) — Sub mode + bandwidth.
  - `t` / `T` (`\get_ptt` / `\set_ptt`) — PTT; honours virtual split (flips `FT1` before `TX1`, `TX0` before `FT0` when split is on).
  - `v` / `V` (`\get_vfo` / `\set_vfo`) — VFO selection (VFOA / VFOB / Main / Sub all accepted; Main = VFOA).
  - `s` / `S` (`\get_split_vfo` / `\set_split_vfo`) — virtual split flag (per-socket).
  - `\dump_state` (also numeric `1`) — capabilities dump: protocol 0, model 1051 (matches Hamlib's FTX-1 backend), 11-band TX ranges, modes mask `0x3bbf`, four tuning steps, five IF filter widths, FUNC bitmap `0x4084c` (LOCK | MON | VOX | COMP | FBKIN).
  - `\chk_vfo` — VFO-style check, answers `CHKVFO 0`.
  - `q` / `Q` / `\quit` — close the socket.
  - All others → `RPRT -11` (ENAVAIL).
  - Errors: `-1` invalid argument, `-6` I/O (no radio), `-16` invalid VFO, `-7` internal.
  - Mode mapping (internal ↔ rigctld) lives in two constants `FTX1_MODE_FROM_RIGCTLD` and `RIGCTLD_MODE_FROM_FTX1` derived from the same MODE_PARAM_ENUM used by the smart Preset Builder.
- **`ip-allowlist.mjs` (new file, ~75 lines)** — Node-native sibling of `server/utils/ipAllowlist.ts`. Reads `ALLOWED_IPS` (same env var the Nuxt middleware uses), defaults to `127.0.0.1/8,::1`, supports CIDR + single addresses for both IPv4 and IPv6, strips `::ffff:` IPv4-mapped IPv6 before lookup. Exposes `isAllowedRemoteAddress(ip)` and `getAllowedIpsSpec()`.
- **Per-connection allowlist gate in `RigctldRelay._onConnection`** — runs *before* the socket is added to the relay's set, *before* any event is emitted, *before* any protocol traffic is sent. Denied connections see only a closed TCP socket; nothing leaks to the UI feed. A single warning line lands in the server log so the operator can spot scanner or misconfigured-client activity.
- **`serial-server.mjs` — `RigctldRelay` instantiated at startup** (replacing the previous SIGTERM/SIGINT cleanup with a unified `shutdown()` helper). Forwards three relay events onto the existing SSE stream as a *named* event `event: rigctld`:
  - `'client-connect'`    → `{ kind: 'connect',    remote, ts }`
  - `'client-disconnect'` → `{ kind: 'disconnect', remote, ts }`
  - `'line'`              → `{ kind: 'line', remote, dir: 'in'|'out', text, ts }`
  Frames are dropped when there are no SSE subscribers, so the relay imposes zero overhead when no browser is attached.
- **`pages/index.vue` — new "rigctld" terminal panel**, slotted into `.bottom-panels` immediately to the right of the Band Scope panel:
  - Pops up automatically the first time a TCP client connects on the relay port; manual ×-close.
  - Header shows the client IP(s): single IP for one client, comma-separated for 2–3, "ip1, ip2 +N" for many. Full `ip:port` per line in the hover tooltip. Green pill dot when any client is connected, gray when none.
  - Three icon buttons in the header: ↧/↥ auto-scroll toggle, ⌫ clear log, × close panel.
  - Color-coded line rendering:
    - cyan `«` — line received from the client
    - green `»` — line sent to the client
    - violet `+` — system: client connected
    - red `−` — system: client disconnected
  - 300-line ring buffer; tabular monospace timestamps `HH:MM:SS.mmm`.
  - Default panel height tracks `.scope-panel` via `ResizeObserver`; user drag of the bottom grip locks in a custom height (persisted to `localStorage["rigctld_panel_height"]`); double-click the grip reverts to auto-tracking.

### Changed

- **`rigctld-relay.mjs` default bind**: `127.0.0.1` → `0.0.0.0`. The allowlist now does the gating; the OS-level bind no longer needs to be the security boundary. Users who want to refuse even SYN packets from non-loopback can still set `RIGCTLD_HOST=127.0.0.1` explicitly.
- **`rigctld-relay.mjs` extends `EventEmitter`** so the SSE bridge in `serial-server.mjs` can attach `.on(…)` handlers for the three events listed above. No protocol behaviour changed.
- **`rigctld-relay.mjs` `stop()` order fix** — `socket.destroy()` on all per-client sockets *before* awaiting `server.close()`. The previous order would hang shutdown indefinitely if a `rigctld` client (e.g. WSJT-X) was still connected. Surfaced during automated smoke-tests.

### Configuration

All four relay env vars are read once at `serial-server.mjs` startup:

| Variable | Default | Effect |
|---|---|---|
| `RIGCTLD_ENABLE` | `1` | Set to `0` to skip starting the relay. |
| `RIGCTLD_PORT`   | `4532` | TCP port. Standard Hamlib `rigctld` port. |
| `RIGCTLD_HOST`   | `0.0.0.0` | Bind address. Default lets LAN packets reach the allowlist gate; use `127.0.0.1` to refuse non-loopback SYNs entirely. |
| `RIGCTLD_DEBUG`  | `0` | `1` logs every line of I/O to the serial-server console. |

`ALLOWED_IPS` is shared with the existing Nuxt middleware (§ 9). Default `127.0.0.1/8,::1` means LAN clients must be opted in explicitly, exactly the same opt-in shape as the existing HTTP surface.

### Files touched

- `rigctld-relay.mjs` (new file)
- `ip-allowlist.mjs` (new file)
- `serial-server.mjs` — imports + relay construction + SSE bridge + unified `shutdown()`
- `pages/index.vue` — `RigctldLogLine` type, reactive state, ResizeObserver wiring, pointer-event resize handlers, SSE listener, new `<section class="rigctld-panel">`, ~125 lines of scoped CSS
- `Hamlib-Research.md` — § 8 smoke-test guide (telnet/`ncat` walkthrough + WSJT-X "Hamlib NET rigctl" configuration)

### Operator-facing impact

- **External app interop** — point any Hamlib-aware app at `Hamlib NET rigctl → 127.0.0.1:4532` (or your LAN IP if you've added it to `ALLOWED_IPS`). For WSJT-X specifically: **Split Operation → Rig** (uses our virtual split), **PTT Method → CAT** (routes PTT over the same TCP socket).
- **No npm rebuild**, no schema migration, no installer change.
- **Backward compatibility**: nothing existing changed. The relay is additive; SSE consumers that don't subscribe to the `rigctld` event are unaffected.
- **Visibility**: the new bottom-panel makes every line of CAT traffic from WSJT-X et al. visible in real time — useful for trouble-shooting "why isn't my logging app picking up the frequency?" without reaching for Wireshark.

### Verification

- 52-case automated protocol smoke-test (frequency, mode, PTT, virtual split, disconnected-state behaviour, malformed input) — all green, then removed.
- 5-case allowlist smoke-test (default loopback accept, blanket-deny predicate drops + logs, blanket-allow predicate gets data through) — all green, then removed.
- Manual telnet/`ncat` walkthrough — confirmed by operator.
- Manual WSJT-X integration — confirmed by operator (frequency reads, frequency writes, mode writes, virtual split, PTT all behave correctly).

### Out of scope / intentionally deferred

- **LEVEL / PARM bitmaps in `dump_state`** report 0 — we don't yet expose S-meter, power, ALC, SWR, voltage, AGC, RF, AF, SQL, IFS, NB to rigctld clients. Most clients (WSJT-X, Fldigi) ignore these; if a client needs them, lift the relevant `state.*` field into the appropriate `\get_level` / `\get_func` handler.
- **Extended response mode** (`+f` prefix variant) — no widely-used client requires it.
- **Memory channel / antenna selection / tuner commands** (`E`, `e`, `B`, `b`, `y`, `Y`, …) — not implemented, returns `RPRT -11`.
- **EX-menu sub-shell over rigctld** — the FTX-1 catalogue's ~300 EX items remain accessible only through the Preset/Macro builders, not over the rigctld socket.

---

## 2026-05-28 17:08 — Header version label bumped `V2.0-NX` → `V2.1-NX`

Reflects the cumulative changes shipped on top of `V2.0-NX`:

- § 19 — Smart Preset Builder + 90-command CAT catalogue parsed from the manual, smart parameter validator, `?` help modal with quick-reference table.
- § 20 — Category-browsing Command Picker (replaces the native `<datalist>`, viewport-anchored, auto-flip, keyboard-driven).
- § 21 — Binary toggle-switch presets — eligible 0/1 CAT commands (LK, MX, ST, VX, BI, TS) become stateful on/off buttons with a live LED that mirrors the radio (including front-panel changes) via SSE.
- § 22 — Rocket-launch toggle-switch visual style (opt-in per preset).

### Changed

- **`nuxt.config.ts`** — `runtimeConfig.public.appVersion`:
  ```ts
  appVersion: 'V2.0-NX',  // before
  appVersion: 'V2.1-NX',  // after
  ```
  Single source of truth per § 18.2 design. The header consumes this via `useRuntimeConfig().public.appVersion` in `pages/index.vue`; no other code changes were needed.

### Files touched

- `nuxt.config.ts`
- `changelog.md`

### Operator-facing impact

- Header now reads `FTX-1  CAT CONTROLLER  V2.1-NX  PA0NOX` after the next `npm run dev` restart (HMR also picks this file up reliably).
- No data migration, no `npm rebuild`, no schema change.
- Override at launch time without editing code is still available via `NUXT_PUBLIC_APP_VERSION` (see § 18.9):
  ```powershell
  $env:NUXT_PUBLIC_APP_VERSION = "V2.1-NX"
  npm run dev
  ```

### Out of scope

- **`package.json:"version"`** intentionally left at `1.0.1`. § 18.6 documents the deliberate decoupling: `package.json` is the npm / electron-builder identity (semver-bound, used for installer filenames), while `appVersion` is the operator-visible fork identifier (allowed to carry the `-NX` suffix). They're bumped on different cadences and only need to converge at packaged-installer release time — out of scope for this batch.

---

## 2026-05-28 16:38 — Documentation backfill — Category-browsing Command Picker NXC section

Documentation-only follow-up. The 2026-05-28 04:26 batch
(**Category-browsing Command Picker + viewport-anchored dropdown**)
shipped a changelog entry but no corresponding narrative section in
`cat-ftx1-NXC.md`. This entry backfills it as **§ 20** and renumbers
the two subsequent narrative sections one slot down so the NXC
chronology matches the changelog chronology. No code changes.

### Changed

- **`cat-ftx1-NXC.md` — new § 20** "Category-browsing Command
  Picker" (11 sub-sections). Mirrors the 04:26 changelog entry as
  the project's standard NXC narrative form: motivation, design,
  structure, anchoring + auto-flip, interaction model, auto-open,
  modal cap, files changed, verification checklist, rationale, and
  deliberately deferred follow-ups.
- **`cat-ftx1-NXC.md` — previous § 20 renumbered to § 21**
  ("Binary toggle-switch presets"). All 10 sub-section headers and
  every internal `§ 20` / `§ 20.X` self-reference + the one
  outbound `§ 21` cross-reference (now pointing at the
  rocket-switch section) updated consistently.
- **`cat-ftx1-NXC.md` — previous § 21 renumbered to § 22**
  ("Rocket-launch toggle-switch visual style"). All 10 sub-section
  headers and every internal `§ 21` / `§ 21.X` self-reference + the
  outbound `§ 20` cross-references (now pointing at the toggle-switch
  section at § 21) updated consistently.
- **`cat-ftx1-NXC.md` — header `Status:` line** refreshed to list
  §§ 19, 20 (picker), 21 (toggle-switch), 22 (rocket-switch) in
  chronological order.
- **`changelog.md` — cross-references updated.** The 16:24 entry's
  "(§ 21 added)" callout is now "(§ 22 added)"; the 15:30 entry's
  "(§ 20 added)" callout is now "(§ 21 added)".

### Files touched

- `cat-ftx1-NXC.md`
- `changelog.md`

### Rationale

- The NXC narrative is the project's long-form record of *why* each
  change exists. Leaving the picker entirely in the bullet-style
  changelog made the two documents drift — the changelog had a
  batch the NXC didn't reference. Backfilling the section now,
  while the design context is fresh, keeps every batch documented
  at the same level of detail.
- Renumbering the two later batches (toggle-switch presets,
  rocket-switch visual) was preferred over inserting the picker as
  an "out-of-band" § 20.5 because the toggle-switch and
  rocket-switch sections heavily cross-reference each other; the
  bidirectional § 21 ↔ § 22 references are cleaner than § 21 ↔
  § 20.5 ↔ § 22 + § 21 ↔ § 22, and matches the operator's
  numbering convention throughout §§ 1–19.

---

## 2026-05-28 16:24 — Rocket-launch toggle-switch visual style (opt-in)

Adds a second, **cosmetic-only** rendering mode for toggle presets: a
physical bat-handle switch on a dark machined-panel background, ON/OFF
stencil labels that illuminate green/red as the radio state changes,
and an animated lever that flips between up/down (driven entirely by
the existing `ledStatus` class — no new script logic). The visual
mode is **opt-in per preset** via a new checkbox in the builder, so
operators can mix plain on/off buttons and showy switches in the same
grid. Existing toggle presets keep their original flat-button + small
LED look until the operator ticks the new option. Operator-verified
end-to-end before this entry was written.

### Added

- **`components/PresetBuilder.vue` — "Use rocket-switch visual style"
  checkbox.** Indented immediately under the existing "Toggle switch
  (on/off button)" option, separated by a thin vertical rule so the
  sub-option / parent-option hierarchy reads at a glance. Automatically
  greys out and becomes non-interactive when the parent toggle option
  is off (the cosmetic flag has no meaning for sequence presets).
- **`components/PresetButton.vue` — `.rocket-switch` markup.** Renders
  only when `preset.toggle === true && preset.toggleSwitch === true`.
  Structure:
  - **Stencil labels** (`ON` / `OFF`) above and below the housing,
    monospace 9 px, letter-spaced, both labels muted in the resting
    state — the matching label illuminates green or red (with a soft
    text-shadow halo) when the radio state is known.
  - **Recessed housing**, dark gradient with inner shadow + four
    corner screws + a faint vertical travel slot.
  - **Two-piece lever** (`rs-lever-tip` bright cap + `rs-lever-base`
    darker shank) with a drop-shadow filter. Animates between
    `top: 2px` (UP / ON), `top: 17px` (DOWN / OFF), `top: 9px`
    (centred / dimmed / desaturated = unknown), and a small
    oscillation `rs-lever-vibrate` keyframe while a SET is in flight.
  - All positioning driven by the existing `.is-toggle-{on|off|
    unknown|pending}` classes on the root button — no new state,
    no new watchers.
- **`components/PresetButton.vue` — `useSwitchStyle` computed.**
  Single source of truth: `isToggle && preset.toggleSwitch === true`.
  Gates both the new template branch and the new `is-toggle-switch`
  class on the root button.
- **`components/PresetButton.vue` — dark panel finish.** Scoped to
  `.preset-btn.is-toggle-switch` so plain LED toggles keep the
  original `#161b22` background. The hover state lightens the panel
  by a few percent for tactile feedback.
- **`components/PresetButton.vue` — outer ON/pending halo.** Also
  scoped to `.is-toggle-switch` — plain LED toggles don't gain a
  halo they didn't have before this batch.

### Changed

- **Preset JSON schema (additive only).** New optional field
  `toggleSwitch?: boolean`. Persisted only when both `toggle` and
  `toggleSwitch` are `true`, so non-toggle presets and unstyled
  toggles never carry the field and the JSON diff stays clean.
- **`components/PresetBuilder.vue` — form state.** `form.toggleSwitch`
  added to the default form object, mirrored in `startNewPreset` and
  `loadPresetIntoForm` so the checkbox round-trips correctly across
  edit ↔ save cycles. `save()` only writes the field when both flags
  are true.
- **`components/PresetButton.vue` — restored `.btn-led*` styles.**
  The small inline LED dot is reused for toggle presets that didn't
  opt into the switch style, so the original look is preserved
  pixel-for-pixel (the LED CSS had been temporarily deleted in the
  previous batch while the rocket-switch was the only style).
- **`pages/index.vue`, `server/api/json-presets.{get,put}.ts` — type
  alignment.** `Preset` interface gains `toggleSwitch?: boolean` in
  every location that types preset data, so the schema is documented
  identically client-side, server-side, and inside the API handlers.

### Files changed

- `components/PresetBuilder.vue`
- `components/PresetButton.vue`
- `pages/index.vue`
- `server/api/json-presets.get.ts`
- `server/api/json-presets.put.ts`
- `changelog.md`
- `cat-ftx1-NXC.md` (§ 22 added)

### Operator-facing impact

- **Existing presets are unchanged.** Every toggle preset already in
  `cat-presets.json` shows the original flat button + green/red LED
  until the operator opens the builder and ticks the new option.
- **No file migrations** — the new field is additive and missing means
  "default look".
- **No serial-server / hardware changes** — the rocket-switch is
  purely a presentation-layer addition. The underlying SSE state
  flow (LK / MX / ST / VX / BI / TS) is unchanged.

### Why opt-in

- The bat-handle visual is conspicuously larger and busier than the
  flat button + LED. For an `MX` preset alongside frequency presets
  the small LED is cleaner; for a "BI Toggle" preset on a dedicated
  row the showy switch is appropriate. Letting the operator choose
  per preset keeps both use-cases first-class.

### Rationale

- A second style flag instead of a fully separate component keeps
  every existing PresetButton behaviour (running spinner, ok/err
  flash, disabled-state styling, click-debounce) usable for both
  visual modes without duplication. The conditional branch is
  one `v-if` in the template + one computed in the script.
- Scoping the dark-panel CSS to `.is-toggle-switch` (not `.is-toggle`)
  means plain LED toggles are guaranteed to look identical to before
  this batch — a deliberate constraint to avoid surprising operators
  who had laid out toggle presets next to non-toggle ones.

---

## 2026-05-28 15:30 — Binary toggle-switch presets (live state via SSE)

First-class support for **binary 0/1 CAT commands as stateful toggle
buttons**. A preset can now be marked `toggle: true` and is rendered
as a single button that **reads the radio's current state** for its
2-letter command, **sends the opposite value** on click, and shows a
green/red LED that mirrors the live state — including changes made on
the radio's front panel. Eligible commands cover the six binary
toggles in the FTX-1 CAT set: `LK`, `MX`, `ST`, `VX`, `BI`, `TS`.
Operator-verified end-to-end (including via the virtual COM port that
originally surfaced the `BI` timeout bug) before this entry was
written.

### Added

- **`components/cat-commands-ftx1.ts` — `isBinaryToggleCommand(code)`
  helper.** Returns `true` only for commands whose single SET
  parameter is a `0`/`1` enum (LK, MX, ST, VX, BI, TS as of the
  current catalogue). Used by the builder's toggle-validation and by
  PresetButton's `isToggle` gate.
- **`components/cat-commands-ftx1.ts` — `TOGGLE_STATE_FIELDS` map.**
  Maps each toggle-eligible CAT code to the field name on the
  `TransceiverState` object exposed by the serial-server's SSE
  stream: `LK → keyLock`, `MX → monitorOn`, `ST → sideToneEnabled`,
  `VX → voxEnabled`, `BI → breakIn`, `TS → txWatch`. PresetButton
  reads from this map at render time so the LED reflects the live
  device state with no per-button polling.
- **`components/PresetButton.vue` — `isToggle` / `currentValue` /
  `ledStatus` computeds.** Drive a 12 px LED next to the button label
  (green / red / grey-unknown / amber-pulse-pending) and the
  `.is-toggle-{state}` class on the root button (used by the border
  tint).
- **`components/PresetButton.vue` — `executeToggle()`** — fire-and-forget
  SET of the inverse value (`'0'` ↔ `'1'`), without the previous
  `await: true` pre-read on virtual COM ports. The new state arrives
  back via SSE; for any future untracked toggles a small `localCache`
  ref serves as fallback so the LED still flips immediately on click.
- **`components/PresetBuilder.vue` — "Toggle switch (on/off button)"
  checkbox** + inline help text + validation:
  - Visible per preset; ticking it tells the runtime to render the
    PresetButton in toggle mode.
  - **`toggleValidation` computed** enforces: exactly one step, code
    must satisfy `isBinaryToggleCommand`. Save is blocked while the
    rule fails; the row tints red and an explanatory message renders
    underneath the checkbox.
- **`serial-server.mjs` — `breakIn` / `txWatch` fields** on the
  `TransceiverState` object, populated from incoming `BI` and `TS`
  frames inside `_parseResponse` (`case 'BI'` / `case 'TS'` set the
  boolean from `params[0] === '1'`). Added to the `_initialSync2`
  `INIT_CMDS` list so both values are queried during the connection
  handshake and surface in the very first SSE frame after connect.
- **`pages/index.vue` — `TransceiverState` extensions.** `breakIn:
  boolean | null` and `txWatch: boolean | null` added to the
  interface and to `defaultState()`. `state` is forwarded to
  `PresetButton` as a prop so the toggle button can resolve its
  current value through `TOGGLE_STATE_FIELDS`.

### Changed

- **Preset JSON schema (additive only).** New optional field
  `toggle?: boolean`. Persisted only when `true`. Existing presets
  keep working unchanged (missing ⇒ classic sequence preset).

### Fixed

- **`BI` (Break-In) toggle preset timing out on a virtual COM port.**
  Root cause was the pre-read + `await: true` pair on a port whose
  firmware echo emulation does not always answer `BI;` polls in time.
  Rewriting `BI` and `TS` as SSE-tracked (mirrors the working `LK`
  pattern) and dropping the `await: true` on the SET removes the
  dependence on per-click polling — the LED now flips instantly even
  when the device responds slowly to `BI;` queries.

### Files changed

- `components/cat-commands-ftx1.ts`
- `components/PresetButton.vue`
- `components/PresetBuilder.vue`
- `pages/index.vue`
- `serial-server.mjs`
- `changelog.md`
- `cat-ftx1-NXC.md` (§ 21 added)

### Operator-facing impact

- Existing presets — sequence-style and JSON-based — keep working
  unchanged. The toggle checkbox is **off by default** for every
  preset; opting in requires editing the preset in the builder.
- The new SSE-tracked fields (`breakIn`, `txWatch`) are now available
  to any future feature that wants to display BI / TS status (for
  example, a top-bar indicator), at no additional polling cost.

### Rationale

- Mirroring the device state via the existing SSE stream avoids
  per-button polling, eliminates the virtual-COM timeout class of
  bugs, and produces a UI that updates correctly when the operator
  flips the switch on the radio itself — matching the existing
  behaviour of the frequency, S-meter, and mode displays.
- Encoding eligibility as a small catalogue-driven helper
  (`isBinaryToggleCommand`) means future binary toggles (if Yaesu
  adds any in a firmware update) need only one line in
  `CAT_COMMANDS` + one entry in `TOGGLE_STATE_FIELDS` to become
  toggle-able in the builder.

---

## 2026-05-28 04:26 — Category-browsing Command Picker + viewport-anchored dropdown

Replaces the browser-native `<datalist>` suggestion popup (truncated names,
no grouping, ~12-character width) with a **custom command picker** that
groups all 90 catalogued CAT commands by **category**, shows the full name
+ truncated description + SRAI flags + manual page in every row, and is
**anchored to the viewport** (not the editor's overflow viewport) so it
shows as many rows as fit on the user's screen — not just the ~3 visible
inside the modal's scroll window. Operator-verified on a 1024×510 laptop
viewport before this entry was written.

### Added

- **`components/PresetBuilder.vue` — Custom command picker.** Replaces
  the native `<datalist id="pb-cat-cmd-list">` dropdown previously used
  by the 2-letter code input. The picker is a fully styled panel with
  the following structure:
  - **Header:** filter input (matches `code` / `name` / `category` /
    `description`), `X / 90` live count of matches, ✕ close button.
  - **Body:** sticky category headers (`frequency`, `vfo`, `mode`,
    `band`, `filter`, `memory`, `power`, `audio`, `ptt`, `tuner`,
    `menu`, `status`, `misc`) with grouped rows. Each row shows: code
    badge (mono, accent), full command name, `read-only` tag when the
    command has no SET form, truncated description, SRAI support
    badge (e.g. `SRAI`, `··RA`), manual page reference (`p.16`).
  - **Footer:** keyboard-shortcut hints (`↑↓ navigate`, `Enter select`,
    `Esc close`) + "Open full reference ?" shortcut that closes the
    picker and opens the help modal.
- **`PresetBuilder.vue` — ▾ "Browse" button** next to every code input.
  Opens the picker and focuses the filter input (so operators who
  don't know the 2-letter code can search by name immediately).
- **`PresetBuilder.vue` — Auto-open on new step.** Clicking
  "+ Add command" creates an empty step, scrolls it into the centre
  of the editor's viewport (`scrollIntoView({ block: 'center' })`),
  and immediately opens the picker focused on its filter input — so
  the operator goes straight from "new row" to "pick a command"
  without an extra click.
- **`PresetBuilder.vue` — Keyboard navigation.** Both the code input
  and the picker's filter input drive the same `onPickerKey` handler:
  - `↑` / `↓` — move highlight (with `scrollIntoView({ block: 'nearest' })`).
  - `Enter` — pick the highlighted command (also auto-fills its default
    parameter via `paramDefaultOf`, matching the existing typed-code
    behaviour).
  - `Esc` — closes only the picker; the second `Esc` falls through to
    the help-modal/editor close chain.
- **`PresetBuilder.vue` — Click-outside dismissal.** Document-level
  `mousedown` listener closes the picker on any click outside the
  picker itself and outside the code input. Registered in `onMounted`
  and removed in `onUnmounted`.
- **`PresetBuilder.vue` — Viewport-anchored positioning.** The picker
  is rendered with `position: fixed` and its `top` / `left` / `width` /
  `max-height` are computed from the step row's `getBoundingClientRect()`
  by a new `recomputePickerPos()` helper. This **escapes the editor's
  `overflow-y: auto` clipping** — the previous `position: absolute`
  approach was constrained to whatever was visible inside `.pb-editor`,
  which on short laptop screens was only ~3 rows.
- **`PresetBuilder.vue` — Auto-flip placement.** When there is less
  than 220 px of viewport room **below** the anchor row and more space
  above, the picker flips to **open upward** (`pb-picker--above`
  modifier reverses the box-shadow direction so it still appears to
  come out of the row). On a 510 px-tall viewport with the anchor in
  the lower half of the modal, this turns "3 visible rows" into 5–6.
- **`PresetBuilder.vue` — Live tracking.** `recomputePickerPos` is
  re-run on `window resize` and on **every scroll event in the
  document** (capture phase, so any nested scroll container — the
  editor body, the presets list — keeps the picker glued to its
  anchor as the operator scrolls).

### Changed

- **`PresetBuilder.vue` — Code input.** Now opens the picker on
  `@focus` / `@click` (without stealing focus from the input, so direct
  2-letter typing still works), mirrors typed letters into the picker's
  filter, and forwards arrow keys / Enter / Esc to `onPickerKey`. The
  placeholder hint changed from `"2-letter code"` to `"Click to browse"`.
- **`PresetBuilder.vue` — `.pb-picker` CSS.** Switched from
  `position: absolute` (anchored to `.pb-step-row`, clipped by
  `.pb-editor`'s overflow) to `position: fixed` (viewport-anchored,
  escapes all ancestor overflow). `z-index` raised to `1200` to clear
  the global `.modal-overlay` (`z-index: 1100`) defined in
  `pages/index.vue`.
- **`pages/index.vue` — Modal cap.** `.modal-container` `max-height`
  raised from `90vh` to `95vh` for a small extra slice of viewport on
  short laptop screens.
- **`PresetBuilder.vue` — Removed.** The old `<datalist id="pb-cat-cmd-list">`
  element and its `list="..."` reference on the code input. The new
  picker is the single browsing UI.

### Files touched

- `components/PresetBuilder.vue` — all picker UI, state, helpers, CSS.
- `pages/index.vue` — single CSS rule (`.modal-container max-height`).

### Verification (operator confirmed)

1. `npm run dev`, open the Preset Editor on a 1024×510 viewport.
2. Click an existing step's 2-letter code input — picker opens
   anchored below, showing the full row width (~660 px) with
   `frequency` / `vfo` / `mode` / `band` … categories visible.
3. Type `F` in the code input — picker filter mirrors live and
   narrows to the F-family commands.
4. Click "+ Add command" — new step scrolls to centre of the editor;
   picker auto-opens with the filter input focused.
5. With the picker open, scroll the editor with the mouse wheel —
   the picker now stays glued to the step row (was: floated; before
   the fix: clipped to ~3 rows).
6. Open picker on a step near the bottom of a short viewport —
   picker flips to **open upward** instead of being cut off.
7. `↑` / `↓` / `Enter` / `Esc` and click-outside all behave as
   specified.

### Rationale

- The native `<datalist>` is rendered by the browser and **cannot be
  styled** beyond what the OS exposes. Its width follows the input
  width (56 px here), it truncates option text at ~12 characters, and
  it offers no grouping. With 90 commands it became unusable.
- Using `position: fixed` was preferred over a Vue `<Teleport to="body">`
  because none of the picker's ancestors establish a containing block
  for fixed positioning (`.modal-overlay` and `.modal-container` use
  neither `transform`, `filter`, nor `perspective`), so fixed
  positioning is enough to escape the editor's overflow without
  restructuring the DOM tree.

---

## 2026-05-28 02:58 — Smart Preset Builder + CAT command catalogue from manual

Parses the entire **`docs/CAT-FTX1.pdf`** Control-Command reference (pages
5–27) into a single authoritative TypeScript catalogue, wires it into the
**Preset Builder** dropdown, adds a **smart validator** that warns on
out-of-range / conditional parameters and **blocks Save on hard errors**,
and exposes a **`?` help modal** with the manual's page-4 usage primer
plus a sortable / filterable quick-reference table covering all 90
catalogued commands. Operator-verified end-to-end before this entry was
written.

### Added

- **`components/cat-commands-ftx1.ts`** (new, ~2030 lines).
  Authoritative FTX-1 CAT catalogue with **90 commands** parsed from the
  Yaesu *CAT Operation Reference Manual* (`docs/CAT-FTX1.pdf`). Exports:
  - Types: `CommandCategory`, `CommandSupports`, `ParamType`,
    `ParamDef`, `CommandDef`, `ValidationLevel`, `ValidationIssue`,
    `ValidationResult`, `StepsValidationSummary`.
  - Data: `CAT_COMMANDS: ReadonlyArray<CommandDef>` — each entry carries
    `supports.{set,read,answer,ai}` (matching page 5's table), a typed
    `params[]` (each with `digits`, `type`, optional `enum` /
    `min`/`max` / `fixed` / `hint` / `conditional`), `paramTotalDigits`
    (number or `{min,max}` for variable-length commands), an optional
    `paramDefault`, a multi-line `description`, `manualPage`
    cross-reference, and curated `examples[]`.
  - Helpers: `findCommand(code)`, `setFormShape(d)` (auto-generates
    e.g. `FA<P1×9>;`, `IS<P1×1><P2×1><P3×1><P4×4>;`), and the
    legacy-shape shims `legacyParamType` / `legacyParamHint` /
    `legacyParamLabel` / `legacyParamDigits` used by the existing
    `PresetBuilder.vue` template bindings without rewriting them.
  - Validator: `validateStep(code, param)` and `summariseSteps(steps)`.
- **`PresetBuilder.vue` — per-step validation badge** (new column on
  every step row). ✓ green / ⚠ amber / ✗ red icon with hover-tooltip
  showing every issue raised by the validator. Erroneous rows get a
  red border + faint red tint; warning rows get an amber border.
- **`PresetBuilder.vue` — validation summary bar** above the Save row.
  Reads e.g. *"0 errors, 1 warning — warnings won't block save"* or
  *"3 errors, 0 warnings — fix errors to enable Save."* Includes a
  shortcut button that opens the help modal.
- **`PresetBuilder.vue` — raw-mode per-line issues list**. When the
  operator switches to Raw mode, each non-empty line gets its own
  ✓/⚠/✗ pill with the first issue rendered inline. Filter and badges
  match the friendly-mode editor so the operator sees the same
  diagnostics in both modes.
- **`PresetBuilder.vue` — `?` button** in the modal header. Opens a
  full-page (overlay) help dialog containing:
  - Manual **page 4 — Control Command** prose, reformatted to HTML:
    set / read / answer model, the FA worked example, the four
    "common mistakes" rendered as a table, the ASCII-control /
    terminator caveat, and the terminator note.
  - **Quick-reference table** of all 90 catalogued commands. Sortable
    by `Code`, `Name`, `Category`, `Page` (asc↔desc on second click).
    Free-text filter (matches code, name, category, description).
    Columns: code, name, category, `SRAI` support badges
    (e.g. `SRAI`, `··RA`), auto-generated `Shape`, manual page number.
    Sticky header while scrolling.
- **`PresetBuilder.vue` — Escape key** now closes the help modal
  first (if open); the second Escape closes the editor — existing
  behaviour preserved.

### Changed

- **`PresetBuilder.vue` — imports.** Replaced the in-file
  `interface CommandDef` and the 14-entry `COMMANDS` array with
  `import { CAT_COMMANDS, findCommand, validateStep, … }` from the new
  catalogue module. Local back-compat helpers `paramTypeOf` /
  `paramHintOf` / `paramLabelOf` / `paramDefaultOf` keep the existing
  template bindings working without further changes.
- **`PresetBuilder.vue` — `<datalist>`** in the Command code input
  now lists **all 90** catalogued commands instead of the previous
  14. Each suggestion still renders as `<code> <name> (<category>)`.
- **`PresetBuilder.vue` — `canSave` computed.** Adds
  `!hasValidationErrors` so the Save button is disabled whenever any
  step has a hard validation error. Warnings do not block save (per
  operator policy `block-errors`).
- **`PresetBuilder.vue` — step row grid.** Adds a 28 px column between
  the live "Sent to radio" preview and the up/down/delete actions for
  the validation badge. Responsive (≤640 px) layout also gains the
  badge via the new `validate` grid-area.
- **`PresetBuilder.vue` — `.pb-container`** now has
  `position: relative` so the help-modal overlay (`position: absolute;
  inset: 0; z-index: 20`) anchors to the editor and remains clipped to
  its rounded border.
- **`PresetBuilder.vue` — `onKeydown`** prioritises closing the help
  modal over the editor when both are open.

### Validation rules — exact behaviour

| Rule | Level | Behaviour |
|---|---|---|
| Unknown 2-letter code (off catalogue) | ⚠ warn | Saved as a custom command. |
| Wrong total parameter length | ✗ error | Save blocked. |
| Non-digit char where digits expected | ✗ error | Save blocked. |
| Enum value not in allowed set | ✗ error | Save blocked. |
| ASCII control codes (00–1F) or `;` in parameter | ✗ error | Save blocked. |
| Numeric value documented out of range (e.g. FA > 470 MHz) | ⚠ warn | Save allowed. |
| Conditional parameter — meaning depends on another P | ⚠ warn | Save allowed. |
| Use of read-only command (ID, IF, MR, OI, RI, RM, SM, VE) | ⚠ warn | Save allowed. |
| Empty / non-A–Z code | ✗ error | Save blocked. |
| Parameter supplied for a no-parameter command | ✗ error | Save blocked. |

### Rationale

- **PDF parsed once, into typed data** — the catalogue lives in
  source-controlled TypeScript, not the database. This keeps the JSON
  preset workflow (operator's preferred model, see §16) untouched and
  avoids re-running PDF extraction at runtime. The PDF stays in
  `docs/CAT-FTX1.pdf` purely as the authoritative reference.
- **Conditional layouts modelled as `type: 'any'` + `conditional` note**
  — commands whose later parameters change meaning depending on an
  earlier P (e.g. `CF P3`, `BP P3`, `CO P3`, `ML P2`, `PA P2`, `PC P2`,
  `SS P3..P7`) cannot be validated structurally without effectively
  re-implementing the manual's parser. The validator instead enforces
  total length + character class, then emits a non-blocking warning
  with the conditional note so the operator sees exactly what the
  variable suffix is supposed to be. This matches the operator's
  `block-errors` policy — hard structural errors block, ambiguous
  cases warn.
- **Help modal scope = page 4 only + quick-reference table** — per
  operator choice on the scope questionnaire. The EX-menu picker
  (manual Table 3, ~300 items) is deliberately deferred to a future
  batch.

### Verification (operator confirmed)

1. `npm run dev`, open Preset Manager.
2. Existing presets (e.g. APRS ON/OFF) load with ✓ badges on every
   step.
3. Editing `FB144800000` → `FB1448000` immediately shows ✗ on that
   row, the summary bar reads "1 error, 0 warnings", and Save is
   disabled.
4. Editing `FA014250000` → `FA999999999` shows ⚠ ("value above
   documented maximum 470000000"), Save remains enabled.
5. Entering an unknown code `ZZ0` shows ⚠ ("not in the FTX-1 manual
   catalogue. Treating as a custom command."), Save remains enabled.
6. Typing the manual's canonical mistake `IS001000` shows ✗ length
   error matching page 4's example mistake list.
7. `?` button opens the help overlay; page-4 content renders, the
   quick-reference table lists 90 rows, sort and filter both work,
   Escape closes the help first (editor stays open) and a second
   Escape closes the editor.
8. Switching to Raw mode shows the per-line issues list with the
   same colours as the friendly-mode badges.

### Files changed in this batch

| Path | Change |
|---|---|
| `components/cat-commands-ftx1.ts` | **NEW** — 90-command catalogue + smart validator + help-table helpers. |
| `components/PresetBuilder.vue` | Replaced in-file `COMMANDS` array, added validation badges + summary + raw-mode issues list + `?` help modal + step-row grid update + `.pb-container { position: relative }`. |
| `changelog.md` | This entry. |
| `cat-ftx1-NXC.md` | New §19 documents the smart-preset-builder batch; header `Status:` line refreshed. |

### Files to copy to the secondary workstation

Cumulative list since the last sync — replace these files verbatim:

- `components/cat-commands-ftx1.ts` *(new file)*
- `components/PresetBuilder.vue` *(replaced)*
- `changelog.md` *(extended)*
- `cat-ftx1-NXC.md` *(extended)*

No DB changes, no new npm dependencies, no server-side changes — a
plain file copy is sufficient. After copying, restart `npm run dev` so
Vite picks up the new module.

### Out of scope (still deferred)

- **Macro builder** does not yet consume the catalogue (operator scope
  choice — presets only this batch).
- **EX-menu cascading picker** for the ~300 menu items in manual
  Table 3 — deferred. The `EX` command remains in the catalogue with a
  single free-form payload field, so existing EX-based presets keep
  working unchanged.
- **`better-sqlite3` ABI mismatch** — unchanged from the previous
  session; still resolved at the user's end with `npm rebuild
  better-sqlite3` if it surfaces. Not exercised by this batch (no DB
  reads/writes added).

---

## 2026-05-27 22:35 — Header version label `V2.0-NX` (single-source via runtimeConfig)

Cosmetic + minor architectural change to identify this fork distinctly
from the upstream `V1.0` lineage. Operator-verified end-to-end before
this entry was written.

### Added

- **`runtimeConfig.public.appVersion`** in `nuxt.config.ts`
  (`'V2.0-NX'`). Single source of truth for the header version label.
  Bumping the fork in one place propagates through the template
  binding. Overridable at launch time via
  `NUXT_PUBLIC_APP_VERSION="…"` without recompiling.
- **`.brand-version` CSS class** in `pages/index.vue` — accent-colored
  monospace pill with 1 px accent border, 4 px radius, 2/6 px padding,
  `opacity: 0.85`. Inherits the operator's Appearance-drawer theme
  (`--accent`, `--font-mono`) automatically.
- **`<span class="brand-version">{{ appVersion }}</span>`** in the
  `.header-brand` row, placed between `CAT Controller` and the
  optional call-sign chip. The brand row's `display: flex;
  align-items: baseline; gap: 8px` keeps the pill on the same baseline
  as its neighbours with no layout reflow.

### Changed

- **`pages/index.vue` — script setup** now declares
  `const appVersion = useRuntimeConfig().public.appVersion as string`
  just after the component imports. `useRuntimeConfig` is auto-imported
  by Nuxt 3, so no explicit import line is needed (matches how
  `$fetch` is used elsewhere in the file).
- **`pages/index.vue` — `.brand-sub`** color promoted from
  `var(--text-muted)` to `var(--text)` so `CAT Controller` reads at
  primary text contrast.
- **`pages/index.vue` — `.brand-version`** font size lifted from
  `11px` to `12px` so the pill matches the `CAT Controller` size band
  and shares a clean baseline alignment.

### Decisions

- **`package.json` `"version"` field intentionally left at `1.0.1`**.
  That field drives the `electron-builder` installer filename and is
  semver-bound, so it is decoupled from the displayed fork label. We
  can revisit and bump it (to e.g. `2.0.0-nx.1`) on your signal once
  the fork is ready for a packaged release.
- **`README.md` / `SECURITY-AUDIT.md`** still reference
  `cat-ftx1 v1.0.1`. Not touched in this entry; documentation sweep
  to align those headers can be its own batch on your signal.

### Verification (operator confirmed)

- `npm run dev`, open the renderer:
  - Header reads `FTX-1  CAT CONTROLLER  V2.0-NX  PA0NOX`.
  - `CAT CONTROLLER` is no longer muted; sits at primary text
    contrast.
  - `V2.0-NX` rendered as a small mono-font pill with accent border.
  - Adjusting `--accent` in the Appearance drawer recolors both the
    `FTX-1` logo and the version pill in lock-step.
  - No vertical-baseline shift in the header row.

### Files to copy to the secondary workstation (delta since 22:16)

| # | Path (relative to project root) | Why |
|---|---|---|
| 11 | `nuxt.config.ts` | `runtimeConfig.public.appVersion`. |
| 12 | `pages\index.vue` | Template binding, script setup line, CSS for `.brand-sub` and `.brand-version`. |
| 13 | `cat-ftx1-NXC.md` | New § 18 (cumulative session log). |

`changelog.md` from earlier today already covers this entry too —
re-copying it picks up both the 22:16 and 22:35 sections.

### Operator action on the secondary workstation

None beyond copying the files above. No DB migration, no
`npm install`, no rebuild required — the change is template + CSS +
one Nuxt config line.

---

## 2026-05-27 22:16 — Settings PUT fix + appearance-settings DB persistence

Two operator-reported issues, both addressed in one coordinated patch.

### Fixed

- **`PUT /api/settings` returned 500 "Database error"** whenever the
  operator edited the Call Sign field (and would have returned the same
  for any colour / radius / font change once those edits started writing
  to the API). Root cause: `server/api/settings.put.ts:57` built the
  dynamic UPDATE with `updated_at = datetime("now")` — double-quoted
  `"now"`, which SQLite interprets as an identifier, not a string. The
  engine raised `no such column: now`, caught by the catch-all and
  reported as 500. **Fixed** by using the SQL string-literal form
  `datetime('now')` (single quotes).
- **Same `datetime("now")` quoting bug in
  `server/api/presets/[id].put.ts:46`** — also fixed for hygiene, even
  though the JSON-driven workflow does not currently hit that endpoint
  (the DB-backed preset code remains dormant).
- **`server/api/settings.put.ts` UPDATE builder rewritten** to use
  parallel `setClauses[]` / `values[]` arrays instead of `params: {}` +
  `Object.values(params)`. Removes the implicit dependency on JS
  object-key insertion order and aligns SQL placeholders with bound
  values regardless of which fields the request includes.
- **Vue runtime prop-type warning** on the `<StatusBadge>` for `ATT`
  (and three latent twins): the page was passing `state.rfAttenuator`
  (and `state.split`, `state.mox`, `state.radioInfo?.tuning`) straight
  through to the child component, which declares `active?: boolean`.
  The radio-state update path writes the raw CAT `0`/`1` numeric flag
  into those fields, so the runtime check complained `Expected Boolean,
  got Number with value 0`. **Fixed** by coercing at the call site with
  `!!state.…`. `StatusBadge.vue`, the `TransceiverState` type, and the
  serial-bridge ingestion logic are all unchanged.

### Added

- **`settings.theme_overrides TEXT` column** — JSON blob (CSS variable
  name → value) stored alongside the existing call-sign and typed
  colour columns. NULL = "no customization, use the page's built-in
  :root defaults".
- **`sql/migrate-add-theme-overrides.sql`** — one-time
  `ALTER TABLE settings ADD COLUMN theme_overrides TEXT;` script for
  DBs created before today (SQLite has no `ADD COLUMN IF NOT EXISTS`;
  re-running the script on a migrated DB reports
  "duplicate column name" which is the expected outcome).

### Changed

- **`sql/schema.sql`** — `settings` `CREATE TABLE` now includes
  `theme_overrides TEXT`. Affects fresh DBs only (idempotent
  `IF NOT EXISTS`); existing DBs need the migration script above.
- **`server/api/settings.put.ts`** — full rewrite: accepts
  `theme_overrides: object | null` in the body, validates that it's
  either `null` or a `Record<string, string>`, serialises to JSON
  before storing; returns the parsed object in the response. Full
  validation also added for `color_*` and `radius_px` (`null` values
  are now accepted and treated as "no change").
- **`server/api/settings.get.ts`** — SELECTs `theme_overrides` and
  returns it as a parsed object (or `null`) — never as a raw JSON
  string.
- **`pages/index.vue` — `persistTheme()`** now writes both to
  `localStorage` (instant offline shadow so the theme applies on cold
  load before the API responds) **and** to `/api/settings` with a
  400 ms debounce around the PUT so dragging a colour slider does not
  spam requests.
- **`pages/index.vue` — `loadUserSettings()`** now also hydrates
  `themeOverrides` from the API response, re-mirrors to
  `localStorage`, and calls `applyTheme()`. The DB copy is
  authoritative — it overrides whatever was in `localStorage` from a
  previous session. `null` clears the local mirror so the page falls
  back to its built-in `:root` defaults.

### Database migration applied

The local DB at `data/cat-ftx1.db` was migrated in-place by running
`sql/migrate-add-theme-overrides.sql`. The `settings` table columns
are now: `id, rig_id, call_sign, color_primary, color_accent,
color_bg, font_mono, radius_px, created_at, updated_at,
theme_overrides`. No data was lost; the existing row (id=1,
rig_id='ftx1', call_sign='PA0NOX', …) carries forward with
`theme_overrides = NULL` until the operator first changes a theme
variable.

### Documentation

- **`cat-ftx1-NXC.md`** updated — new §§ 15, 16, 17 (today's work):
  cross-workstation sync, PresetBuilder rewrite + preset workflow
  consolidation, settings persistence hardening. Top-of-document
  status line updated to reflect the JSON-driven preset workflow and
  the appearance-settings DB persistence.

### Files to copy to the secondary workstation (delta since the previous changelog entry)

In addition to the four files already listed in the previous changelog
entry (`components\PresetBuilder.vue`, `pages\index.vue`,
`cat-presets.json`, `changelog.md`), the following must also be
shipped today:

| # | Path (relative to project root) | Why |
|---|---|---|
| 5 | `sql\schema.sql` | Fresh-DB recipe now contains the `theme_overrides` column. |
| 6 | `sql\migrate-add-theme-overrides.sql` | **NEW** — run once on the other PC's DB (see snippet below). |
| 7 | `server\api\settings.put.ts` | Fixes the 500 and adds theme-overrides handling. |
| 8 | `server\api\settings.get.ts` | Returns parsed `theme_overrides`. |
| 9 | `server\api\presets\[id].put.ts` | Same `datetime('now')` quoting fix. |
| 10 | `cat-ftx1-NXC.md` | Today's new sections 15–17. |

`pages\index.vue` and `changelog.md` from the previous list already
cover the further edits made today (theme persistence wiring, the
`!!state.*` coercions, this entry).

### Running the DB migration on the other workstation

Once before launching the app on the secondary PC:

```powershell
$db  = 'D:\<path>\cat-ftx1\data\cat-ftx1.db'                            # adjust
$sql = 'D:\<path>\cat-ftx1\sql\migrate-add-theme-overrides.sql'         # adjust
python -c "import sqlite3, pathlib; con=sqlite3.connect(r'$db'); con.executescript(pathlib.Path(r'$sql').read_text(encoding='utf-8')); con.commit(); con.close(); print('migration applied')"
```

If the script has already been run, the second attempt prints
`duplicate column name: theme_overrides` — confirming the column is
in place. Either way, no data loss.

### Operator action required

1. Re-launch the app — settings drawer should now save the Call Sign
   (no more 500).
2. Adjust any colour, font, or radius in the Appearance drawer.
3. Reload the page → theme still in effect.
4. Clear browser cache / site data → theme **still** in effect (this
   was the originally reported regression).
5. (On the other PC) run the migration snippet above before launching.

---

## 2026-05-27 19:33 — Preset workflow consolidation (JSON-driven)

This entry covers the full sync + refactor session done on 2026-05-27 to
bring the workstation at `D:\cat-ftx1-main\cat-ftx1-main` in line with the
sources from the secondary workstation (copied into
`D:\cat-ftx1-main\nxc\cat-ftx1`) **and** to finalize the decision to drop
the DB-backed preset workflow in favour of the existing
`cat-presets.json` file as the single source of truth for presets.

### Added

- **`components/PresetBuilder.vue` — full rewrite (NEW clean SFC, ~1285 lines)**
  - Single valid `<template>` / `<script setup lang="ts">` / `<style scoped>`
    structure (the previous file was an interrupted merge with two
    competing template fragments — see Fixed below).
  - Two-pane UI: preset list on the left, structured editor on the right.
  - **Structured CAT-command step editor** — each command is a row:
    `[ 2-letter code (with datalist autocomplete) ] [ parameter (with
    label, hint, default) ] [ live preview "FB144800000;" ] [ ↑ ↓ ✕ ]`.
  - **Built-in catalogue** of 14 common FTX-1 commands (codes, parameter
    shape, hints, defaults) derived from the Control Command manual
    excerpt and the existing `aprs-on` / `aprs-off` presets:
    `FA`, `FB` (9-digit freq), `VS`, `BS`, `MD`, `FR`, `FT`, `EX`, `IS`,
    `PC`, `AG`, `AI`, `TX`, `ID`. Any 2-letter code outside the
    catalogue is still accepted as a "Custom command" with free-form
    parameter.
  - **Raw-mode toggle** — textarea (one command per line) for power
    users / commands not in the catalogue; round-trips both ways with
    the structured step editor.
  - Optimistic save with rollback on PUT failure; ESC closes; ID
    validation (lowercase letters/digits/hyphens, uniqueness check);
    confirmation prompts on delete and reset.
  - Reads/writes **only** `cat-presets.json` via `GET/PUT /api/json-presets`.
  - Accepts an `open-preset-id: string | number | null` prop so the
    parent can pre-select a preset.

- **`pages/index.vue` — Presets section header now has a manager button**
  - The "◈ Open Preset Manager" button lives at the right of the
    Presets section header (aligned with `margin-left: auto`), next to
    the "Edit `cat-presets.json` to customize" hint.
  - Clicking it opens the rewritten **PresetBuilder** directly.
  - The section is now **always visible** (was previously hidden when
    `presets.length === 0`, which made it impossible to add the first
    preset).
  - Friendly empty-state panel shown when no presets exist
    (`.presets-empty-state` — muted text, dashed border).

### Changed

- **`pages/index.vue` — `loadPresets()` now reads `/api/json-presets`**
  instead of `/api/presets`. This makes the main preset button row
  mirror the contents of `cat-presets.json` exactly (what the
  PresetBuilder edits). Previously the DB-backed endpoint was preferred
  and JSON-file presets were hidden as soon as **any** preset existed
  in the DB.
- **`pages/index.vue` — `onPresetSaved()`** now simply calls
  `loadPresets()` to refresh the main preset row; the builder is left
  open after a save so the operator can keep editing other presets in
  the same session.
- **`pages/index.vue`** — `builderTargetPresetId` widened from
  `ref<number | null>` to `ref<string | null>` (JSON preset IDs are
  strings, e.g. `"aprs-on"`).

### Fixed

- **Application startup error — `error loading dynamically imported
  module: …/_nuxt/components/PresetBuilder.vue`** — root cause was an
  interrupted previous editing session that left
  `components/PresetBuilder.vue` with two `</template>` closing tags
  (one clean template plus an orphan template fragment from a
  competing DB-backed design), referencing dozens of identifiers that
  the `<script setup>` block never defined
  (`PRESET_CATEGORIES`, `addStep`, `editing.steps`, `showNewCommand`,
  `step.preview`, `step.expectsResponse`, …). The Vue SFC compiler
  rejected the file, so Nuxt could not build the chunk. Fixed by full
  rewrite (see Added).
- **`/api/json-presets`** endpoints (already present from the sync)
  verified to back the new PresetBuilder GET/PUT calls correctly.

### Removed

- **`pages/index.vue` — top-toolbar `◈` button.** Moved into the
  Presets section header (see Added).
- **`pages/index.vue` — DB-backed "Preset Manager" modal.** The modal
  that listed `dbPresets` with the `steps` / `ttt` rows (visible in
  the previous screenshot) is removed in full. The workflow is now
  JSON-only via the rewritten PresetBuilder.
- **`pages/index.vue` — dead refs / functions** from the removed
  modal: `dbPresets`, `showPresetManager`, `openPresetManager`,
  `closePresetManager`, `loadDbPresets`, `editPreset` (DB version),
  `deletePreset` (DB version), `createNewPreset`. `loadDbPresets()`
  also dropped from the `onMounted` `Promise.all`.
- **`pages/index.vue` — dead CSS rules** orphaned by the modal removal:
  `.presets-list`, `.preset-item`, `.preset-info`, `.preset-name`,
  `.preset-step-count`, `.preset-desc`, `.preset-actions`,
  `.presets-empty` (~55 lines).

### Synced from the secondary workstation (no edits, included for completeness)

Earlier in the session the following files were copied **as-is** from
`D:\cat-ftx1-main\nxc\cat-ftx1` into the working tree. They are already
present on the other workstation and do **not** need to be copied back.

- `components/PresetBuilder.vue` (later rewritten — see Fixed).
- `pages/index.vue` (later patched — see Added/Changed/Removed).
- `server/api/json-presets.get.ts` (new — reads `cat-presets.json`).
- `server/api/json-presets.put.ts` (new — writes `cat-presets.json`).
- `server/api/presets.get.ts` (modified — now DB-first with JSON
  fallback; not used by the main UI any more but kept).
- `server/api/presets.post.ts`, `server/api/presets/[id].get.ts`,
  `server/api/presets/[id].put.ts`,
  `server/api/presets/[id].delete.ts`,
  `server/api/presets/[id]/run.post.ts` (DB-backed CRUD — kept as
  dormant code, no UI references).
- `server/api/settings.get.ts`, `server/api/settings.put.ts` (new — rig
  appearance/settings stored in DB).
- `sql/schema.sql` (extended with `settings`, `presets`,
  `preset_steps` tables, all `CREATE TABLE IF NOT EXISTS` — idempotent;
  `server/plugins/db-init.ts` re-applies it at every startup).
- `data/cat-ftx1.db` (overwritten with the source DB; previous DB
  preserved as `data/cat-ftx1.db.bak`).

### Known / pending items

- **`better-sqlite3` ABI mismatch** — the prebuilt native binary in
  `node_modules/better-sqlite3` was compiled for Node 26+
  (`NODE_MODULE_VERSION 141`) but local Node is `v22.22.0`
  (`NODE_MODULE_VERSION 127`). Run
  `npm rebuild better-sqlite3` (or a fresh `npm install`) in
  `D:\cat-ftx1-main\cat-ftx1-main` before launching, otherwise the DB
  plugin will fail at boot. The new JSON preset workflow does not use
  the DB so it remains functional even if this step is skipped, but
  console will spam DB errors.
- **Dormant server-side DB preset code** — `server/api/presets*.ts` and
  the `presets` / `preset_steps` tables in `sql/schema.sql` are no
  longer used by the UI. Left in place; can be removed in a dedicated
  cleanup pass if desired.

### Documentation

- `changelog.md` created (this file).

---

## Files to copy to the secondary workstation

After today's session the working copy at
`D:\cat-ftx1-main\cat-ftx1-main` has diverged from the original sources
at `D:\cat-ftx1-main\nxc\cat-ftx1` in exactly **three** files. Copy
these to the matching paths under the secondary workstation's
`cat-ftx1` project root to bring it into sync.

| # | Source (this workstation) | Target (other workstation, same relative path) | Notes |
|---|---|---|---|
| 1 | `D:\cat-ftx1-main\cat-ftx1-main\components\PresetBuilder.vue` | `<project>\components\PresetBuilder.vue` | Full rewrite — overwrite the broken/in-progress copy on the other PC. |
| 2 | `D:\cat-ftx1-main\cat-ftx1-main\pages\index.vue` | `<project>\pages\index.vue` | Multiple coordinated patches (loadPresets endpoint, header button, empty state, dead-code removal). |
| 3 | `D:\cat-ftx1-main\cat-ftx1-main\cat-presets.json` | `<project>\cat-presets.json` | Reflects any presets edited via the new PresetBuilder during today's testing. |
| 4 | `D:\cat-ftx1-main\cat-ftx1-main\changelog.md` | `<project>\changelog.md` | This file (newly created). |

**Files that do _not_ need to be copied** — they were synced **from** the
secondary workstation earlier today and are still byte-identical
between the two trees:

- `sql/schema.sql`
- `data/cat-ftx1.db`
- everything under `server/api/`
- all other `components/*.vue`

### Quick PowerShell snippet (run on this workstation)

```powershell
$src = 'D:\cat-ftx1-main\cat-ftx1-main'
$dst = '<full path to project root on the other PC>'  # adjust
$files = @(
    'components\PresetBuilder.vue',
    'pages\index.vue',
    'cat-presets.json',
    'changelog.md'
)
foreach ($f in $files) {
    Copy-Item -LiteralPath (Join-Path $src $f) `
              -Destination (Join-Path $dst $f) -Force
}
```

Adjust the `$dst` path to point at the other workstation's
`cat-ftx1` project root (e.g. a network share or the place where you
keep the sibling working copy).

### Post-copy checklist on the secondary workstation

1. Make sure `node_modules/better-sqlite3` is built against that
   machine's Node version (`npm rebuild better-sqlite3` if needed).
2. Start the app and open the Presets section — click the `◈` button
   in the section header; the rewritten Preset Editor should appear
   with the JSON presets listed on the left.
3. No SQL / migration step is needed: `cat-presets.json` is the only
   source of truth for the preset buttons; the DB tables added in
   `sql/schema.sql` are already in place from the earlier sync and are
   not touched by the new UI.
