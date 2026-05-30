import type { H3Event } from 'h3'
import type { FetchOptions } from 'ofetch'

/**
 * Thin wrapper around $fetch that targets the local serial-server and
 * automatically adds the per-launch Bearer token. Always use this helper
 * from `server/api/*` handlers instead of calling $fetch directly.
 */
export function serialFetch<T = unknown>(
  event: H3Event,
  apiPath: string,
  options: FetchOptions = {},
): Promise<T> {
  const token = getSerialToken(event)
  return $fetch<T>(`${getSerialServerUrl(event)}${apiPath}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  }) as Promise<T>
}
