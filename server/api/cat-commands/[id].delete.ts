/**
 * DELETE /api/cat-commands/:id
 *
 * Removes a non-builtin command. Built-in commands are immutable.
 *
 * If the command is referenced by macro steps, ON DELETE SET NULL turns the
 * `command_id` to NULL but keeps the macro step (the resolved `raw_command`
 * stays intact, so the macro remains runnable).
 */
export default defineEventHandler((event) => {
  const idRaw = getRouterParam(event, 'id')
  const id = Number.parseInt(idRaw ?? '', 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const db = useDb()
  const row = db.prepare('SELECT is_builtin FROM cat_commands WHERE id = ?').get(id) as
    | { is_builtin: number } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'command not found' })
  if (row.is_builtin) {
    throw createError({ statusCode: 403, statusMessage: 'built-in commands cannot be deleted' })
  }

  db.prepare('DELETE FROM cat_commands WHERE id = ?').run(id)
  setResponseStatus(event, 204)
  return ''
})
