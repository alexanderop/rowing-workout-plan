<script setup lang="ts">
import type { DrawerRootEmits, DrawerRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { NumericInputKeyboardCommand, NumericInputOptions } from '@/lib/numericInput'
import { reactivePick } from '@vueuse/core'
import { DrawerRoot, useForwardPropsEmits } from 'reka-ui'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  beginNumericEditing,
  commitNumericEditing,
  formatNumericValue,
  generateNumericPresets,
  localizeNumericEditingText,
  normalizeNumericPresets,
  numericDecimalSeparator,
  numericInputKeyboardCommand,
  resolveNumericInputOptions,
  updateNumericEditing,
} from '@/lib/numericInput'
import { cn } from '@/lib/utils'
import { provideNumericInputContext } from './numericInputContext'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<
    Omit<DrawerRootProps, 'open' | 'defaultOpen'> & {
      class?: HTMLAttributes['class']
      options?: NumericInputOptions
      presets?: ReadonlyArray<number>
    }
  >(),
  {
    modal: true,
    options: () => ({}),
    presets: undefined,
    swipeDirection: 'down',
  },
)
const emits = defineEmits<Pick<DrawerRootEmits, 'update:openComplete' | 'update:snapPoint'>>()

const model = defineModel<number>({ required: true })
const open = defineModel<boolean>('open', { default: false })

defineSlots<{
  default: (props: { value: number; formattedValue: string; open: boolean }) => unknown
}>()

const delegatedProps = reactivePick(
  props,
  'defaultSnapPoint',
  'modal',
  'snapPoint',
  'snapPoints',
  'snapToSequentialPoints',
  'swipeDirection',
)
const forwarded = useForwardPropsEmits(delegatedProps, emits)
const { locale } = useI18n()

const options = computed(() => resolveNumericInputOptions(props.options))
const state = shallowRef(beginNumericEditing(model.value, options.value))
const value = computed(() => commitNumericEditing(state.value, options.value))
const slotValue = computed(() => (open.value ? value.value : model.value))
const displayText = computed(() =>
  localizeNumericEditingText(state.value.text, locale.value, options.value),
)
const formattedValue = computed(() =>
  formatNumericValue(slotValue.value, locale.value, options.value),
)
const decimalSeparator = computed(() => numericDecimalSeparator(locale.value))
const presets = computed(() =>
  props.presets === undefined
    ? generateNumericPresets(value.value, options.value)
    : normalizeNumericPresets(props.presets, options.value),
)

function resetDraft(value_: number): void {
  state.value = beginNumericEditing(value_, options.value)
}

function resetWhenOpenChanges(): void {
  resetDraft(model.value)
}

function syncClosedModel(value_: number): void {
  if (!open.value) resetDraft(value_)
}

function dispatch(action: Parameters<typeof updateNumericEditing>[1]): void {
  state.value = updateNumericEditing(state.value, action, options.value)
}

function confirm(): void {
  model.value = value.value
  open.value = false
}

function cancel(): void {
  open.value = false
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'button, a[href], input, select, textarea, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"])',
    ) !== null
  )
}

function dispatchKeyboardCommand(command: NumericInputKeyboardCommand): void {
  if (command.type === 'confirm') confirm()
  else dispatch(command)
}

function handleKeydown(event: KeyboardEvent): void {
  const command = numericInputKeyboardCommand(event.key)
  if (command === undefined) return
  if (command.type === 'confirm' && isInteractiveTarget(event.target)) return
  event.preventDefault()
  dispatchKeyboardCommand(command)
}

watch(open, resetWhenOpenChanges)
watch(model, syncClosedModel)

provideNumericInputContext({
  open,
  state,
  value,
  slotValue,
  displayText,
  formattedValue,
  decimalSeparator,
  options,
  presets,
  dispatch,
  confirm,
  cancel,
  handleKeydown,
})
</script>

<template>
  <DrawerRoot v-model:open="open" v-bind="forwarded">
    <div data-slot="numeric-input" :class="cn('contents', props.class)">
      <slot :value="slotValue" :formatted-value="formattedValue" :open="open" />
    </div>
  </DrawerRoot>
</template>
