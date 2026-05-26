import { app, BrowserWindow, utilityProcess } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const LOG_PATH = path.join(os.homedir(), 'Desktop', 'serial-server.log')

// Per-launch shared secret for the local HTTP API.
// Passed via env to both forked processes; never persisted to disk.
const SERIAL_TOKEN = randomBytes(32).toString('hex')

// IP allowlist for the Nuxt API. Default to loopback only; the operator can
// expose the app to the LAN by setting ALLOWED_IPS, e.g. "192.168.1.0/24".
const ALLOWED_IPS = (process.env.ALLOWED_IPS ?? '').trim() || '127.0.0.1/8,::1'

function computeNuxtHost(spec) {
  // Loopback-only allowlist → bind to 127.0.0.1; any LAN entry → 0.0.0.0,
  // so the IP-allowlist middleware can filter reachable hosts.
  if (!spec) return '127.0.0.1'
  for (const raw of spec.split(',')) {
    const ip = raw.trim().split('/')[0]
    if (!ip) continue
    if (ip === '127.0.0.1' || ip === '::1') continue
    if (ip.startsWith('127.')) continue
    return '0.0.0.0'
  }
  return '127.0.0.1'
}

const NUXT_BIND_HOST = computeNuxtHost(ALLOWED_IPS)

// Where the SQLite user-data DB lives.
// - dev:       <project>/data/cat-ftx1.db   (relative to repo root)
// - packaged:  <userData>/cat-ftx1.db       (per-user, survives reinstall)
const CAT_DB_PATH = isDev
  ? path.join(__dirname, '..', 'data', 'cat-ftx1.db')
  : path.join(app.getPath('userData'), 'cat-ftx1.db')
try { mkdirSync(path.dirname(CAT_DB_PATH), { recursive: true }) } catch { /* fine */ }

function writeLog(msg) {
  try { writeFileSync(LOG_PATH, new Date().toISOString() + ' ' + msg + '\n', { flag: 'a' }) } catch {}
}

let serialProc, nuxtProc, win

function startServers() {
  const root = isDev ? path.join(__dirname, '..') : process.resourcesPath
  const serialScript = path.join(root, 'serial-server.mjs')

  writeLog('startServers() root=' + root)
  writeLog('serial script path=' + serialScript)

  const wrapperScript = isDev
    ? path.join(__dirname, 'serial-wrapper.mjs')
    : path.join(__dirname, 'serial-wrapper.mjs')

  writeLog('wrapper=' + wrapperScript + '  serial=' + serialScript)

  try {
    serialProc = utilityProcess.fork(wrapperScript, [], {
      env: {
        ...process.env,
        SERIAL_SERVER_PATH: serialScript,
        SERIAL_TOKEN,
      }
    })
    serialProc.on('exit', code => writeLog('[main EXIT] code=' + code))
    serialProc.on('spawn', () => writeLog('[main SPAWN] ok'))
  } catch (err) {
    writeLog('[FORK ERROR] ' + err.message + '\n' + err.stack)
  }

  writeLog('Nuxt bind host=' + NUXT_BIND_HOST + ' allowedIps=' + ALLOWED_IPS)

  nuxtProc = utilityProcess.fork(
    path.join(root, '.output/server/index.mjs'),
    [],
    {
      env: {
        ...process.env,
        // Nitro picks up either HOST or NITRO_HOST depending on its version.
        // Set both. Loopback-only by default; ALLOWED_IPS gates everything.
        HOST: NUXT_BIND_HOST,
        NITRO_HOST: NUXT_BIND_HOST,
        PORT: '3000',
        NUXT_SERIAL_SERVER_URL: 'http://127.0.0.1:3001',
        NUXT_SERIAL_TOKEN: SERIAL_TOKEN,
        ALLOWED_IPS,
        CAT_RESOURCES_PATH: root,
        CAT_DB_PATH
      }
    }
  )
}

app.whenReady().then(() => {
  startServers()
  setTimeout(() => {
    win = new BrowserWindow({ width: 1400, height: 900 })
    win.loadURL('http://localhost:3000')
  }, 1500) // poczekaj na start serwerów
})

app.on('will-quit', () => {
  serialProc?.kill()
  nuxtProc?.kill()
})

