/**
 * IP allowlist for the standalone serial-server.mjs process.
 *
 * Functionally mirrors `server/utils/ipAllowlist.ts` (which is consumed
 * by the Nuxt/Nitro middleware) so both processes interpret the same
 * `ALLOWED_IPS` environment variable identically. Keep the two files
 * in sync — see the .ts companion for inline rationale.
 *
 * Format (comma-separated; entries can be a single address or a CIDR):
 *
 *   ALLOWED_IPS="127.0.0.1/8,::1,192.168.1.0/24"
 *
 * Unset / empty → defaults to loopback only (secure-by-default).
 *
 * IPv4-mapped IPv6 addresses (`::ffff:192.168.1.5`) are stripped to
 * their IPv4 form before the lookup.
 */

import { BlockList, isIPv4, isIPv6 } from 'node:net'

const DEFAULT_ALLOWED_IPS = '127.0.0.1/8,::1'

let cached = null
let cachedSpec = null
let cachedSource = null
let loggedInit = false

function buildBlockList(spec) {
  const bl = new BlockList()
  const rejected = []
  const entries = spec.split(',').map((s) => s.trim()).filter(Boolean)
  for (const entry of entries) {
    if (entry.includes('/')) {
      const [addr, prefix] = entry.split('/')
      const prefixNum = Number.parseInt(prefix, 10)
      if (Number.isNaN(prefixNum)) { rejected.push(entry); continue }
      if      (isIPv4(addr)) bl.addSubnet(addr, prefixNum, 'ipv4')
      else if (isIPv6(addr)) bl.addSubnet(addr, prefixNum, 'ipv6')
      else                   rejected.push(entry)
    } else {
      if      (isIPv4(entry)) bl.addAddress(entry, 'ipv4')
      else if (isIPv6(entry)) bl.addAddress(entry, 'ipv6')
      else                    rejected.push(entry)
    }
  }
  return { bl, rejected }
}

function ensureCache() {
  if (cached) return
  const raw = process.env.ALLOWED_IPS
  const trimmed = raw && raw.trim()
  cachedSource = trimmed ? 'env' : 'default'
  cachedSpec = trimmed || DEFAULT_ALLOWED_IPS
  const { bl, rejected } = buildBlockList(cachedSpec)
  cached = bl
  if (!loggedInit) {
    loggedInit = true
    console.log(`[ip-allowlist] (serial-server) active allowlist (from ${cachedSource}): "${cachedSpec}"`)
    if (rejected.length) {
      console.warn(`[ip-allowlist] (serial-server) WARNING — rejected entries (not valid IP/CIDR): ${rejected.join(', ')}`)
    }
  }
}

export function getAllowedIpsSpec() {
  ensureCache()
  return cachedSpec
}

/**
 * Returns true when the given remote address is on the allowlist.
 * Designed to be safe to call with whatever a TCP socket's
 * `remoteAddress` property returns — `undefined`, IPv4, IPv6, or
 * IPv4-mapped IPv6.
 */
export function isAllowedRemoteAddress(remoteAddress) {
  if (!remoteAddress) return false
  let ip = remoteAddress
  if (ip.startsWith('::ffff:')) ip = ip.substring(7)
  ensureCache()
  if (isIPv4(ip)) return cached.check(ip, 'ipv4')
  if (isIPv6(ip)) return cached.check(ip, 'ipv6')
  return false
}
