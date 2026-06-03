import { computed, ref, type Ref } from 'vue'
import {
  CAT_COMMANDS,
  findCommand,
  legacyParamHint,
  legacyParamLabel,
  legacyParamType,
  setFormShape,
  type CommandDef,
  type ValidationResult,
} from '~/components/cat-commands-ftx1'

export const CAT_CATEGORY_ORDER: ReadonlyArray<string> = [
  'frequency', 'vfo', 'mode', 'band',
  'filter', 'memory', 'power', 'audio',
  'ptt', 'tuner', 'menu', 'status', 'misc',
]

export function filterCatalogue(query: string) {
  const q = query.trim().toLowerCase()
  return CAT_COMMANDS.filter((c) => !q
    || c.code.toLowerCase().includes(q)
    || c.name.toLowerCase().includes(q)
    || c.category.toLowerCase().includes(q)
    || c.description.toLowerCase().includes(q))
}

export function buildPickerGroups(query: string): Array<{ category: string; items: CommandDef[] }> {
  const matches = filterCatalogue(query)
  const buckets = new Map<string, CommandDef[]>()
  for (const c of matches) {
    if (!buckets.has(c.category)) buckets.set(c.category, [])
    buckets.get(c.category)!.push(c)
  }
  return CAT_CATEGORY_ORDER
    .filter((cat) => buckets.has(cat))
    .map((cat) => ({ category: cat, items: buckets.get(cat)! }))
}

export function supportsBadge(s: { set: boolean; read: boolean; answer: boolean; ai: boolean }): string {
  return (
    (s.set ? 'S' : '·')
    + (s.read ? 'R' : '·')
    + (s.answer ? 'A' : '·')
    + (s.ai ? 'I' : '·')
  )
}

export function validationBadge(level: 'ok' | 'warn' | 'error'): string {
  if (level === 'error') return '✗'
  if (level === 'warn') return '⚠'
  return '✓'
}

export function validationTooltip(r: ValidationResult): string {
  if (r.issues.length === 0) return 'Valid against the FTX-1 CAT manual.'
  return r.issues.map((i) => `${i.level.toUpperCase()}: ${i.message}`).join('\n')
}

export function defFor(code: string): CommandDef | null {
  return findCommand(code)
}

export function paramTypeOf(code: string): 'none' | 'digits' | 'text' {
  const d = findCommand(code)
  return d ? legacyParamType(d) : 'text'
}

export function paramHintOf(code: string): string | undefined {
  const d = findCommand(code)
  return d ? legacyParamHint(d) : undefined
}

export function paramLabelOf(code: string): string | undefined {
  const d = findCommand(code)
  return d ? legacyParamLabel(d) : undefined
}

export function paramDefaultOf(code: string): string | undefined {
  return findCommand(code)?.paramDefault
}

export function paramPlaceholder(code: string): string {
  return paramHintOf(code) ?? paramLabelOf(code) ?? 'value'
}

export function exampleShape(code: string): string {
  const d = findCommand(code)
  return d ? setFormShape(d) : `${code.toUpperCase()}…;`
}

export function applyPickedCommand(
  code: Ref<string>,
  param: Ref<string>,
  def: CommandDef,
) {
  code.value = def.code
  if (paramTypeOf(def.code) === 'none') {
    param.value = ''
  } else if (!param.value) {
    const dflt = paramDefaultOf(def.code)
    if (dflt) param.value = dflt
  }
}

export function useCatCommandHelpTable() {
  const helpSortKey = ref<'code' | 'name' | 'category' | 'manualPage'>('code')
  const helpSortDir = ref<'asc' | 'desc'>('asc')
  const helpFilter = ref('')

  const helpRows = computed(() => {
    const rows = filterCatalogue(helpFilter.value).map((c) => ({
      code: c.code,
      name: c.name,
      category: c.category,
      supports: c.supports,
      shape: setFormShape(c),
      description: c.description,
      manualPage: c.manualPage,
      def: c,
    }))
    const key = helpSortKey.value
    const dir = helpSortDir.value === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
    return rows
  })

  function setHelpSort(key: 'code' | 'name' | 'category' | 'manualPage') {
    if (helpSortKey.value === key) {
      helpSortDir.value = helpSortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      helpSortKey.value = key
      helpSortDir.value = 'asc'
    }
  }

  return { helpSortKey, helpSortDir, helpFilter, helpRows, setHelpSort }
}