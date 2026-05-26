/**
 * GET /api/macros/:id
 *
 * Returns the macro plus its ordered steps (joined with the source command so
 * the editor can show the command name without a second round-trip).
 */
export default defineEventHandler((event) => {
  const id = Number.parseInt(getRouterParam(event, 'id') ?? '', 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const db = useDb()
  const macro = db.prepare('SELECT * FROM cat_macros WHERE id = ?').get(id)
  if (!macro) throw createError({ statusCode: 404, statusMessage: 'macro not found' })

  const steps = db.prepare(`
    SELECT s.id, s.macro_id, s.position, s.command_id, s.raw_command, s.param_value,
           s.delay_ms, s.note,
           c.name        AS command_name,
           c.category    AS command_category,
           c.raw_template AS command_template
    FROM   cat_macro_steps s
    LEFT   JOIN cat_commands c ON c.id = s.command_id
    WHERE  s.macro_id = ?
    ORDER  BY s.position ASC
  `).all(id)

  return { macro, steps }
})
