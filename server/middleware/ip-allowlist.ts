/**
 * Reject any HTTP request whose remote socket address is not in the
 * IP allowlist (`ALLOWED_IPS` env var, defaults to loopback only).
 *
 * Logs the first allow/deny per unique remote IP so the operator can
 * diagnose why a LAN client is or isn't getting through.
 */

const seenAllowed = new Set<string>()
const seenDenied = new Set<string>()
let loggedInternalBypass = false

export default defineEventHandler((event) => {
  const raw = event.node.req.socket?.remoteAddress

  // No socket means the request originated in-process (e.g. Nuxt's dev-mode
  // SPA template fetch dispatched through h3 without going over TCP). Such a
  // request cannot have come from the network, so it's inherently safe and
  // must not be blocked — otherwise the dev SPA shell never renders.
  if (!raw) {
    if (!loggedInternalBypass) {
      loggedInternalBypass = true
      console.log(`[ip-allowlist] PASS in-process request (no socket) path="${event.node.req.url}"`)
    }
    return
  }

  const { allowed, normalized } = checkRemoteAddress(raw)

  if (!allowed) {
    if (!seenDenied.has(raw)) {
      seenDenied.add(raw)
      console.warn(
        `[ip-allowlist] DENY remote="${raw}" normalized="${normalized}" path="${event.node.req.url}" allowlist="${getAllowedIpsSpec()}"`,
      )
    }
    throw createError({ statusCode: 403, statusMessage: 'forbidden ip' })
  }

  if (!seenAllowed.has(raw)) {
    seenAllowed.add(raw)
    console.log(`[ip-allowlist] ALLOW remote="${raw}" normalized="${normalized}"`)
  }
})
