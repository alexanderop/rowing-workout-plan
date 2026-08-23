<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MoleculeKeypad from '@/components/molecules/MoleculeKeypad.vue'
import { canonicalEntry, digitsFrom, popDigit, pushDigit, type EntryKind } from '../entry'

const props = defineProps<{
  kind: EntryKind
  /** The input's localized label, used to name the pad. */
  fieldLabel: string
  /** The localized action to take after this field. */
  actionLabel: string
  /** A field-specific shortcut such as `00` or `000`. */
  extraKey: string
}>()

const emit = defineEmits<{
  advance: []
}>()

const model = defineModel<string>({ default: '' })
const { t } = useI18n()

function updateEntry(key: string): void {
  const current = digitsFrom(props.kind, model.value)
  const next =
    key === 'backspace'
      ? popDigit(current)
      : [...key].reduce((digits, digit) => pushDigit(props.kind, digits, digit), current)
  model.value = canonicalEntry(props.kind, next)
}

function handlePress(key: string): void {
  if (key !== 'action') return updateEntry(key)
  emit('advance')
}
</script>

<template>
  <MoleculeKeypad
    :label="t('entryPad.label', { field: props.fieldLabel })"
    :backspace-label="t('entryPad.backspace')"
    :action-label="props.actionLabel"
    :extra-key="props.extraKey"
    @press="handlePress"
  />
</template>
