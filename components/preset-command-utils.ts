/**
 * Preset command list parsing — safe for client + server import.
 * Keep in sync with `preset-steps.mjs` / `server/utils/presetSteps.ts`.
 */

export type PresetCommandEntry =
  | string
  | {
      command: string
      delayMs?: number
      delay_ms?: number
      await?: boolean | number
    }

export interface ParsedPresetStep {
  command: string
  delayMs?: number
  await: boolean
}

export function parsePresetCommandEntry(entry: unknown): ParsedPresetStep {
  if (typeof entry === 'string') {
    return { command: entry.replace(/;+$/, '').trim(), await: false }
  }
  if (entry && typeof entry === 'object' && typeof (entry as { command?: string }).command === 'string') {
    const e = entry as { command: string, delayMs?: number, delay_ms?: number, await?: boolean | number }
    const command = e.command.replace(/;+$/, '').trim()
    const rawDelay = e.delayMs ?? e.delay_ms
    const delayMs = typeof rawDelay === 'number' && Number.isFinite(rawDelay)
      ? Math.max(0, Math.min(60000, Math.round(rawDelay)))
      : undefined
    return {
      command,
      delayMs,
      await: e.await === true || e.await === 1,
    }
  }
  return { command: '', await: false }
}

export function normalizePresetSteps(commands: unknown): ParsedPresetStep[] {
  if (!Array.isArray(commands)) return []
  return commands
    .map(parsePresetCommandEntry)
    .filter((s) => s.command.length >= 2)
}

export function presetCommandCount(commands: unknown): number {
  return normalizePresetSteps(commands).length
}
