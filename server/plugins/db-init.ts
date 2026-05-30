/**
 * Nitro startup plugin — eagerly open the SQLite DB.
 *
 * Without this, `useDb()` is called lazily on the first macro/command API
 * request, which means the `data/cat-ftx1.db` file only appears once the
 * user touches a macro endpoint. Opening it at server-start time gives the
 * operator immediate feedback that the DB is healthy and surfaces any
 * misconfiguration (missing schema.sql, unwritable directory) at boot
 * rather than at first use.
 *
 * Failures here are *logged but not fatal* — the rest of the app (radio
 * control, theme settings, etc.) continues to work even if the DB layer
 * can't initialize, so the user can still reach the IP-allowlist
 * diagnostics and recover.
 */
export default defineNitroPlugin(() => {
  try {
    useDb() // triggers openAndInit() and prints `[db] created/opened …`
  } catch (e: any) {
    console.error('[db] failed to initialize on startup:', e?.message ?? e)
  }
})
