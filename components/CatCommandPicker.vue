<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="cat-pick"
      :class="`cat-pick--${pos.placement}`"
      :style="{
        top: pos.top + 'px',
        left: pos.left + 'px',
        width: pos.width + 'px',
        maxHeight: pos.maxHeight + 'px',
      }"
      role="listbox"
      aria-label="Browse CAT commands"
      @mousedown.stop
    >
      <div class="cat-pick-header">
        <input
          ref="filterEl"
          v-model="filter"
          type="text"
          class="cat-pick-filter"
          placeholder="Filter (code, name, category, description…)"
          spellcheck="false"
          @input="highlightIndex = 0"
          @keydown="onFilterKeydown"
        />
        <span class="cat-pick-count">{{ flat.length }} / {{ CAT_COMMANDS.length }}</span>
        <button type="button" class="cat-pick-close" title="Close" @click="emit('close')">✕</button>
      </div>

      <div ref="listEl" class="cat-pick-list">
        <template v-for="g in groups" :key="g.category">
          <div class="cat-pick-group">{{ g.category }}</div>
          <div
            v-for="item in g.items"
            :key="item.code"
            class="cat-pick-item"
            :class="{
              'cat-pick-item--highlight': flat[highlightIndex]?.code === item.code,
              'cat-pick-item--readonly': !item.supports.set,
            }"
            role="option"
            :aria-selected="flat[highlightIndex]?.code === item.code"
            @mousedown.prevent="emit('pick', item)"
            @mouseenter="highlightIndex = flat.findIndex((c) => c.code === item.code)"
          >
            <span class="cat-pick-code">{{ item.code }}</span>
            <div class="cat-pick-info">
              <div class="cat-pick-name">
                {{ item.name }}
                <span v-if="!item.supports.set" class="cat-pick-ro" title="Read-only — no SET form">read-only</span>
              </div>
              <div class="cat-pick-desc">{{ item.description }}</div>
              <div class="cat-pick-example"><code>{{ setFormShape(item) }}</code></div>
            </div>
            <div class="cat-pick-meta">
              <span class="cat-pick-srai" title="Set · Read · Answer · AI">{{ supportsBadge(item.supports) }}</span>
              <span class="cat-pick-page">p.{{ item.manualPage }}</span>
            </div>
          </div>
        </template>
        <div v-if="flat.length === 0" class="cat-pick-empty">
          No commands match "{{ filter }}".
        </div>
      </div>

      <div class="cat-pick-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>Enter</kbd> select</span>
        <span><kbd>Esc</kbd> close</span>
        <button type="button" class="cat-pick-helplink" @click="emit('open-help')">Open full reference ?</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type Ref } from 'vue'
import { CAT_COMMANDS, setFormShape, type CommandDef } from './cat-commands-ftx1'
import { buildPickerGroups, supportsBadge } from '~/composables/useCatCommandUi'

const props = defineProps<{
  open: boolean
  anchorEl: Ref<HTMLElement | null> | HTMLElement | null
  focusFilterOnOpen?: boolean
}>()

const emit = defineEmits<{
  pick: [def: CommandDef]
  close: []
  'open-help': []
}>()

const filter = ref('')
const highlightIndex = ref(0)
const filterEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const PICKER_IDEAL_HEIGHT = 480
const PICKER_MIN_BELOW = 220
const PICKER_MARGIN = 12

const pos = ref({
  top: 0,
  left: 0,
  width: 320,
  maxHeight: 420,
  placement: 'below' as 'below' | 'above',
})

const groups = computed(() => buildPickerGroups(filter.value))
const flat = computed(() => groups.value.flatMap((g) => g.items))

function anchorNode(): HTMLElement | null {
  const a = props.anchorEl
  if (!a) return null
  if (a instanceof HTMLElement) return a
  return (a as Ref<HTMLElement | null>).value
}

function recomputePos() {
  const anchor = anchorNode()
  if (!anchor) return
  const rect = anchor.getBoundingClientRect()
  const vh = window.innerHeight
  const spaceBelow = vh - rect.bottom - PICKER_MARGIN
  const spaceAbove = rect.top - PICKER_MARGIN

  let placement: 'below' | 'above'
  let top: number
  let maxHeight: number

  if (spaceBelow >= PICKER_MIN_BELOW || spaceBelow >= spaceAbove) {
    placement = 'below'
    maxHeight = Math.max(160, Math.min(PICKER_IDEAL_HEIGHT, spaceBelow))
    top = rect.bottom + 4
  } else {
    placement = 'above'
    maxHeight = Math.max(160, Math.min(PICKER_IDEAL_HEIGHT, spaceAbove))
    top = rect.top - maxHeight - 4
  }

  pos.value = {
    top,
    left: rect.left,
    width: Math.max(320, rect.width),
    maxHeight,
    placement,
  }
}

