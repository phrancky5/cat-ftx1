/**
 * GET /api/cat-commands
 *
 * Query params:
 *   - `category` — exact match (e.g. `mode`, `frequency`).
 *   - `q`        — case-insensitive LIKE on `name` (or raw_template).
 *   - `rig_id`   — defaults to `ftx1`.
 *
 * Returns rows in display order (category then name).
 */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const rig = String(q.rig_id ?? 'ftx1')
  const category = q.category ? String(q.category) : null
  const search = q.q ? `%${String(q.q).toLowerCase()}%` : null

  const sql = [
    `SELECT id, rig_id, name, category, raw_template, param_label, param_type,`,
    `       param_default, expects_response, description, is_builtin, created_at`,
    `FROM cat_commands`,
    `WHERE rig_id = ?`,
  ]
  const params: any[] = [rig]

  if (category) { sql.push('AND category = ?'); params.push(category) }
  if (search)   { sql.push('AND (LOWER(name) LIKE ? OR LOWER(raw_template) LIKE ?)'); params.push(search, search) }

  sql.push('ORDER BY category ASC, name ASC')

  return { commands: useDb().prepare(sql.join(' ')).all(...params) }
})
