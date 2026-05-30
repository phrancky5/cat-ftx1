/**
 * PUT /api/json-presets
 *
 * Updates the cat-presets.json file with new presets.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Preset {
  id: string
  label: string
  color?: string
  icon?: string
  description?: string
  commands: string[]
  /**
   * When true, the on-screen button renders as a toggle switch: the
   * single command must be a binary 0/1 CAT command; the button reads
   * the radio's current state, then sends the opposite value. See
   * `isBinaryToggleCommand` in `components/cat-commands-ftx1.ts`.
   */
  toggle?: boolean
  /**
   * Cosmetic only. When `true` AND `toggle === true`, the on-screen
   * button is drawn as a physical bat-handle switch (industrial panel
   * look). Otherwise the default flat button + small green/red LED is
   * used. Missing/false ⇒ standard look.
   */
  toggleSwitch?: boolean
}

export interface PresetsConfig {
  presets: Preset[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<PresetsConfig>(event)

  if (!Array.isArray(body?.presets)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'body must contain a "presets" array',
    })
  }

  try {
    const configPath = process.env.CAT_RESOURCES_PATH
      ? resolve(process.env.CAT_RESOURCES_PATH, 'cat-presets.json')
      : resolve(process.cwd(), 'cat-presets.json')

    const json = JSON.stringify(body, null, 2)
    writeFileSync(configPath, json, 'utf-8')

    setResponseStatus(event, 200)
    return { ok: true, saved: body.presets.length }
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to save presets: ${err.message}`,
    })
  }
})
