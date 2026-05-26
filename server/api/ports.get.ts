export default defineEventHandler(async (event) => {
  try {
    return await serialFetch(event, '/ports')
  } catch {
    throw createError({ statusCode: 503, message: 'Serial server unavailable. Make sure serial-server.mjs is running.' })
  }
})
