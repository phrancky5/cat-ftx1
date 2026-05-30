export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.command) {
    throw createError({ statusCode: 400, message: 'command is required' })
  }
  try {
    return await serialFetch(event, '/command', { method: 'POST', body })
  } catch (e: any) {
    throw createError({ statusCode: e.status ?? 500, message: e.data?.error ?? e.message })
  }
})
