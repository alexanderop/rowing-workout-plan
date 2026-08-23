<script setup lang="ts">
import { Delete } from '@lucide/vue'
import type { HTMLAttributes } from 'vue'
import AtomButton from '@/components/atoms/AtomButton.vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  /** Accessible name for the complete pad. */
  label: string
  /** Localized name for the destructive icon key. */
  backspaceLabel: string
  /** Localized text for the tall key beside the digits. */
  actionLabel: string
  /** A field-specific shortcut such as `00` or `000`. */
  extraKey: string
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  press: [key: string]
}>()

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
</script>

<template>
  <div
    data-slot="keypad"
    role="group"
    :aria-label="props.label"
    :class="cn('grid grid-cols-[minmax(0,1fr)_4rem] gap-2', props.class)"
  >
    <div class="grid grid-cols-3 gap-2">
      <AtomButton
        v-for="digit in DIGITS"
        :key="digit"
        type="button"
        variant="outline"
        class="h-13 p-0 text-lg tabular-nums pointer-fine:h-13"
        @pointerdown.prevent
        @click="emit('press', digit)"
      >
        {{ digit }}
      </AtomButton>
      <AtomButton
        type="button"
        variant="outline"
        class="h-13 p-0 text-lg tabular-nums pointer-fine:h-13"
        @pointerdown.prevent
        @click="emit('press', props.extraKey)"
      >
        {{ props.extraKey }}
      </AtomButton>
      <AtomButton
        type="button"
        variant="outline"
        class="col-span-2 h-13 p-0 text-lg tabular-nums pointer-fine:h-13"
        @pointerdown.prevent
        @click="emit('press', '0')"
      >
        0
      </AtomButton>
    </div>

    <div class="grid grid-rows-[3.25rem_1fr] gap-2">
      <AtomButton
        type="button"
        variant="outline"
        class="h-13 p-0 pointer-fine:h-13"
        :aria-label="props.backspaceLabel"
        @pointerdown.prevent
        @click="emit('press', 'backspace')"
      >
        <Delete />
      </AtomButton>
      <AtomButton
        type="button"
        class="h-auto min-h-13 px-2 pointer-fine:h-auto"
        @pointerdown.prevent
        @click="emit('press', 'action')"
      >
        {{ props.actionLabel }}
      </AtomButton>
    </div>
  </div>
</template>
