import { readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'

/**
 * Per-launch shared secret used to authenticate the Nuxt server against
 * the standalone serial-server (and vice-versa).
 *
 * Resolution order:
 *   1. runtimeConfig.serialToken — set from the NUXT_SERIAL_TOKEN env var
 *      that electron/main.mjs passes to the Nitro process.
 *   2. Token file under os.tmpdir() — used in `npm run dev` where Nitro and
 *      serial-server.mjs are started independently by `concurrently`.
 *
 * Never log the returned value.
 */

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
