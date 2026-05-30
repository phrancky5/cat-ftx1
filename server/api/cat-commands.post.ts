/**
 * POST /api/cat-commands
 *
 * Body (all but `name`/`category`/`raw_template` optional):
 *   {
 *     rig_id?: string,              // default 'ftx1'
 *     name: string,
 *     category: string,
 *     raw_template: string,
 *     param_label?: string | null,
 *     param_type?: 'none' | 'int',  // default 'none'
 *     param_default?: string | null,
 *     expects_response?: boolean,   // default false
 *     description?: string | null,
 *   }
 *
 * Always inserted with `is_builtin = 0`. Built-in commands are seeded only via
 * `sql/schema.sql` (which currently seeds nothing — by request).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    rig_id?: string
    name?: string
    category?: string
    raw_template?: string
    param_label?: string | null
    param_type?: 'none' | 'int'
    param_default?: string | null
    expects_response?: boolean
    description?: string | null
  }>(event)

  if (!body?.name || !body.category || !body.raw_template) {
    throw createError({ statusCode: 400, statusMessage: 'name, category and raw_template are required' })
  }
  const paramType = body.param_type ?? 'none'
  if (paramType !== 'none' && paramType !== 'int') {
    throw createError({ statusCode: 400, statusMessage: 'param_type must be "none" or "int"' })
  }

  const stmt = useDb().prepare(`
    INSERT INTO cat_commands
      (rig_id, name, category, raw_template, param_label, param_type, param_default, expects_response, description, is_builtin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `)
  const info = stmt.run(
    body.rig_id ?? 'ftx1',
    body.name.trim(),
    body.category.trim(),
    body.raw_template.trim(),
    body.param_label ?? null,
    paramType,
    body.param_default ?? null,
    body.expects_response ? 1 : 0,
    body.description ?? null,
  )

  const row = useDb()
    .prepare('SELECT * FROM cat_commands WHERE id = ?')
    .get(info.lastInsertRowid)

  setResponseStatus(event, 201)
  return { command: row }
})
