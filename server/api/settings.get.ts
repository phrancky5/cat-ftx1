/**
 * GET /api/settings
 *
 * Returns the operator's settings (call sign + appearance) for rig 'ftx1'.
 * Creates a default row on first access. The `theme_overrides` column is
 * stored as a JSON string and returned as a parsed object (or null).
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

function selectSettingsRow(db: ReturnType<typeof useDb>) {
  try {
    return db.prepare(`
      SELECT call_sign, color_primary, color_accent, color_bg,
             font_mono, radius_px, theme_overrides,
             preset_timing_enabled, preset_default_delay_ms
      FROM   settings
      WHERE  rig_id = 'ftx1'
    `).get() as any
  } catch {
    const row = db.prepare(`
      SELECT call_sign, color_primary, color_accent, color_bg,
             font_mono, radius_px, theme_overrides
      FROM   settings
      WHERE  rig_id = 'ftx1'
    `).get() as any
    if (row) {
      row.preset_timing_enabled = 0
      row.preset_default_delay_ms = 100
    }
    return row
  }
}

export default defineEventHandler(async () => {
  const db = useDb()
  try {
    const row = selectSettingsRow(db)

    if (!row) {
      // Seed defaults on first access. The new row picks up the column
      // defaults from schema.sql; `theme_overrides` stays NULL (meaning
      // "use the page's built-in :root values").
      db.prepare(`
        INSERT OR IGNORE INTO settings
          (rig_id, call_sign, color_primary, color_accent, color_bg, font_mono, radius_px)
        VALUES ('ftx1', '', '#ff9000', '#0a84ff', '#0d1117', 'Courier New', 8)
      `).run()
      return {
        call_sign: '',
        color_primary: '#ff9000',
        color_accent: '#0a84ff',
        color_bg: '#0d1117',
        font_mono: 'Courier New',
        radius_px: 8,
        theme_overrides: null as Record<string, string> | null,
        preset_timing_enabled: false,
        preset_default_delay_ms: 100,
      }
    }

    return {
      ...row,
      theme_overrides: parseThemeOverrides(row.theme_overrides),
      preset_timing_enabled: !!row.preset_timing_enabled,
      preset_default_delay_ms: Number(row.preset_default_delay_ms) || 100,
    }
  } catch (err: any) {
    console.error('[settings.get]', err?.message ?? err)
    throw createError({ statusCode: 500, statusMessage: 'Database error' })
  }
})
