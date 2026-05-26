/**
 * GET /api/macros
 *
 * Lists macros for a given rig, with a step count for each. Used by the
 * "Run macro" dropdown and the macro browser sidebar.
 *
 * Query params:
 *   - `rig_id` — defaults to `ftx1`.
 */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const rig = String(q.rig_id ?? 'ftx1')

  const macros = useDb().prepare(`
    SELECT m.id, m.rig_id, m.name, m.description, m.created_at, m.updated_at,
           (SELECT COUNT(*) FROM cat_macro_steps s WHERE s.macro_id = m.id) AS step_count
    FROM   cat_macros m
    WHERE  m.rig_id = ?
    ORDER  BY m.name ASC
  `).all(rig)

  return { macros }
})
