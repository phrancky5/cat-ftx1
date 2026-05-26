export default defineEventHandler(async (event) => {
  const db = useDb()
  try {
    const body = await readBody(event)
    const { call_sign, color_primary, color_accent, color_bg, font_mono, radius_px } = body

    // Validate color format (basic hex check)
    const isValidColor = (hex) => /^#[0-9A-F]{6}$/i.test(hex)
    if (color_primary && !isValidColor(color_primary)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid color_primary' })
    }
    if (color_accent && !isValidColor(color_accent)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid color_accent' })
    }
    if (color_bg && !isValidColor(color_bg)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid color_bg' })
    }
    if (radius_px !== undefined && (typeof radius_px !== 'number' || radius_px < 0 || radius_px > 32)) {
      throw createError({ statusCode: 400, statusMessage: 'radius_px must be 0–32' })
    }

    // Ensure row exists
    db.prepare(`
      INSERT OR IGNORE INTO settings (rig_id, call_sign, color_primary, color_accent, color_bg, font_mono, radius_px)
      VALUES ('ftx1', '', '#ff9000', '#0a84ff', '#0d1117', 'Courier New', 8)
    `).run()

    // Update fields
    const updates = []
    const params = {}
    if (call_sign !== undefined) {
      updates.push('call_sign = ?')
      params.callSign = call_sign
    }
    if (color_primary !== undefined) {
      updates.push('color_primary = ?')
      params.colorPrimary = color_primary
    }
    if (color_accent !== undefined) {
      updates.push('color_accent = ?')
      params.colorAccent = color_accent
    }
    if (color_bg !== undefined) {
      updates.push('color_bg = ?')
      params.colorBg = color_bg
    }
    if (font_mono !== undefined) {
      updates.push('font_mono = ?')
      params.fontMono = font_mono
    }
    if (radius_px !== undefined) {
      updates.push('radius_px = ?')
      params.radiusPx = radius_px
    }

    if (updates.length > 0) {
      updates.push('updated_at = datetime("now")')
      const sql = `UPDATE settings SET ${updates.join(', ')} WHERE rig_id = 'ftx1'`
      const stmt = db.prepare(sql)
      stmt.run(...Object.values(params))
    }

    const updated = db.prepare(`
      SELECT call_sign, color_primary, color_accent, color_bg, font_mono, radius_px
      FROM settings
      WHERE rig_id = 'ftx1'
    `).get()

    return { ok: true, ...updated }
  } catch (err) {
    if (err.statusCode) throw err
    console.error('[settings.put]', err.message)
    throw createError({ statusCode: 500, statusMessage: 'Database error' })
  }
})
