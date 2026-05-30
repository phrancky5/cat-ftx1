# Hamlib Integration — Research & Recommendation

- Project: `cat-ftx1` (FTX-1 fork, `V2.1-NX`)
- Date authored: 2026-05-28
- Source repo investigated: https://github.com/Hamlib/Hamlib
- Status: **Recommendation accepted by operator on 2026-05-28** — *don't* integrate Hamlib as our serial backend; *do* expose a `rigctld`-compatible TCP relay. Implementation shipped same day and is documented in detail as `cat-ftx1-NXC.md` **§ 23** (relay + UI panel + allowlist gating). This document is the *design rationale*; § 23 is the *implementation reference*.

This document records the research that led to that decision so future maintainers can re-evaluate the question without re-doing the legwork.

---

## 1. Where Hamlib actually is on the FTX-1 (as of 2026-05)

Hamlib **does** have an FTX-1 backend, but the situation is more nuanced than a simple "yes":

| Fact | Source / detail |
|---|---|
| FTX-1 backend merged | February 2026 in Hamlib 4.7 (PR [#1826](https://github.com/Hamlib/Hamlib/pull/1826), closed-as-completed issue [#1600](https://github.com/Hamlib/Hamlib/issues/1600)) |
| Model number | `1051` (`RIG_MODEL_FTX1`) |
| Stability status | **Alpha** (per Hamlib's own model list: `20241118.1   Alpha`) |
| Known FTX-1-specific quirk (already merged) | Split-mode forces sub VFO into TX — broke satellite Doppler workflows. Required a *virtual split* abstraction implemented at the Hamlib layer (issue [#1972](https://github.com/Hamlib/Hamlib/issues/1972)) |
| Used in the wild with | WSJT-X-Improved via `rigctld-wsjtx -m 1051 -p /dev/ttyUSB0`. Basic CAT works (frequency, mode, PTT). |
| Source manual driving Hamlib's backend | Same Yaesu `FTX-1_CAT_OM_ENG_2507-A.pdf` we parsed for our 90-command catalogue (`docs/CAT-FTX1.pdf`) |

The Alpha label is a meaningful signal — Hamlib's maintainers don't quietly leave radios at Alpha for long once known bugs settle.

---

## 2. What an integration would actually look like

Three plausible architectures were considered:

| # | Architecture | What changes | What stays |
|---|---|---|---|
| **A** | Replace `serial-server.mjs` with a Hamlib `rigctld` child process | Our Node serial-server becomes a `rigctld`-client (TCP). The Electron installer bundles `rigctld.exe` + DLLs. CAT commands routed through Hamlib's model 1051. | Frontend (Vue), preset/macro system, SSE-to-browser plumbing. |
| **B** | Optional Hamlib backend | Add a second backend in `server/utils/` that talks to `rigctld` over TCP. Operator picks at connect time. | Everything else; native `serial-server.mjs` stays. |
| **C** | Don't integrate; *expose* `rigctld`-compatible TCP from our own server | `serial-server.mjs` gains a small TCP listener that speaks Hamlib's `rigctld` text protocol on (default) port 4532 and translates a subset of commands to our internal vocabulary. | Everything else. No Hamlib in our codebase. |

Architecture **C** was the interesting one because it captures the highest-value *external* benefit of Hamlib (interop with the ham-software ecosystem) without taking on any of the integration costs.

---

## 3. Pro / con for full integration (architectures A or B)

### Pros

- Battle-tested CAT implementation maintained by people who do this for a living.
- The satellite-split quirk is a perfect example: Hamlib has solved a non-obvious FTX-1 behaviour we have *not* hit yet, but would if anyone tried our app with GPredict.
- Hamlib's command set is the de-facto lingua franca of the ham-radio software ecosystem (WSJT-X, Fldigi, JS8Call, Gridtracker, N1MM, Gpredict, CQRLOG, Logger32 …).
- If the operator ever buys a second radio (Icom, Kenwood, Elecraft), Hamlib already supports it — no protocol work needed on our side.

### Cons

- **Alpha-quality backend on a brand-new radio.** Any bug we hit in Hamlib's FTX-1 driver is months of upstream turnaround. Right now we own the entire stack and can fix bugs in minutes.
- **C library packaging into Electron.** Currently the only native dependency is `better-sqlite3`. Adding Hamlib means bundling `libhamlib-X.dll`, `librig.dll`, and friends per-platform; signing the binaries on Windows / macOS; managing the install path. Real engineering work.
- **Loss of FTX-1 specifics that aren't standard Hamlib API.** Hamlib's public API exposes the *common* radio model (freq, mode, PTT, S-meter, AGC, AF, RF, …). Our app already does:
  - Live **bandscope / spectrum** stream (`BS`, `SH`, etc.) — Hamlib has only patchy spectrum support across backends.
  - **BI / TS / ST / MX / VX** binary toggles tracked via SSE — these go through `rig_set_func`/`rig_get_func` with vendor-specific function IDs in Hamlib, which is messy in its API and not portable across radios.
  - **EX menu** items (~300 of them on the FTX-1) — Hamlib uses `rig_get_ext_level` / `rig_set_ext_level` for these, but coverage is sparse.
  - Our **90-command catalogue + validator** in `components/cat-commands-ftx1.ts` (§§ 19, 20). This is FTX-1-specific operator knowledge. Hamlib has equivalent knowledge buried in C source, but it doesn't substitute for our UI-layer help / validation, which is *better* than what Hamlib exposes at the API surface because it is FTX-1-specific.
- **Dependency on Hamlib's release cadence.** Hamlib doesn't ship monthly. If a firmware revision changes an FTX-1 response format, we'd be waiting for Hamlib 4.8 to catch up, then a Hamlib release, then a packaging cycle on our side.
- **`serial-server.mjs` already works** end-to-end on real hardware and on the simulator. Replacing it pays no immediate dividends.

---

## 4. Recommendation (operator-accepted)

> **Don't do a full Hamlib integration (architecture A or B) — but adopt architecture C, plus one cheap research action.**

### 4a. Adopt architecture C: expose a `rigctld`-compatible TCP port

This is the high-value, low-cost move. `serial-server.mjs` already centralises radio access; adding a small TCP listener on the standard `rigctld` port (4532) that speaks Hamlib's `rigctld` text protocol lets the operator run **WSJT-X / Fldigi / JS8Call / N1MM / Gpredict** alongside our app, all controlling the same radio without contention, because we mediate every command on the serial side.

Scope is small: `rigctld` is a line-based ASCII protocol (`F 14250000\n` → `RPRT 0\n`, `f\n` → `14250000\nRPRT 0\n`, etc.). Roughly two dozen commands cover 95 % of real-world use. We map each to our existing internal command vocabulary.

Side-benefit: this *also* unlocks remote control from a laptop on the LAN with any Hamlib-aware app, which is the audience that § 9 (LAN allowlist) was built for. The relay reuses that same allowlist (no second config surface) — see § 23.8 for the gating implementation.

**Shipped 2026-05-28** as `rigctld-relay.mjs` + `ip-allowlist.mjs`, wired into `serial-server.mjs`, with a live terminal panel in `pages/index.vue`. Full long-form documentation lives in `cat-ftx1-NXC.md` § 23.

### 4b. Study the Hamlib FTX-1 backend as a reference (zero cost)

The Hamlib FTX-1 source (`rigs/yaesu/ftx-1.c` in their repo) encodes empirical knowledge about FTX-1 edge cases — most importantly:

| Quirk | Hamlib's solution | Our exposure |
|---|---|---|
| Split mode forces Sub VFO into TX, breaks Doppler tracking | Virtual split (Hamlib synthesises split semantics in software, never sends hardware split to the FTX-1) | We don't expose split mode in our UI yet, so we haven't tripped it. If the operator ever adds satellite work, this is a landmine. We've therefore implemented the same virtual-split semantics in our § 23 rigctld relay. |
| Other model-specific edge cases | Likely a handful of `caps->`-conditional branches in the backend source | A one-evening read-through is recommended whenever a hard-to-explain CAT bug surfaces. |

### 4c. Keep Hamlib in mind for a multi-radio future

If scope ever expands beyond the FTX-1 — a second rig, an Icom companion, a club shack with mixed gear — that's the point at which architecture B (optional Hamlib backend) becomes obviously correct. Today, with one well-understood radio, we'd be paying integration costs without collecting the multi-radio benefit.

---

## 5. What was explicitly rejected

- **Adopting Hamlib now to "future-proof".** The current code is small, well-understood, and FTX-1-targeted. "Future-proof" is the kind of argument that turns a working app into a Hamlib-bridge maintenance job.
- **Trusting an Alpha backend with packaging into our Electron installer.** By the time we shipped, a Hamlib bug might be the visible face of *our* app.
- **Throwing away `components/cat-commands-ftx1.ts`.** That catalogue and its validator (§§ 19, 20) are the operator-facing UX that distinguishes this project from "yet another rigctld GUI".

---

## 6. TL;DR

Hamlib has FTX-1 support (`-m 1051`, Hamlib 4.7, Alpha). Integrating it would be a meaningful rewrite for marginal benefit on the radio we actually own, and would surrender bandscope, BI/TS toggles, and the FTX-1-specific catalogue work.

Instead:

1. ❌ **Don't integrate Hamlib** as our serial backend.
2. ✅ **Do expose a `rigctld`-compatible TCP port** from `serial-server.mjs` so WSJT-X / Fldigi / Gpredict / N1MM users can drive our radio through the same bridge — this is the real prize hidden in the Hamlib question.
3. ✅ **Do read** Hamlib's `rigs/yaesu/ftx-1.c` for known-quirks insurance whenever a hard-to-explain CAT bug surfaces.
4. ⏳ **Revisit Hamlib** if you ever own a second non-Yaesu radio.

---

## 7. Future re-evaluation triggers

This recommendation should be re-considered if **any** of the following becomes true:

- Hamlib's FTX-1 backend graduates from Alpha → Stable *and* maintains parity with FTX-1 firmware revisions for ≥ 12 months.
- The operator acquires a second radio model (Icom / Kenwood / Elecraft).
- A bug surfaces in our own CAT layer that has a known Hamlib workaround we don't have.
- A future Electron build pipeline gains automatic native-library handling (cheap multi-platform Hamlib packaging).

Until then: keep the relay (architecture C) as our only contact surface with the Hamlib ecosystem.

---

## 8. Smoke-testing the `rigctld` relay (implementation companion)

The relay lives in `rigctld-relay.mjs` and is auto-started by `serial-server.mjs`. By default it listens on `127.0.0.1:4532` (the standard `rigctld` port). 52 automated protocol tests are run against a stubbed `SerialManager` during development; they live as scratch and are removed once green.

### 8.1 Configuration

All environment variables read once at startup:

| Env var | Default | Effect |
|---|---|---|
| `RIGCTLD_ENABLE` | `1` | Set to `0` to skip starting the relay. |
| `RIGCTLD_PORT`   | `4532` | TCP port. Use 4533+ if 4532 collides with a real `rigctld`. |
| `RIGCTLD_HOST`   | `127.0.0.1` | Bind address. `0.0.0.0` for LAN — combine with the § 9 allowlist. |
| `RIGCTLD_DEBUG`  | `0` | Set to `1` to log every request/response line. |

### 8.2 Manual smoke test with a TCP client (no radio needed for `dump_state` / `chk_vfo`)

PowerShell (`Test-NetConnection` is read-only; use `ncat` or the bundled `telnet` client):

```powershell
# Sanity check the port is listening
Test-NetConnection 127.0.0.1 -Port 4532
```

Then a plain telnet session (Windows: install via `Optional Features → Telnet Client`, or use `ncat -C 127.0.0.1 4532`):

```
> \chk_vfo
< CHKVFO 0

> \dump_state
< 0
< 1051
< 2
< 30000 56000000 0x3bbf -1 -1 0x3 0x1
< ...
< done

> f                         # only meaningful with a radio connected
< 14250000

> F 7100000
< RPRT 0

> m
< USB
< 0

> M CWR 500
< RPRT 0

> q                         # close the connection
```

`RPRT 0` = success. `RPRT -6` means the radio isn't connected (open the desktop app and click **Connect** first). `RPRT -11` means the relay doesn't support that command. `RPRT -1` means bad argument.

### 8.3 Driving from WSJT-X

In **File → Settings → Radio**:

| Field | Value |
|---|---|
| Rig | `Hamlib NET rigctl` |
| Network Server | `127.0.0.1:4532` |
| Mode | `Data/Pkt` (or as your operating practice dictates) |
| Split Operation | `Rig` (uses our virtual split) — *not* `Fake It`, which writes to your transmit freq |

Click **Test CAT**. Expected: green "OK", no popups about unsupported modes. Click **Test PTT** — the radio should key.

### 8.4 What the relay deliberately does NOT do

- It does **not** advertise tuner, S-meter, voltage, alc, swr, or any LEVEL/PARM beyond the lock/vox/comp/break-in/monitor functions in its `dump_state`. Clients that need those will silently fall back to defaults.
- It does **not** support per-band antenna selection (`y`/`Y`).
- It does **not** support memory channel commands (`E`/`e`, `H`/`h`, `B`/`b`).
- It does **not** speak the "+extended response" mode (`+f` instead of `f`). No widely-used client requires it.

These are intentional scope limits — add them only if a real client breaks without them.

