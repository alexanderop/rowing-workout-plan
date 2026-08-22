<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { X } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogClose, DialogContent, DialogPortal, useForwardPropsEmits } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { useTouchDevice } from '@/composables/useTouchDevice'
import { cn } from '@/lib/utils'
import MoleculeDialogOverlay from './MoleculeDialogOverlay.vue'

/**
 * Keyboard-aware dialog content: a bottom sheet on small viewports, a
 * centered dialog from `sm:` up. Mobile-first is the product here, so this
 * is *the* dialog content — there is no separate desktop variant to pick
 * between. Pairs with useKeyboardInset() (App.vue), which keeps
 * `--keyboard-inset` up to date so the sheet sits above the on-screen
 * keyboard instead of underneath it.
 *
 * Portal and overlay are mounted here rather than left to the consumer:
 * every dialog in this app wants both, and forgetting the overlay is a
 * silent accessibility regression rather than a visible mistake.
 */
defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<
    DialogContentProps & {
      class?: HTMLAttributes['class']
      showCloseButton?: boolean
    }
  >(),
  { showCloseButton: true },
)
const emits = defineEmits<DialogContentEmits>()

const { t } = useI18n()

defineSlots<{
  default: () => unknown
}>()

const delegatedProps = reactiveOmit(props, 'class', 'showCloseButton')
const forwarded = useForwardPropsEmits(delegatedProps, emits)

const isTouchDevice = useTouchDevice()

// On touch devices reka-ui's autofocus would focus the first input and pop
// the on-screen keyboard while the sheet is still animating in, racing the
// viewport measurement. Keep focus on the sheet itself; the keyboard opens
// when the user taps a field.
//
// This handler is bound after `v-bind="forwarded"`, so it replaces the
// forwarded one — re-emitting is what keeps a consumer's own
// `@open-auto-focus` listener working.
function handleOpenAutoFocus(event: Event): void {
  emits('openAutoFocus', event)
  if (event.defaultPrevented || !isTouchDevice.value) return
  event.preventDefault()
  if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true })
}
</script>

<template>
  <DialogPortal>
    <MoleculeDialogOverlay />
    <!-- No `pb-6` beside `safe-area-bottom`: two utilities declaring
         padding-bottom at equal specificity hand the decision to generated
         stylesheet order, and the one that was winning resolves to 0px on any
         phone without a home indicator. The floor goes into the utility's
         `--safe-bottom-min` instead, so a single declaration wins by
         construction. -->
    <DialogContent
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'bg-background fixed bottom-[var(--keyboard-inset,0px)] left-0 right-0 z-50 flex w-full flex-col gap-4 overflow-hidden rounded-t-2xl border pt-2 px-4 shadow-lg safe-area-bottom [--safe-bottom-min:1.5rem]',
          'max-h-[calc(100dvh-var(--keyboard-inset,0px))]',
          'data-[state=open]:animate-slide-up-mobile data-[state=closed]:animate-slide-down-mobile',
          'sm:data-[state=open]:animate-in sm:data-[state=closed]:animate-out sm:data-[state=closed]:fade-out-0 sm:data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:duration-200',
          'sm:bottom-auto sm:left-[50%] sm:right-auto sm:top-[50%] sm:max-w-lg sm:max-h-[calc(100vh-4rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:p-6',
          props.class,
        )
      "
      @open-auto-focus="handleOpenAutoFocus"
    >
      <!-- Drag handle (mobile only) -->
      <div class="flex shrink-0 justify-center pb-2 sm:hidden">
        <div class="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
      </div>

      <!-- Scroll region: the sheet is capped at the keyboard-adjusted viewport
           height, so on a landscape phone with the keyboard open there may be
           only ~150px left. Everything but the drag handle scrolls, which is
           what keeps the submit button reachable. `min-h-0` is required — flex
           items default to min-height:auto and would refuse to shrink. -->
      <div
        data-slot="dialog-body"
        class="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-1"
      >
        <slot />
      </div>

      <!-- Close button (desktop only) — on mobile the sheet is dismissed by
           tapping the overlay, and the corner target competes with the drag
           handle. The handle above is a visual grip, not a gesture: reka-ui
           ships a Drawer (DrawerHandle, DrawerSwipeArea, velocity dismissal)
           that would wire it for real, and migrating to it is an API change
           rather than a CSS one. Until then this comment does not promise a
           swipe the sheet does not honor. -->
      <DialogClose
        v-if="showCloseButton"
        data-slot="dialog-close"
        class="ring-offset-background focus:ring-ring absolute top-4 right-4 hidden rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none sm:block [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      >
        <X />
        <span class="sr-only">{{ t('common.buttons.close') }}</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
