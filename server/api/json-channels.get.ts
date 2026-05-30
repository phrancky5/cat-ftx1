/**
 * GET /api/json-channels
 *
 * Reads saved channels from cat-channels.json (same persistence model as presets).
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface SavedChannel {
  id: string
  label: string
  /** 0 = MAIN, 1 = SUB */
  vfo: '0' | '1'
  freq: number
  mode: string | null
  sqlType: number | null
  ctcssIdx: number | null
  dcsIdx: number | null
}

export interface ChannelsConfig {
  channels: SavedChannel[]
}

function channelsPath(): string {
  return process.env.CAT_RESOURCES_PATH
    ? resolve(process.env.CAT_RESOURCES_PATH, 'cat-channels.json')
    : resolve(process.cwd(), 'cat-channels.json')
}

export default defineEventHandler((): ChannelsConfig => {
  const configPath = channelsPath()
  if (!existsSync(configPath)) {
    return { channels: [] }
  }
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw) as ChannelsConfig
    if (!Array.isArray(config.channels)) {
      throw new Error('channels field must be an array')
    }
    return config
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      message: `Cannot read channels: ${err.message}`,
    })
  }
})
