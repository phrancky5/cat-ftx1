/**
 * PUT /api/cat-commands/:id
 *
 * Update an existing command. Refuses to modify rows where `is_builtin = 1`
 * because those originate from the schema seed and should remain canonical.
 *
 * Body (partial — only present fields are updated):
 *   {
 *     name?:             string,
 *     category?:         string,
 *     raw_template?:     string,
 *     param_label?:      string | null,
 *     param_type?:       'none' | 'int',
 *     param_default?:    string | null,
 *     expects_response?: boolean,
 *     description?:      string | null,
 *   }
 */
export default defineEventHandler(async (event) => {
  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(idRaw ?? '', 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const db = useDb()
  const existing = db.prepare('SELECT * FROM cat_commands WHERE id = ?').get(id) as
    | { id: number, is_builtin: number }
    | undefined
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'command not found' })
  if (existing.is_builtin) {
    throw createError({ statusCode: 403, statusMessage: 'built-in commands cannot be modified' })
  }

  const body = await readBody<Record<string, any>>(event) ?? {}
  const fields: string[] = []
  const params: any[] = []

  const setStr = (col: string, val: any, nullable = true) => {
    if (val === undefined) return
    if (val === null && !nullable) {
      throw createError({ statusCode: 400, statusMessage: `${col} cannot be null` })
    }
    fields.push(`${col} = ?`)
    params.push(val === null ? null : String(val))
  }

  setStr('name',          body.name,          false)
  setStr('category',      body.category,      false)
  setStr('raw_template',  body.raw_template,  false)
  setStr('param_label',   body.param_label)
  setStr('param_default', body.param_default)
  setStr('description',   body.description)

  if (body.param_type !== undefined) {
    if (body.param_type !== 'none' && body.param_type !== 'int') {
      throw createError({ statusCode: 400, statusMessage: 'param_type must be "none" or "int"' })
    }
    fields.push('param_type = ?'); params.push(body.param_type)
  }
  if (body.expects_response !== undefined) {
    fields.push('expects_response = ?'); params.push(body.expects_response ? 1 : 0)
  }

  if (fields.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'no updatable fields supplied' })
  }

  params.push(id)
  db.prepare(`UPDATE cat_commands SET ${fields.join(', ')} WHERE id = ?`).run(...params)

  return { command: db.prepare('SELECT * FROM cat_commands WHERE id = ?').get(id) }
})
