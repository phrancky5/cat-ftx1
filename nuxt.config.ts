// Compute the Nuxt dev-server bind interface from the ALLOWED_IPS env var.
// Loopback-only allowlists bind to 127.0.0.1; any LAN entry switches the
// listener to 0.0.0.0 so reachable hosts can be filtered by the IP-allowlist
// middleware (see server/middleware/ip-allowlist.ts).
function computeDevHost(spec: string | undefined): string {
  if (!spec) return '127.0.0.1'
  const lanish = spec.split(',').some((e) => {
    const ip = e.trim().split('/')[0]
    if (!ip) return false
    if (ip === '127.0.0.1' || ip === '::1') return false
    if (ip.startsWith('127.')) return false
    return true
  })
  return lanish ? '0.0.0.0' : '127.0.0.1'
}

const RESOLVED_ALLOWED_IPS = (process.env.ALLOWED_IPS && process.env.ALLOWED_IPS.trim()) || ''
const RESOLVED_DEV_HOST = computeDevHost(RESOLVED_ALLOWED_IPS)
console.log(
  `[nuxt.config] ALLOWED_IPS=${RESOLVED_ALLOWED_IPS ? `"${RESOLVED_ALLOWED_IPS}"` : '(unset → loopback default)'}`
  + ` devServer.host=${RESOLVED_DEV_HOST}`,
)

export default defineNuxtConfig({
  devtools: { enabled: false },
  ssr: false,
  // SPA mode: without this, Nuxt 3.21+ dev can fail with
  // "Vite Node IPC socket path not configured" (especially on LAN / 0.0.0.0).
  experimental: {
    viteEnvironmentApi: true,
  },
  devServer: { host: RESOLVED_DEV_HOST },
  runtimeConfig: {
    serialServerUrl: process.env.NUXT_SERIAL_SERVER_URL
      || `http://127.0.0.1:${process.env.SERIAL_SERVER_PORT || '3001'}`,
    // Per-launch shared secret, populated from NUXT_SERIAL_TOKEN env or, in
    // dev mode, lazy-read from the token file written by serial-server.mjs.
    serialToken: '',
    public: {
      // The browser opens `/api/events` (same-origin) — no public URL needed.
      // Single source of truth for the version label shown in the header.
      // Bump here when forking / releasing; the UI reads it via useRuntimeConfig().
      // Overridable at runtime via the NUXT_PUBLIC_APP_VERSION env var.
      appVersion: 'V2.3-NX',
    },
  },
})
