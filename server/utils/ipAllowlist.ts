import { BlockList, isIPv4, isIPv6 } from 'node:net'

/**
 * IP allowlist used by the Nitro `ip-allowlist` middleware to gate every
 * request reaching the local API. The list is read from the `ALLOWED_IPS`
 * environment variable as comma-separated entries, each either a single
 * address or a CIDR block (IPv4 and IPv6 supported).
 *
 *   ALLOWED_IPS="127.0.0.1/8,::1,192.168.1.0/24"
 *
 * Defaults to loopback only when the variable is unset or empty, so the
 * "secure by default" property of the previous host-check middleware is
 * preserved. Operators that want LAN access must opt in explicitly.
 *
 * IPv4-mapped IPv6 addresses (`::ffff:192.168.1.5`) are normalised to
 * their IPv4 form before the lookup.
 */

const DEFAULT_ALLOWED_IPS = '127.0.0.1/8,::1'

let cached: BlockList | null = null
let cachedSpec: string | null = null
let cachedSource: 'env' | 'default' | null = null
let loggedInit = false

function buildBlockList(spec: string): { bl: BlockList, rejected: string[] } {
  const bl = new BlockList()
  const rejected: string[] = []
  const entries = spec.split(',').map((s) => s.trim()).filter(Boolean)
  for (const entry of entries) {
    if (entry.includes('/')) {
      const [addr, prefix] = entry.split('/')
      const prefixNum = Number.parseInt(prefix, 10)
      if (Number.isNaN(prefixNum)) { rejected.push(entry); continue }
      if (isIPv4(addr)) bl.addSubnet(addr, prefixNum, 'ipv4')
      else if (isIPv6(addr)) bl.addSubnet(addr, prefixNum, 'ipv6')
      else rejected.push(entry)
    } else {
      if (isIPv4(entry)) bl.addAddress(entry, 'ipv4')
      else if (isIPv6(entry)) bl.addAddress(entry, 'ipv6')
      else rejected.push(entry)
    }
  }
  return { bl, rejected }
}

function ensureCache(): void {
  if (cached) return
  const raw = process.env.ALLOWED_IPS
  const trimmed = raw && raw.trim()
  cachedSource = trimmed ? 'env' : 'default'
  cachedSpec = trimmed || DEFAULT_ALLOWED_IPS
  const { bl, rejected } = buildBlockList(cachedSpec)
  cached = bl
  if (!loggedInit) {
    loggedInit = true
    console.log(`[ip-allowlist] active allowlist (from ${cachedSource}): "${cachedSpec}"`)
    if (rejected.length) {
      console.warn(`[ip-allowlist] WARNING — these entries were rejected (not a valid IP / CIDR): ${rejected.join(', ')}`)
    }
  }
}

export function getAllowedIps(): BlockList {
  ensureCache()
  return cached as BlockList
}

export function getAllowedIpsSpec(): string {
  ensureCache()
  return cachedSpec as string
}

/**
 * Returns a tuple of [allowed, normalisedIp] so callers (e.g. the middleware)
 * can log exactly which IP value was checked after IPv4-mapped IPv6 stripping.
 */
export function checkRemoteAddress(remoteAddress: string | undefined | null): { allowed: boolean, normalized: string } {
  if (!remoteAddress) return { allowed: false, normalized: '' }
  let ip = remoteAddress
  if (ip.startsWith('::ffff:')) ip = ip.substring(7)
  const bl = getAllowedIps()
  if (isIPv4(ip)) return { allowed: bl.check(ip, 'ipv4'), normalized: ip }
  if (isIPv6(ip)) return { allowed: bl.check(ip, 'ipv6'), normalized: ip }
  return { allowed: false, normalized: ip }
}

export function isAllowedRemoteAddress(remoteAddress: string | undefined | null): boolean {
  return checkRemoteAddress(remoteAddress).allowed
}
