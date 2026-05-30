import { normalizePresetSteps } from '../utils/presetSteps'
import { useDb } from '../utils/db'

export interface CommandResult {
  command: string
  response?: string
  error?: string
  ok: boolean
}

export interface PresetExecuteResult {
  ok: boolean
  results: CommandResult[]
  state: object
}

function readPresetTimingSettings(): { enabled: boolean, defaultDelayMs: number } {
  try {
    const db = useDb()
    const row = db.prepare(`
      SELECT preset_timing_enabled, preset_default_delay_ms
      FROM   settings
      WHERE  rig_id = 'ftx1'
    `).get() as { preset_timing_enabled?: number, preset_default_delay_ms?: number } | undefined
    if (!row) return { enabled: false, defaultDelayMs: 100 }
    return {
      enabled: !!row.preset_timing_enabled,
      defaultDelayMs: Number(row.preset_default_delay_ms) || 100,
    }
  } catch {
    // Column missing — migration not applied yet; stay on fast path.
    return { enabled: false, defaultDelayMs: 100 }
  }
}

export default defineEventHandler(async (event): Promise<PresetExecuteResult> => {
  const body = await readBody(event)

  if (!Array.isArray(body?.commands) || body.commands.length === 0) {
    throw createError({ statusCode: 400, message: 'commands array is required' })
  }

  const steps = normalizePresetSteps(body.commands)
  const timing = readPresetTimingSettings()

  try {
    return await serialFetch<PresetExecuteResult>(event, '/preset', {
      method: 'POST',
      body: {
        steps,
        timingEnabled: timing.enabled,
        defaultDelayMs: timing.defaultDelayMs,
      },
    })
  } catch (e: any) {
    throw createError({
      statusCode: e.status ?? 500,
      message: e.data?.error ?? e.message,
    })
  }
})
