import { useMediaQuery } from '@vueuse/core'
import type { ComputedRef } from 'vue'

/**
 * Coarse-pointer detection. Used to adapt focus/keyboard behavior on touch
 * devices (e.g. not auto-focusing inputs while a sheet is still animating).
 *
 * One value, so it returns the ref itself rather than an object holding it —
 * the shape `useMediaQuery` already has, and the shape a caller can rename at
 * the call site. See docs/composables.md for when the object is the right
 * answer instead.
 */
export function useTouchDevice(): ComputedRef<boolean> {
  return useMediaQuery('(pointer: coarse)')
}
