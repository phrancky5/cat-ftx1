/**
 * PUT /api/presets/[id]
 *
 * Updates preset metadata and steps (atomic transaction).
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid preset id' })
  }

  const body = await readBody<{
    name?: string
    description?: string | null
    category?: string
    steps?: Parameters<typeof resolveSteps>[1]
  }>(event)

  const db = useDb()

  // Check preset exists
  const existing = db.prepare('SELECT * FROM presets WHERE id = ?').get(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'preset not found' })
  }

  const steps = body.steps ? resolveSteps(db, body.steps) : []

  const tx = db.transaction(() => {
    // Update metadata
    const updates = []
    const params = []
    if (body.name !== undefined) {
      updates.push('name = ?')
      params.push(body.name!.trim())
    }
    if (body.description !== undefined) {
      updates.push('description = ?')
      params.push(body.description)
    }
    if (body.category !== undefined) {
      updates.push('category = ?')
      params.push(body.category)
    }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')")
      params.push(id)
      db.prepare(`UPDATE presets SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    }

    // Delete old steps and insert new ones
    if (body.steps !== undefined) {
      db.prepare('DELETE FROM preset_steps WHERE preset_id = ?').run(id)
      const insStep = db.prepare(`
        INSERT INTO preset_steps
          (preset_id, position, command_id, raw_command, param_value, delay_ms, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const s of steps) {
        insStep.run(id, s.position, s.command_id, s.raw_command, s.param_value, s.delay_ms, s.note)
      }
    }
  })

  try {
    tx()
    return { ok: true, id }
  } catch (e: any) {
    if (/UNIQUE constraint failed: presets\.rig_id, presets\.name/.test(e?.message ?? '')) {
      throw createError({ statusCode: 409, statusMessage: `preset name already exists for this rig` })
    }
    throw e
  }
})
