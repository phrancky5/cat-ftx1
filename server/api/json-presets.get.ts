/**
 * GET /api/json-presets
 *
 * Reads presets directly from cat-presets.json file.
 */
import { readFileSync } from 'node:fs'
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

export default defineEventHandler((): PresetsConfig => {
  try {
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
