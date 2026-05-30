export default defineEventHandler(async (event) => {
  try {
    return await serialFetch(event, '/disconnect', { method: 'POST' })
  } catch (e: any) {
    throw createError({ statusCode: e.status ?? 500, message: e.data?.error ?? e.message })
  }
})
