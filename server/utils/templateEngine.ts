/**
 * Minimal Python-style format-spec resolver for CAT command templates.
 *
 * Templates use a single named placeholder following the syntax used in the
 * upstream PDF and CSV exports, e.g.
 *
 *   FA{hz:09d};        → 9-char zero-padded integer
 *   PC1{watts:03d};    → 3-char zero-padded integer
 *   MD02;              → no placeholder (returned verbatim)
 *
 * Currently supported format specs:
 *   - `:NNd`           — base-10 integer, zero-padded to NN digits.
 *   - no spec / `:s`   — string verbatim.
 *
 * The function never throws on user input; instead it returns
 * `{ ok: false, error: '…' }` so the caller can surface a friendly message.
 */

export type TemplateResult =
  | { ok: true;  resolved: string }
  | { ok: false; error: string }

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^}]*))?\}/g

export function applyTemplate(template: string, value: string | number | null | undefined): TemplateResult {
  if (typeof template !== 'string' || template.length === 0) {
    return { ok: false, error: 'template is empty' }
  }
  // Count placeholders. Multi-placeholder templates aren't used by the
  // FTX-1 CAT protocol; reject them so we never silently substitute one slot
  // and leave others dangling.
  const matches = Array.from(template.matchAll(PLACEHOLDER_RE))
  if (matches.length === 0) {
    return { ok: true, resolved: template }
  }
  if (matches.length > 1) {
    return { ok: false, error: 'multi-placeholder templates are not supported' }
  }

  const [whole, _name, spec] = matches[0]
  let formatted: string

  if (!spec || spec === 's') {
    // Plain string substitution.
    formatted = value == null ? '' : String(value)
  } else {
    // Match `[0]?<width>d` — zero-padded integer.
    const intSpec = /^(0?)(\d+)d$/.exec(spec)
    if (intSpec) {
      const width = Number.parseInt(intSpec[2], 10)
      const n = Number(value)
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { ok: false, error: `expected integer, got "${value}"` }
      }
      if (n < 0) {
        return { ok: false, error: 'negative values not supported by CAT integer placeholders' }
      }
      formatted = String(n).padStart(width, '0')
      if (formatted.length > width) {
        return { ok: false, error: `value ${n} overflows ${width}-digit field` }
      }
    } else {
      return { ok: false, error: `unsupported format spec ":${spec}"` }
    }
  }

  return { ok: true, resolved: template.replace(whole, formatted) }
}

/**
 * True if the template contains exactly one placeholder, so the editor knows
 * to render a parameter input for it.
 */
export function templateHasParameter(template: string): boolean {
  return Array.from(template.matchAll(PLACEHOLDER_RE)).length === 1
}