function scrollHighlightedIntoView() {
  nextTick(() => {
    const el = listEl.value?.querySelector('.cat-pick-item--highlight') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function onFilterKeydown(ev: KeyboardEvent) {
  const items = flat.value
  if (ev.key === 'ArrowDown') {
    ev.preventDefault()
    if (items.length === 0) return
    highlightIndex.value = (highlightIndex.value + 1) % items.length
    scrollHighlightedIntoView()
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault()
    if (items.length === 0) return
    highlightIndex.value = (highlightIndex.value - 1 + items.length) % items.length
    scrollHighlightedIntoView()
  } else if (ev.key === 'Enter') {
    ev.preventDefault()
    const picked = items[highlightIndex.value]
    if (picked) emit('pick', picked)
  } else if (ev.key === 'Escape') {
    ev.preventDefault()
    ev.stopPropagation()
    emit('close')
  }
}

watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    filter.value = ''
    highlightIndex.value = 0
    return
  }
  nextTick(() => {
    recomputePos()
    if (props.focusFilterOnOpen) filterEl.value?.focus()
  })
})

function onViewportChange() {
  if (props.open) recomputePos()
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('resize', onViewportChange)
    document.addEventListener('scroll', onViewportChange, true)
  } else {
    window.removeEventListener('resize', onViewportChange)
    document.removeEventListener('scroll', onViewportChange, true)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportChange)
  document.removeEventListener('scroll', onViewportChange, true)
})
</script>

<style scoped>
.cat-pick {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  color: #c9d1d9;
}

.cat-pick-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #30363d;
  background: #0d1117;
  flex-shrink: 0;
}

.cat-pick-filter {
  flex: 1;
  min-width: 0;
  background: #0d1117;
  border: 1px solid #30363d;
  color: #e6edf3;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 12px;
}

.cat-pick-filter:focus { outline: 2px solid #388bfd; }

.cat-pick-count {
  font-size: 10px;
  color: #6e7681;
  white-space: nowrap;
}

.cat-pick-close {
  background: transparent;
  border: none;
  color: #8b949e;
  cursor: pointer;
  padding: 2px 6px;
}

.cat-pick-close:hover { color: #fff; }

.cat-pick-list {
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 80px;
}

.cat-pick-group {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 5px 12px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #8b949e;
  background: #21262d;
  border-bottom: 1px solid #30363d;
}

.cat-pick-item {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #21262d;
  align-items: start;
}

.cat-pick-item:hover,
.cat-pick-item--highlight {
  background: rgba(88, 166, 255, 0.12);
}

.cat-pick-item--readonly { opacity: 0.85; }

.cat-pick-code {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-weight: 700;
  font-size: 12px;
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.1);
  border: 1px solid rgba(88, 166, 255, 0.32);
  border-radius: 3px;
  padding: 3px 4px;
  text-align: center;
}

.cat-pick-info { min-width: 0; }

.cat-pick-name {
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
  display: flex;
  align-items: center;
  gap: 6px;
}

.cat-pick-ro {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  color: #d29922;
  border: 1px solid rgba(187, 128, 9, 0.35);
  border-radius: 2px;
  padding: 0 4px;
}

.cat-pick-desc {
  font-size: 11px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cat-pick-example {
  margin-top: 2px;
  font-size: 10px;
}

.cat-pick-example code {
  font-family: var(--font-mono, ui-monospace, monospace);
  color: #a5d6ff;
}

.cat-pick-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
}

.cat-pick-srai { color: #d29922; letter-spacing: 1.5px; }
.cat-pick-page { color: #6e7681; font-size: 9px; }

.cat-pick-empty {
  padding: 20px;
  text-align: center;
  color: #8b949e;
  font-style: italic;
  font-size: 12px;
}

.cat-pick-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-top: 1px solid #30363d;
  background: #0d1117;
  font-size: 11px;
  color: #8b949e;
  flex-shrink: 0;
}

.cat-pick-footer kbd {
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  margin-right: 2px;
}

.cat-pick-helplink {
  margin-left: auto;
  background: transparent;
  border: 1px solid #30363d;
  color: #c9d1d9;
  border-radius: 3px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 11px;
}

.cat-pick-helplink:hover {
  background: #30363d;
  color: #fff;
}
</style>