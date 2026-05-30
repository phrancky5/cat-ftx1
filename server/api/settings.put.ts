/**
 * PUT /api/settings
 *
 * Updates the single row in `settings` for rig 'ftx1'. All fields in the
 * body are optional — only the ones provided are written. Returns the
 * resulting row.
 *
 * Body shape:
 *   {
 *     call_sign?:       string,
 *     color_primary?:   string  (hex #RRGGBB),
 *     color_accent?:    string  (hex #RRGGBB),
 *     color_bg?:        string  (hex #RRGGBB),
 *     font_mono?:       string,
 *     radius_px?:       number  (0..32),
 *     theme_overrides?: Record<string, string> | null,
 *     preset_timing_enabled?: boolean,
 *     preset_default_delay_ms?: number
 *   }
 */

function parseThemeOverrides(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch { /* fall through */ }
  return null
}

export default defineEventHandler(async (event) => {
  const db = useDb()
  try {
    const body = await readBody<Record<string, any>>(event) ?? {}
    const {
      call_sign,
      color_primary,
      color_accent,
      color_bg,
      font_mono,
      radius_px,
      theme_overrides,
      preset_timing_enabled,
      preset_default_delay_ms,
    } = body

    const isValidColor = (hex: unknown) => typeof hex === 'string' && /^#[0-9A-F]{6}$/i.test(hex)
    if (color_primary !== undefined && color_primary !== null && !isValidColor(color_primary)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid color_primary' })
    }
    if (color_accent !== undefined && color_accent !== null && !isValidColor(color_accent)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid color_accent' })
    }
    if (color_bg !== undefined && color_bg !== null && !isValidColor(color_bg)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid color_bg' })
    }
    if (radius_px !== undefined && radius_px !== null
        && (typeof radius_px !== 'number' || radius_px < 0 || radius_px > 32)) {
      throw createError({ statusCode: 400, statusMessage: 'radius_px must be 0–32' })
    }
    if (preset_default_delay_ms !== undefined && preset_default_delay_ms !== null
        && (typeof preset_default_delay_ms !== 'number'
            || preset_default_delay_ms < 0 || preset_default_delay_ms > 60000)) {
      throw createError({ statusCode: 400, statusMessage: 'preset_default_delay_ms must be 0–60000' })
    }

    // Validate + serialize theme_overrides (accept null = clear, object = set)
    let themeJson: string | null | undefined = undefined  // undefined = "do not touch this column"
    if (theme_overrides !== undefined) {
      if (theme_overrides === null) {
        themeJson = null
      } else if (typeof theme_overrides === 'object' && !Array.isArray(theme_overrides)) {
        // Sanity-check: every value must be a string (CSS variable value).
        for (const [k, v] of Object.entries(theme_overrides)) {
          if (typeof k !== 'string' || typeof v !== 'string') {
            throw createError({
              statusCode: 400,
              statusMessage: 'theme_overrides must be an object of string→string',
            })
          }
        }
        themeJson = JSON.stringify(theme_overrides)
      } else {
        throw createError({
          statusCode: 400,
          statusMessage: 'theme_overrides must be an object or null',
        })
      }
    }

    // Ensure the singleton row exists before we try to UPDATE it.
    db.prepare(`
      INSERT OR IGNORE INTO settings
        (rig_id, call_sign, color_primary, color_accent, color_bg, font_mono, radius_px)
      VALUES ('ftx1', '', '#ff9000', '#0a84ff', '#0d1117', 'Courier New', 8)
    `).run()

    // Build the dynamic UPDATE. Parallel arrays keep SQL placeholders and
    // bound values in lock-step regardless of which fields the caller sent.
    const setClauses: string[] = []
    const values: any[] = []

    if (call_sign !== undefined)     { setClauses.push('call_sign = ?');     values.push(call_sign ?? '') }
    if (color_primary !== undefined) { setClauses.push('color_primary = ?'); values.push(color_primary) }
    if (color_accent !== undefined)  { setClauses.push('color_accent = ?');  values.push(color_accent) }
    if (color_bg !== undefined)      { setClauses.push('color_bg = ?');      values.push(color_bg) }
    if (font_mono !== undefined)     { setClauses.push('font_mono = ?');     values.push(font_mono) }
    if (radius_px !== undefined)     { setClauses.push('radius_px = ?');     values.push(radius_px) }
    if (themeJson !== undefined)     { setClauses.push('theme_overrides = ?'); values.push(themeJson) }
    if (preset_timing_enabled !== undefined) {
      setClauses.push('preset_timing_enabled = ?')
      values.push(preset_timing_enabled ? 1 : 0)
    }
    if (preset_default_delay_ms !== undefined) {
      setClauses.push('preset_default_delay_ms = ?')
      values.push(Math.round(Number(preset_default_delay_ms)))
    }

    if (setClauses.length > 0) {
      // NOTE: single-quoted 'now' is the SQL string literal. Double-quoting
      // is interpreted by SQLite as an identifier and fails with
      // "no such column: now" — that was the cause of the prior 500.
      setClauses.push("updated_at = datetime('now')")
      const sql = `UPDATE settings SET ${setClauses.join(', ')} WHERE rig_id = 'ftx1'`
      db.prepare(sql).run(...values)
    }

    const updated = db.prepare(`
      SELECT call_sign, color_primary, color_accent, color_bg,
             font_mono, radius_px, theme_overrides,
             preset_timing_enabled, preset_default_delay_ms
      FROM   settings
      WHERE  rig_id = 'ftx1'
    `).get() as any

    return {
      ok: true,
      ...updated,
      theme_overrides: parseThemeOverrides(updated?.theme_overrides),
      preset_timing_enabled: !!updated?.preset_timing_enabled,
      preset_default_delay_ms: Number(updated?.preset_default_delay_ms) || 100,
    }
  } catch (err: any) {
    if (err?.statusCode) throw err
    console.error('[settings.put]', err?.message ?? err)
    throw createError({ statusCode: 500, statusMessage: 'Database error' })
  }
})
