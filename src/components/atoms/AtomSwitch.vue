<script setup lang="ts">
import type { SwitchRootEmits, SwitchRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SwitchRoot, SwitchThumb, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

/**
 * The model is forwarded, not owned: reka's SwitchRoot already implements
 * `modelValue` / `update:modelValue`, so `defineModel` here would create a
 * second copy of the same state and the two would drift. Consumers still
 * write `v-model` — see docs/ui-components.md on which side owns state.
 */
const props = defineProps<SwitchRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<SwitchRootEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SwitchRoot
    data-slot="switch"
    v-bind="forwarded"
    :class="
      cn(
        'peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        props.class,
      )
    "
  >
    <SwitchThumb
      data-slot="switch-thumb"
      class="pointer-events-none block size-5 rounded-full bg-background shadow-lg transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5"
    />
  </SwitchRoot>
</template>
