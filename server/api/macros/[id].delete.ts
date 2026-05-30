/**
 * DELETE /api/macros/:id
 *
 * Removes a macro and its steps (cascaded by ON DELETE CASCADE on the FK).
 */
export default defineEventHandler((event) => {
  const id = Number.parseInt(getRouterParam(event, 'id') ?? '', 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const db = useDb()
  const info = db.prepare('DELETE FROM cat_macros WHERE id = ?').run(id)
  if (info.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'macro not found' })
  }

  setResponseStatus(event, 204)
  return ''
})
