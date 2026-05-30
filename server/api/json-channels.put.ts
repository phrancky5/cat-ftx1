/**
 * PUT /api/json-channels
 *
 * Writes saved channels to cat-channels.json.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ChannelsConfig } from './json-channels.get'

function channelsPath(): string {
  return process.env.CAT_RESOURCES_PATH
    ? resolve(process.env.CAT_RESOURCES_PATH, 'cat-channels.json')
    : resolve(process.cwd(), 'cat-channels.json')
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ChannelsConfig>(event)

  if (!Array.isArray(body?.channels)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'body must contain a "channels" array',
    })
  }

  for (const ch of body.channels) {
    if (typeof ch?.id !== 'string' || typeof ch?.freq !== 'number') {
      throw createError({
        statusCode: 400,
        statusMessage: 'each channel must have string id and numeric freq',
      })
    }
  }

  try {
    const configPath = channelsPath()
    const json = JSON.stringify({ channels: body.channels }, null, 2)
    writeFileSync(configPath, json, 'utf-8')

    setResponseStatus(event, 200)
    return { ok: true, saved: body.channels.length }
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to save channels: ${err.message}`,
    })
  }
})
