<script setup lang="ts">
import type { VariantProps } from 'class-variance-authority'
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cva } from 'class-variance-authority'
import { Primitive } from 'reka-ui'
import { cn } from '@/lib/utils'

/**
 * The base answers a tap, which `hover:` cannot: Tailwind v4 gates every
 * `hover:` behind `@media (hover: hover)`, so on a phone the variant styles
 * below never fire at all and a press used to produce nothing.
 *
 * Three things ride along with the press transform, and none are optional:
 * `transition-colors` cannot animate the press, so the property list widens;
 * `touch-manipulation` drops the ~300ms double-tap-zoom wait; `select-none`
 * stops a long-press turning a button label into a text selection.
 *
 * The list names `scale`, **not** `transform`. Tailwind v4 compiles
 * `scale-[0.97]` to the standalone `scale` property rather than to a
 * `transform: scale(…)`, so a list naming `transform` animates a property
 * that never changes and the press snaps. (`transition-transform` would work
 * — it expands to `transform, translate, scale, rotate` — but an explicit
 * list has to say `scale` itself.) Verified in a browser, not reasoned about.
 *
 * Sizing is written **touch-first and collapsed for a fine pointer**, so the
 * 44px floor is the default and shrinking is the exception a mouse opts into.
 * `pointer-fine:` compiles natively in Tailwind 4 — no config, no
 * `@custom-variant`. See docs/touch-conventions.md.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium select-none touch-manipulation transition-[color,background-color,box-shadow,scale] duration-100 active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
      },
      size: {
        default: 'h-touch-target px-4 py-2 pointer-fine:h-10',
        sm: 'h-touch-target rounded-md px-3 pointer-fine:h-9',
        lg: 'h-12 rounded-md px-6 pointer-fine:h-11',
        icon: 'size-touch-target pointer-fine:size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonVariants = VariantProps<typeof buttonVariants>

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
})

defineSlots<{
  default: () => unknown
}>()
</script>

<template>
  <Primitive
    data-slot="button"
    :data-variant="props.variant"
    :data-size="props.size"
    :as="props.as"
    :as-child="props.asChild"
    :class="cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
