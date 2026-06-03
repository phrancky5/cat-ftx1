# CAT FTX-1 (NX fork) — Installation Guide

This document lists everything required to build and run the application on a new PC. It covers the **browser + Node.js** workflow used for day-to-day operation (`npm run dev`). Optional Electron packaging is noted at the end.

**Repository:** https://github.com/phrancky5/cat-ftx1  
**Build label:** `V2.3-NX` (shown in the application header)

---

## 1. What you need

### Hardware

| Item | Notes |
|---|---|
| **Yaesu FTX-1** (or compatible CAT port) | USB connection to the PC |
| **USB serial cable** | Use the port configured in the radio (CAT-1 / CAT-2 / CAT-3). **Do not change CAT-3** if an SPA-1 (Optima) amplifier is connected — that port talks to the amp. |
| **PC** | Windows 10/11, macOS, or Linux |

### Software (required)

| Component | Version / notes |
|---|---|
| **Node.js** | **18.x or 20.x LTS** recommended (tested with Node 20+ and 22). Includes **npm**. Download: https://nodejs.org/ |
| **npm** | Ships with Node.js (v9+). Used to install dependencies. |
| **Modern web browser** | Chrome, Edge, or Firefox — the UI is a Nuxt SPA opened at `http://localhost:…` |

### Software (native build tools)

Some dependencies compile **native addons** at install time:

| Package | Why |
|---|---|
| **`better-sqlite3`** | Settings / theme persistence (`data/cat-ftx1.db`) |
| **`serialport`** | USB CAT communication in `serial-server.mjs` |

**Windows:** install **Visual Studio Build Tools** (or full Visual Studio) with the **“Desktop development with C++”** workload, plus **Python 3** (often required by `node-gyp`).

- Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/
- After installing, open a **new** terminal and run `npm install` again.

**macOS:** Xcode Command Line Tools:

```bash
xcode-select --install
```

**Linux (Debian/Ubuntu example):**

```bash
sudo apt update
sudo apt install build-essential python3
```

### Software (optional)

| Tool | Purpose |
|---|---|
| **Git** | Clone and `git pull` updates — https://git-scm.com/ |
| **SQLite CLI** | Apply one-time SQL scripts on existing databases — https://sqlite.org/download.html |
| **WSJT-X / Fldigi / etc.** | Optional; connect via built-in **rigctld** relay on TCP **4532** |

---

## 2. Get the source

### Option A — Git (recommended)

```powershell
git clone https://github.com/phrancky5/cat-ftx1.git
cd cat-ftx1
git checkout main
```

### Option B — Copy from another PC (no Git)

On a machine that already has the project:

```powershell
copy-project.bat D:\Target\cat-ftx1
```

Then on the target PC:

```powershell
cd D:\Target\cat-ftx1
npm install
```

---

## 3. Install Node dependencies

From the project root (folder containing `package.json`):

```powershell
npm install
```

This installs, among others:

| Package | Role |
|---|---|
| `nuxt` | Web UI and API server |
| `concurrently` | Runs serial-server + Nuxt together (`npm run dev`) |
| `serialport`, `@serialport/parser-readline` | CAT serial I/O |
| `better-sqlite3` | SQLite database |
| `shell-quote` | Preset / command utilities |

### If `better-sqlite3` or `serialport` fails to load (Windows)

After fixing build tools:

```powershell
npm rebuild better-sqlite3
npm rebuild serialport
```

Or reinstall:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

---

## 4. Environment configuration (optional)

Copy the example file and edit only if needed:

```powershell
copy .env.example .env
```

| Variable | Default | When to set |
|---|---|---|
| `PORT` | `3000` | Nuxt dev server port if 3000 is blocked |
| `SERIAL_SERVER_PORT` | `3001` | Serial-server HTTP API port |
| `NUXT_SERIAL_SERVER_URL` | `http://127.0.0.1:3001` | Only if you override the serial-server port manually |
| `ALLOWED_IPS` | loopback | Comma-separated IPs/CIDRs for LAN access |
| `SIMULATE_RIG` | off | Set to `1` for a virtual `SIM-FTX1` port (no radio required) |
| `RIGCTLD_ENABLE` | `1` | Set `0` to disable the rigctld TCP relay |
| `RIGCTLD_PORT` | `4532` | rigctld-compatible TCP port |

On Windows, **Hyper-V / Docker** sometimes reserves ports **3000–3001**. Recent builds **auto-probe** serial-server ports **3001–3026** and write the chosen port to `%TEMP%\cat-ftx1-serial-port` for Nuxt to discover.

See also **README.md → Port errors on startup (Windows)**.

---

## 5. Database (first run)

No manual DB setup is required for a **new** installation.

- On first start, Nuxt creates **`data/cat-ftx1.db`** automatically from **`sql/schema.sql`**.
- Settings (call sign, theme, preset timing flags) are stored there.
- Saved **channels** are stored in **`cat-channels.json`** (not the radio’s internal memory). Browser cache clears do not remove them.

### Upgrading an existing database

If you pulled a newer version and **`changelog.md`** mentions SQL migrations, apply each **once** per existing DB:

**PowerShell (with SQLite CLI installed):**

```powershell
sqlite3 data/cat-ftx1.db ".read sql/migrate-add-theme-overrides.sql"
sqlite3 data/cat-ftx1.db ".read sql/migrate-add-preset-timing-settings.sql"
```

**Python (no sqlite3.exe):**

