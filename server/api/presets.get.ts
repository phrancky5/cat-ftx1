import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * GET /api/presets
 *
 * Lists presets from the database.
 * Falls back to cat-presets.json for backward compat if DB is empty.
 *
 * Query params:
 *   - `rig_id` — defaults to `ftx1`.
 */

export interface Preset {
  id: string
  label: string
  color?: string
  icon?: string
  description?: string
  commands: string[]
}

export interface PresetsConfig {
  presets: Preset[]
}

export default defineEventHandler((event): PresetsConfig => {
  const q = getQuery(event)
  const rig = String(q.rig_id ?? 'ftx1')

  try {
    const db = useDb()

    // Try to read from DB first
    const dbPresets = db.prepare(`
      SELECT p.id, p.name AS label, p.description,
             GROUP_CONCAT(ps.raw_command, ';') AS commands
      FROM   presets p
      LEFT JOIN preset_steps ps ON p.id = ps.preset_id
      WHERE  p.rig_id = ?
      GROUP BY p.id
      ORDER BY p.name ASC
    `).all(rig) as any[]

    if (dbPresets && dbPresets.length > 0) {
      return {
        presets: dbPresets.map((p) => ({
          id: String(p.id),
          label: p.label,
          description: p.description,
          commands: p.commands ? p.commands.split(';') : [],
        })),
      }
    }

    // Fall back to JSON file (with deprecation notice)
    console.log(
      '[presets.get] No presets in DB; falling back to cat-presets.json. ' +
      'Consider using the Preset Manager UI to migrate your presets.'
    )

    const configPath = process.env.CAT_RESOURCES_PATH
      ? resolve(process.env.CAT_RESOURCES_PATH, 'cat-presets.json')
      : resolve(process.cwd(), 'cat-presets.json')
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw) as PresetsConfig
    if (!Array.isArray(config.presets)) {
      throw new Error('presets field must be an array')
    }
    return config
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      message: `Cannot read presets: ${err.message}`,
    })
  }
})
