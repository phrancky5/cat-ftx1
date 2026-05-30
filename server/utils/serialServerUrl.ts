import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { H3Event } from 'h3'

const PORT_FILE = path.join(os.tmpdir(), 'cat-ftx1-serial-port')

/**
 * Resolve the serial-server base URL for server-to-server calls.
 *
 * Precedence:
 *   1. NUXT_SERIAL_SERVER_URL (runtimeConfig.serialServerUrl when set via env)
 *   2. Port file written by serial-server.mjs after bind (dev auto-fallback)
 *   3. runtimeConfig default (http://127.0.0.1:3001)
 */
export function getSerialServerUrl(event: H3Event): string {
  const cfg = useRuntimeConfig(event)
  if (process.env.NUXT_SERIAL_SERVER_URL?.trim()) {
    return process.env.NUXT_SERIAL_SERVER_URL.trim()
  }

  try {
    const port = readFileSync(PORT_FILE, 'utf-8').trim()
    if (/^\d{2,5}$/.test(port)) {
      return `http://127.0.0.1:${port}`
    }
  } catch { /* serial-server not up yet */ }

  return String(cfg.serialServerUrl ?? 'http://127.0.0.1:3001')
}
