<script setup lang="ts">
import type { ProgressRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ProgressIndicator, ProgressRoot, useForwardProps } from 'reka-ui'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

/**
 * How far along something is.
 *
 * Props only, no emits: reka's `ProgressRoot` accepts `update:modelValue`,
 * but a bar is something a consumer *writes to*, never something that
 * reports back, and forwarding an emit nothing raises would only be a lie in
 * the type.
 *
 * `modelValue: null` is reka's indeterminate state, and it is the state this
 * app genuinely starts in — a download whose size is unknown until the first
 * file answers. The track pulses there rather than the bar filling: a full
 * bar would read as finished, and a bar at zero that never moves reads as
 * stuck.
 *
 * The fill is a `translateX` on a full-width child rather than a `width`,
 * because a transform is composited and a width is a layout pass. That is
 * the difference between a bar that keeps moving and one that stutters while
 * the thread it is reporting on is busy — which, here, it always is.
 */
const props = defineProps<ProgressRootProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)

/**
 * The bar's fill as a percentage, whatever scale the consumer's `max` is on.
 * Clamped, and `0` for anything that is not a fraction at all — an
 * indeterminate `null`, or a `max` of zero that divides into infinity.
 * Painting past its own end is the one thing worse than a wrong number.
 */
const filled = computed(() => {
  const ratio = (props.modelValue ?? 0) / (props.max ?? 100)

  return Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) * 100 : 0
})
</script>

<template>
  <ProgressRoot
    data-slot="progress"
    v-bind="forwarded"
    :class="
      cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-secondary data-[state=indeterminate]:animate-pulse',
        props.class,
      )
    "
  >
    <ProgressIndicator
      data-slot="progress-indicator"
      class="h-full w-full flex-1 bg-primary transition-transform duration-300 ease-out"
      :style="{ transform: `translateX(-${100 - filled}%)` }"
    />
  </ProgressRoot>
</template>
