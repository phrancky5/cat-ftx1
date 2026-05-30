/**
 * PUT /api/macros/:id
 *
 * Replaces the macro's metadata and step list atomically. The previous step
 * rows are deleted and the new set is inserted in a single transaction.
 *
 * Body: same shape as POST /api/macros (name/description/steps).
 */
export default defineEventHandler(async (event) => {
  const id = Number.parseInt(getRouterParam(event, 'id') ?? '', 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const body = await readBody<{
    name?: string
    description?: string | null
    steps?: Parameters<typeof resolveSteps>[1]
  }>(event)

  if (!body?.name || !body.name.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }

  const db = useDb()
  if (!db.prepare('SELECT 1 FROM cat_macros WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, statusMessage: 'macro not found' })
  }

  const steps = resolveSteps(db, body.steps)

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE cat_macros
      SET    name = ?, description = ?, updated_at = datetime('now')
      WHERE  id = ?
    `).run(body.name!.trim(), body.description ?? null, id)

    db.prepare('DELETE FROM cat_macro_steps WHERE macro_id = ?').run(id)

    const insStep = db.prepare(`
      INSERT INTO cat_macro_steps
        (macro_id, position, command_id, raw_command, param_value, delay_ms, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const s of steps) {
      insStep.run(id, s.position, s.command_id, s.raw_command, s.param_value, s.delay_ms, s.note)
    }
  })

  try {
    tx()
  } catch (e: any) {
    if (/UNIQUE constraint failed: cat_macros\.rig_id, cat_macros\.name/.test(e?.message ?? '')) {
      throw createError({ statusCode: 409, statusMessage: `macro "${body.name}" already exists for this rig` })
    }
    throw e
  }

  return { ok: true }
})
