<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NumericInputOptions } from '@/lib/numericInput'
import AtomLabel from '@/components/atoms/AtomLabel.vue'
import { cn } from '@/lib/utils'
import {
  MoleculeNumericInput,
  MoleculeNumericInputBody,
  MoleculeNumericInputCancel,
  MoleculeNumericInputConfirm,
  MoleculeNumericInputContent,
  MoleculeNumericInputControls,
  MoleculeNumericInputDescription,
  MoleculeNumericInputDisplay,
  MoleculeNumericInputHandle,
  MoleculeNumericInputHeader,
  MoleculeNumericInputKeypad,
  MoleculeNumericInputPresets,
  MoleculeNumericInputTitle,
  MoleculeNumericInputTrigger,
} from './numeric-input'

/**
 * A labelled number, and the pad that edits it.
 *
 * The compound primitive beside this file is fourteen parts so that a screen
 * can arrange them; every number in this app wants the same arrangement, and
 * four hand-assembled copies of it is four chances for one field to behave
 * unlike its neighbour. Assembling it once is what makes "every number is
 * entered the same way" a fact about the code rather than a habit.
 *
 * Zero is the empty value: a field nobody has filled shows its placeholder
 * rather than a `0` that reads like an answer.
 */
const props = defineProps<{
  /** Ids the label, the trigger and the message below it. */
  id: string
  /** The visible label above the field. */
  label: string
  /** Names the pad's dialog. */
  title: string
  /** Says what the pad is for, for a screen reader. */
  description: string
  /** Shown in place of a value while the field is still empty. */
  placeholder: string
  /** Rendered beside the number, in the pad and on the trigger alike. */
  unit?: string
  options?: NumericInputOptions
  /** Suggested values. Absent means the field offers none. */
  presets?: ReadonlyArray<number>
  /** A note under the field. */
  hint?: string
  /** A note under the field that says something is wrong. Wins over `hint`. */
  error?: string
  class?: HTMLAttributes['class']
}>()

const model = defineModel<number>({ required: true })

const { t } = useI18n()

defineSlots<{
  /** Appended to the visible label — "(optional)" and the like. */
  label?: () => unknown
}>()
</script>

<template>
  <div data-slot="number-field" :class="cn('flex flex-col gap-2', props.class)">
    <AtomLabel :id="`${props.id}-label`">
      {{ props.label }}
      <slot name="label" />
    </AtomLabel>

    <MoleculeNumericInput v-model="model" :options="props.options" :presets="props.presets">
      <MoleculeNumericInputTrigger
        :id="props.id"
        :aria-labelledby="`${props.id}-label ${props.id}`"
        :aria-describedby="(props.error ?? props.hint) ? `${props.id}-message` : undefined"
        :aria-invalid="props.error !== undefined"
      >
        <template #default="{ value, formattedValue }">
          <!-- The placeholder is shown and not announced: a screen reader
               told "10000" has been told a value this field does not hold. -->
          <span v-if="value === 0" class="text-muted-foreground" aria-hidden="true">
            {{ props.placeholder }}
          </span>
          <span v-if="value === 0" class="sr-only">{{ t('numericInput.empty') }}</span>
          <span v-else>{{ formattedValue }}</span>
          <span v-if="props.unit" class="text-muted-foreground" :aria-hidden="value === 0">
            {{ props.unit }}
          </span>
        </template>
      </MoleculeNumericInputTrigger>

      <MoleculeNumericInputContent>
        <MoleculeNumericInputHandle />
        <MoleculeNumericInputBody>
          <MoleculeNumericInputHeader>
            <MoleculeNumericInputCancel />
            <MoleculeNumericInputTitle>{{ props.title }}</MoleculeNumericInputTitle>
            <span aria-hidden="true" />
          </MoleculeNumericInputHeader>
          <MoleculeNumericInputDescription>{{ props.description }}</MoleculeNumericInputDescription>

          <MoleculeNumericInputPresets v-if="props.presets?.length" :unit="props.unit" />

          <MoleculeNumericInputControls>
            <div class="flex items-center gap-3">
              <MoleculeNumericInputDisplay :unit="props.unit" />
              <MoleculeNumericInputConfirm />
            </div>
            <MoleculeNumericInputKeypad />
          </MoleculeNumericInputControls>
        </MoleculeNumericInputBody>
      </MoleculeNumericInputContent>
    </MoleculeNumericInput>

    <p
      v-if="props.error ?? props.hint"
      :id="`${props.id}-message`"
      :class="
        props.error === undefined ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'
      "
    >
      {{ props.error ?? props.hint }}
    </p>
  </div>
</template>
