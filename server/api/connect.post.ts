export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  try {
    return await serialFetch(event, '/connect', { method: 'POST', body })
  } catch (e: any) {
    throw createError({ statusCode: e.status ?? 500, message: e.data?.error ?? e.message })
  }
})
