/**
 * POST /api/macros/:id/run
 *
 * Executes a macro by iterating its steps in order. Each step is sent to the
 * serial-server via `serialFetch`; when the source command's
 * `expects_response` is true, the call awaits the radio reply, otherwise it's
 * fire-and-forget. Between steps the handler sleeps `delay_ms`.
 *
 * Body (optional):
 *   { abort_on_error?: boolean }   // default true
 *
 * Response:
 *   {
 *     ok: boolean,                  // false if any step failed (or aborted)
 *     macro_id: number,
 *     results: [
 *       { position, raw_command, ok, awaited, response?, error? },
 *       ...
 *     ]
 *   }
 *
 * Macro execution is sequential — concurrent radio commands would race the
 * CAT bus. Maximum wall-time is roughly Σ(delay_ms) + per-step RTT.
 */

interface StepRow {
  position:         number
  raw_command:      string
  delay_ms:         number
  expects_response: number | null
}

interface StepResult {
  position:    number
  raw_command: string
  ok:          boolean
  awaited:     boolean
  response?:   string | null
  error?:      string
}

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))

export default defineEventHandler(async (event) => {
  const id = Number.parseInt(getRouterParam(event, 'id') ?? '', 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const body = await readBody<{ abort_on_error?: boolean }>(event).catch(() => ({} as any))
  const abortOnError = body?.abort_on_error !== false

  const db = useDb()
  if (!db.prepare('SELECT 1 FROM cat_macros WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, statusMessage: 'macro not found' })
  }

  const steps = db.prepare(`
    SELECT s.position, s.raw_command, s.delay_ms, c.expects_response
    FROM   cat_macro_steps s
    LEFT   JOIN cat_commands c ON c.id = s.command_id
    WHERE  s.macro_id = ?
    ORDER  BY s.position ASC
  `).all(id) as StepRow[]

  if (steps.length === 0) {
    return { ok: true, macro_id: id, results: [] }
  }

  const results: StepResult[] = []
  let overallOk = true

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const awaited = !!step.expects_response

    try {
      const r = await serialFetch<{ ok?: boolean, response?: string | null }>(
        event,
        '/command',
        { method: 'POST', body: { command: step.raw_command, await: awaited } },
      )
      results.push({
        position:    step.position,
        raw_command: step.raw_command,
        ok:          true,
        awaited,
        response:    awaited ? (r?.response ?? null) : undefined,
      })
    } catch (e: any) {
      overallOk = false
      results.push({
        position:    step.position,
        raw_command: step.raw_command,
        ok:          false,
        awaited,
        error:       e?.data?.error ?? e?.message ?? 'unknown error',
      })
      if (abortOnError) break
    }

    // Sleep between steps but skip the trailing delay after the last one.
    if (i < steps.length - 1 && step.delay_ms > 0) {
      await sleep(step.delay_ms)
    }
  }

  return { ok: overallOk, macro_id: id, results }
})
