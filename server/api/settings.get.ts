export default defineEventHandler(async (event) => {
  const db = useDb()
  try {
    const row = db.prepare(`
      SELECT call_sign, color_primary, color_accent, color_bg, font_mono, radius_px
      FROM settings
      WHERE rig_id = 'ftx1'
    `).get()

    if (!row) {
      // Initialize defaults on first access
      db.prepare(`
        INSERT OR IGNORE INTO settings (rig_id, call_sign, color_primary, color_accent, color_bg, font_mono, radius_px)
        VALUES ('ftx1', '', '#ff9000', '#0a84ff', '#0d1117', 'Courier New', 8)
      `).run()
      return {
        call_sign: '',
        color_primary: '#ff9000',
        color_accent: '#0a84ff',
        color_bg: '#0d1117',
        font_mono: 'Courier New',
        radius_px: 8,
      }
    }

    return row
  } catch (err) {
    console.error('[settings.get]', err.message)
    throw createError({ statusCode: 500, statusMessage: 'Database error' })
  }
})
