/**
 * POST /api/presets/[id]/run
 *
 * Executes a preset's steps sequentially, respecting per-step delays.
 * Returns the results of each step (response text if awaited, error if any).
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid preset id' })
  }

  const db = useDb()

  // Fetch preset with steps
  const preset = db.prepare('SELECT id, name FROM presets WHERE id = ?').get(id)
  if (!preset) {
    throw createError({ statusCode: 404, statusMessage: 'preset not found' })
  }

  const steps = db.prepare(`
    SELECT position, command_id, raw_command, delay_ms,
           (SELECT expects_response FROM cat_commands WHERE id = command_id) AS expects_response
    FROM   preset_steps
    WHERE  preset_id = ?
    ORDER BY position ASC
  `).all(id) as any[]

  const results = []

  for (const step of steps) {
    if (step.delay_ms > 0) {
      await new Promise((r) => setTimeout(r, step.delay_ms))
    }

    try {
      let response = ''
      if (step.expects_response) {
        response = await serialFetch<string>(event, '/command', {
          method: 'POST',
          body: { command: step.raw_command, await: true, timeoutMs: 1000 },
        })
      } else {
        await serialFetch(event, '/command', {
          method: 'POST',
          body: { command: step.raw_command },
        })
      }

      results.push({
        position: step.position,
        raw_command: step.raw_command,
        ok: true,
        response: response || undefined,
      })
    } catch (err: any) {
      results.push({
        position: step.position,
        raw_command: step.raw_command,
        ok: false,
        error: err.message,
      })
    }
  }

  return { ok: true, id, name: preset.name, results }
})
