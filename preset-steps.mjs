/**
 * Preset command list helpers — shared by serial-server.mjs and (via
 * duplicate types in server/utils) the Nuxt API layer.
 *
 * `commands` in cat-presets.json may be:
 *   - string   — full CAT command without trailing ';'  (legacy)
 *   - object   — { command, delayMs?, await? }
 *
 * When global preset timing is disabled, executors ignore delayMs/await
 * and use the fast path (AI fire-and-forget + short fixed gap).
 */

/**
 * @param {unknown} entry
 * @returns {{ command: string, delayMs?: number, await: boolean }}
 */
export function parsePresetCommandEntry(entry) {
  if (typeof entry === 'string') {
    const command = entry.replace(/;+$/, '').trim()
    return { command, await: false }
  }
  if (entry && typeof entry === 'object' && typeof entry.command === 'string') {
    const command = entry.command.replace(/;+$/, '').trim()
    const delayMs = entry.delayMs ?? entry.delay_ms
    const parsedDelay = typeof delayMs === 'number' && Number.isFinite(delayMs)
      ? Math.max(0, Math.min(60000, Math.round(delayMs)))
      : undefined
    return {
      command,
      delayMs: parsedDelay,
      await: entry.await === true || entry.await === 1,
    }
  }
  return { command: '', await: false }
}

/**
 * @param {unknown[]} commands
 * @returns {Array<{ command: string, delayMs?: number, await: boolean }>}
 */
export function normalizePresetSteps(commands) {
  if (!Array.isArray(commands)) return []
  return commands
    .map(parsePresetCommandEntry)
    .filter((s) => s.command.length >= 2)
}

/** @param {unknown[]} commands */
export function presetCommandCount(commands) {
  return normalizePresetSteps(commands).length
}
