import { applyTemplate, templateHasParameter } from './templateEngine'

/**
 * Shape of a single macro step in request bodies.
 *
 * `raw_command` is *not* accepted from the client — it's always recomputed on
 * the server from `command_id` + `param_value` so the persisted resolved
 * string can never drift from the template it references.
 */
export interface MacroStepInput {
  command_id?: number
  param_value?: string | number | null
  delay_ms?:    number
  note?:        string | null
}

export interface ResolvedStep {
  position:    number
  command_id:  number
  raw_command: string
  param_value: string | null
  delay_ms:    number
  note:        string | null
}

/**
 * Validate a step array (as supplied by the client) against the commands
 * table, resolve each template to its final wire string, and return rows ready
 * for insertion.
 */
export function resolveSteps(
  db: import('better-sqlite3').Database,
  steps: MacroStepInput[] | undefined,
): ResolvedStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'steps[] must be a non-empty array' })
  }

  const lookup = db.prepare('SELECT id, raw_template, param_type FROM cat_commands WHERE id = ?')
  const out: ResolvedStep[] = []

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const commandId = Number(s?.command_id)
    if (!Number.isInteger(commandId)) {
      throw createError({ statusCode: 400, statusMessage: `step[${i}].command_id must be an integer` })
    }
    const cmd = lookup.get(commandId) as
      | { id: number, raw_template: string, param_type: 'none' | 'int' } | undefined
    if (!cmd) {
      throw createError({ statusCode: 400, statusMessage: `step[${i}] references unknown command_id ${commandId}` })
    }

    const hasParam = templateHasParameter(cmd.raw_template)
    if (hasParam && (s.param_value === undefined || s.param_value === null || s.param_value === '')) {
      throw createError({ statusCode: 400, statusMessage: `step[${i}] is missing param_value for command ${commandId}` })
    }
    if (!hasParam && s.param_value !== undefined && s.param_value !== null && s.param_value !== '') {
      throw createError({ statusCode: 400, statusMessage: `step[${i}] supplies param_value but command ${commandId} accepts none` })
    }

    const resolved = applyTemplate(cmd.raw_template, hasParam ? (s.param_value as string | number) : null)
    if (!resolved.ok) {
      throw createError({ statusCode: 400, statusMessage: `step[${i}] template error: ${resolved.error}` })
    }

    const delay = s.delay_ms ?? 100
    if (!Number.isInteger(delay) || delay < 0 || delay > 60_000) {
      throw createError({ statusCode: 400, statusMessage: `step[${i}].delay_ms must be 0..60000` })
    }

    out.push({
      position:    i,
      command_id:  commandId,
      raw_command: resolved.resolved,
      param_value: hasParam ? String(s.param_value) : null,
      delay_ms:    delay,
      note:        s.note ?? null,
    })
  }

  return out
}