```powershell
python -c "import sqlite3, pathlib; con=sqlite3.connect('data/cat-ftx1.db'); con.executescript(pathlib.Path('sql/migrate-add-theme-overrides.sql').read_text(encoding='utf-8')); con.commit(); con.close(); print('theme_overrides done')"
python -c "import sqlite3, pathlib; con=sqlite3.connect('data/cat-ftx1.db'); con.executescript(pathlib.Path('sql/migrate-add-preset-timing-settings.sql').read_text(encoding='utf-8')); con.commit(); con.close(); print('preset timing done')"
```

Duplicate-column errors mean the migration was already applied — safe to ignore.

---

## 6. Bundled assets

| Path | Purpose |
|---|---|
| `cat-presets.json` | Preset definitions (editable via Preset Manager) |
| `cat-channels.json` | Saved channel list (editable in UI or by hand) |
| `docs/CAT-FTX1.pdf` | Yaesu CAT manual (Preset Builder catalogue source) |

### VFO frequency font (not in repository)

The default Yaesu-style **AutopromPro Black Rounded** face is **not** shipped in this repo (licensing). When selected in **Settings → Layout → `--font-vfo`**, the browser loads it from a public CDN on first use — **internet access required** for that option. Choose any monospace option (or **Same as UI monospace**) for fully offline display.

---

## 7. Run the application

### Normal start (radio or simulator)

```powershell
npm run dev
```

This starts **two processes**:

1. **`serial-server.mjs`** — serial port + HTTP API (default port **3001**, auto-fallback on Windows)
2. **`nuxt dev`** — web UI (default port **3000**)

Open the URL printed in the terminal, typically:

```
http://localhost:3000
```

If Nuxt reports an alternate port, use that URL exactly.

### Development without hardware

```powershell
$env:SIMULATE_RIG="1"
npm run dev
```

Select port **`SIM-FTX1`** in the connection bar.

### Connect to the radio

1. In the FTX-1 menu, set **CAT baud rate** to match the app ( **115200** recommended ).
2. In the app header, choose the **COM port** and **baud rate**, then **Connect**.
3. The main dashboard appears when the link is established.

---

## 8. Network ports summary

| Port | Service | Notes |
|---|---|---|
| **3000** (or next free) | Nuxt dev server | Browser UI + `/api/*` proxy |
| **3001** (or auto 3002–3026) | Serial-server HTTP | Loopback by default; Bearer token auth |
| **4532** | rigctld TCP relay | WSJT-X, Fldigi, etc. — gated by `ALLOWED_IPS` |

---

## 9. Verify the installation

| Check | Expected |
|---|---|
| `npm run dev` | Both `[serial]` and `[nuxt]` log lines; no `EACCES` / module load errors |
| Browser | Header shows **CAT CONTROLLER** and **V2.2-NX** |
| Connect / simulator | VFO frequency display updates; SSE keeps UI in sync |
| Settings (☰) | Call sign saves; theme colours persist after refresh |
| `data/cat-ftx1.db` | File created after first settings or API use |

---

## 10. Troubleshooting

| Problem | Action |
|---|---|
| **`Cannot find module 'better-sqlite3'`** or **`NODE_MODULE_VERSION`** | Install C++ build tools; run `npm rebuild better-sqlite3` |
| **`EACCES` on port 3001** | See `.env` / README port section; or let auto-probe pick 3002+ |
| **Empty COM port list** | Check USB cable and FTX-1 CAT enable; on Linux add user to `dialout` group |
| **UI connects but no updates** | Confirm baud rate matches radio; try 115200 on both sides |
| **Theme lost after cache clear** | Ensure DB initialized; re-save settings once |
| **rigctld client rejected** | Add client IP to `ALLOWED_IPS` |

---

## 11. Optional: Electron desktop build

For a packaged desktop app (advanced):

```powershell
npm run build
npm run electron:rebuild
npm run electron:build
```

Requires the same native build tools as §3. Output depends on `electron-builder.yml` (Windows NSIS, macOS DMG, Linux AppImage).

---

## 12. Keeping installations in sync

**With Git:**

```powershell
git pull
npm install
# apply any new SQL migrations (see changelog.md)
npm run dev
```
## Note on update
if you after git pull an error occurs like this 

Updating 75dad03..a87d786
error: Your local changes to the following files would be overwritten by merge:
        cat-channels.json
        package-lock.json
        package.json
Please commit your changes or stash them before you merge.
Aborting'

the cat-channels.json contains your saved channels. Backup this file and cat-presets.json before update the 'git pull' command.
Then to overwrite and sync local version with latest run these two commands

git fetch origin
git reset --hard origin/main

After that copy the 2 files back to application root unless update notes explicitly states they need to be overwritten due to structural change. 
Then the application can be started with 'npm run dev' or the start1.ps1 script.


**Without Git:** use `copy-project.bat` from an up-to-date machine, then `npm install` on the target.

---

## 13. Related documentation

| Document | Contents |
|---|---|
| [`README.md`](../README.md) | Feature overview, rigctld setup, screenshots |
| [`changelog.md`](../changelog.md) | Dated change history |
| [`cat-ftx1-NXC.md`](../cat-ftx1-NXC.md) | Detailed design notes |
| [`.env.example`](../.env.example) | Environment variable reference |

---

*NX fork maintained by Max Elevation — based on the original [cat-ftx1](https://github.com/rzochowski/cat-ftx1) by SP9AX.*
