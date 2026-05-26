/**
 * POST /api/presets
 *
 * Body:
 *   {
 *     rig_id?:     string,           // default 'ftx1'
 *     name:        string,           // unique per rig
 *     description?: string | null,
 *     category?:   string,           // 'mode' | 'frequency' | 'power' | 'custom'
 *     steps: [
 *       { command_id, param_value?, delay_ms?, note? },
 *       ...
 *     ]
 *   }
 *
 * Creates a new preset with resolved CAT commands. Transaction-safe.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    rig_id?: string
    name?: string
    description?: string | null
    category?: string
    steps?: Parameters<typeof resolveSteps>[1]
  }>(event)

  if (!body?.name || !body.name.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }

  const rigId = body.rig_id ?? 'ftx1'
  const db = useDb()
  const steps = resolveSteps(db, body.steps)

  const tx = db.transaction(() => {
    const insPreset = db.prepare(`
      INSERT INTO presets (rig_id, name, description, category)
      VALUES (?, ?, ?, ?)
    `).run(rigId, body.name!.trim(), body.description ?? null, body.category ?? null)

    const presetId = Number(insPreset.lastInsertRowid)
    const insStep = db.prepare(`
      INSERT INTO preset_steps
        (preset_id, position, command_id, raw_command, param_value, delay_ms, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    for (const s of steps) {
      insStep.run(presetId, s.position, s.command_id, s.raw_command, s.param_value, s.delay_ms, s.note)
    }

    return presetId
  })

  let newId: number
  try {
    newId = tx()
  } catch (e: any) {
    if (/UNIQUE constraint failed: presets\.rig_id, presets\.name/.test(e?.message ?? '')) {
      throw createError({ statusCode: 409, statusMessage: `preset "${body.name}" already exists for this rig` })
    }
    throw e
  }

  setResponseStatus(event, 201)
  return { id: newId }
})
