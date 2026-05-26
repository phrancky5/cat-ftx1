import http from 'node:http'

/**
 * Server-Sent Events proxy.
 *
 * The browser subscribes to `/api/events` (relative to whatever interface
 * Nuxt is bound to — loopback or LAN). Nitro opens a server-to-server
 * connection to the standalone serial-server's `/events`, adding the
 * per-launch Bearer token, and forwards the SSE stream byte-for-byte to
 * the browser.
 *
 * Benefits over letting the browser hit the serial-server directly:
 *   - The token never enters the browser (no `?token=` on the URL).
 *   - Same-origin SSE — no CORS plumbing on the cross-port hop.
 *   - LAN clients reach the API through one bound interface, gated by
 *     the IP allowlist middleware.
 */
export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event)
  const token = getSerialToken(event)
  const upstreamUrl = new URL(`${cfg.serialServerUrl as string}/events`)

  setResponseStatus(event, 200)
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setResponseHeader(event, 'Connection', 'keep-alive')
  // Hint to any reverse proxy / dev server (Vite) not to buffer this stream.
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  event.node.res.flushHeaders?.()

  return await new Promise<void>((resolve) => {
    const upstream = http.request(
      {
        hostname: upstreamUrl.hostname,
        port: Number(upstreamUrl.port || 80),
        path: upstreamUrl.pathname,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
      },
      (upRes) => {
        if (upRes.statusCode !== 200) {
          try { event.node.res.end() } catch { /* already closed */ }
          upstream.destroy()
          resolve()
          return
        }
        upRes.on('data', (chunk: Buffer) => {
          if (!event.node.res.writableEnded) {
            event.node.res.write(chunk)
          }
        })
        const closeDown = () => {
          try { if (!event.node.res.writableEnded) event.node.res.end() } catch { /* already closed */ }
          resolve()
        }
        upRes.on('end', closeDown)
        upRes.on('error', closeDown)
      },
    )

    upstream.on('error', () => {
      try { if (!event.node.res.writableEnded) event.node.res.end() } catch { /* already closed */ }
      resolve()
    })

    event.node.req.on('close', () => {
      try { upstream.destroy() } catch { /* already destroyed */ }
      try { if (!event.node.res.writableEnded) event.node.res.end() } catch { /* already closed */ }
      resolve()
    })

    upstream.end()
  })
})
