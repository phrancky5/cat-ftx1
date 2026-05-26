/**
 * DELETE /api/presets/[id]
 *
 * Deletes a preset and all its steps (cascade).
 */
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid preset id' })
  }

  const db = useDb()

  // Check exists
  const existing = db.prepare('SELECT * FROM presets WHERE id = ?').get(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'preset not found' })
  }

  db.prepare('DELETE FROM presets WHERE id = ?').run(id)
  // Steps cascade-delete via FK

  return { ok: true, id }
})
