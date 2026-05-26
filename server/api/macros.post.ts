/**
 * POST /api/macros
 *
 * Body:
 *   {
 *     rig_id?:     string,           // default 'ftx1'
 *     name:        string,           // unique per rig
 *     description?: string | null,
 *     steps: [
 *       { command_id, param_value?, delay_ms?, note? },
 *       ...
 *     ]
 *   }
 *
 * Each step's `raw_command` is resolved server-side from the referenced
 * command's template + `param_value`. The whole insert runs inside a
 * transaction so a half-saved macro is impossible.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    rig_id?: string
    name?: string
    description?: string | null
    steps?: Parameters<typeof resolveSteps>[1]
  }>(event)

  if (!body?.name || !body.name.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }
  const rigId = body.rig_id ?? 'ftx1'
  const db = useDb()

  const steps = resolveSteps(db, body.steps)

  const tx = db.transaction(() => {
    const insMacro = db.prepare(`
      INSERT INTO cat_macros (rig_id, name, description)
      VALUES (?, ?, ?)
    `).run(rigId, body.name!.trim(), body.description ?? null)

    const macroId = Number(insMacro.lastInsertRowid)
    const insStep = db.prepare(`
      INSERT INTO cat_macro_steps
        (macro_id, position, command_id, raw_command, param_value, delay_ms, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const s of steps) {
      insStep.run(macroId, s.position, s.command_id, s.raw_command, s.param_value, s.delay_ms, s.note)
    }
    return macroId
  })

  let newId: number
  try {
    newId = tx()
  } catch (e: any) {
    if (/UNIQUE constraint failed: cat_macros\.rig_id, cat_macros\.name/.test(e?.message ?? '')) {
      throw createError({ statusCode: 409, statusMessage: `macro "${body.name}" already exists for this rig` })
    }
    throw e
  }

  setResponseStatus(event, 201)
  return { id: newId }
})
