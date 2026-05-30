/**
 * GET /api/presets/[id]
 *
 * Returns a single preset with all its steps and resolved commands.
 */
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid preset id' })
  }

  const db = useDb()
  const preset = db.prepare(`
    SELECT id, rig_id, name, description, category, created_at, updated_at
    FROM   presets
    WHERE  id = ?
  `).get(id) as any

  if (!preset) {
    throw createError({ statusCode: 404, statusMessage: 'preset not found' })
  }

  const steps = db.prepare(`
    SELECT position, command_id, raw_command, param_value, delay_ms, note
    FROM   preset_steps
    WHERE  preset_id = ?
    ORDER BY position ASC
  `).all(id)

  return { ...preset, steps }
})
