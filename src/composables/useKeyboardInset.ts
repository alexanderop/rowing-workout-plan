import { useEventListener, useSupported } from '@vueuse/core'
import type { ComputedRef, ShallowRef } from 'vue'
import { shallowRef } from 'vue'

/**
 * Pinch-zoom shrinks `visualViewport.height` exactly like a keyboard does, so
 * a zoomed page would otherwise report a huge phantom inset. Anything above
 * this scale is treated as "the user zoomed", not "the keyboard opened".
 */
const MAX_UNZOOMED_SCALE = 1.05

interface UseKeyboardInsetReturn {
  /**
   * Keyboard height in CSS pixels — 0 when it is closed, when the page is
   * pinch-zoomed, and when `visualViewport` is missing entirely.
   */
  inset: ShallowRef<number>
  /**
   * Whether this browser has a `visualViewport` to measure. When false the
   * composable is inert: `inset` stays 0 and `--keyboard-inset` is never
   * written, so the `var(--keyboard-inset, 0px)` fallback is what sheets get.
   */
  isSupported: ComputedRef<boolean>
}

/**
 * One reading of the viewport, into the ref and onto `<html>`.
 *
 * Outside the composable, taking both the ref and the viewport as parameters:
 * the shell budget in eslint.config.ts is what forces the question, and the
 * answer is that measuring does not need the closure. It also means the `if`
 * below narrows `visualViewport` once, for both call sites, instead of
 * asserting non-null inside a callback that runs much later.
 */
function writeInset(inset: ShallowRef<number>, target: VisualViewport): void {
  const zoomed = target.scale > MAX_UNZOOMED_SCALE
  const height = globalThis.innerHeight - target.height - target.offsetTop
  inset.value = zoomed ? 0 : Math.round(Math.max(0, height))
  document.documentElement.style.setProperty('--keyboard-inset', `${inset.value}px`)
}

/**
 * Tracks the on-screen keyboard height as a `--keyboard-inset` CSS variable
 * on <html>. Bottom sheets position themselves above the keyboard with
 * `bottom: var(--keyboard-inset, 0px)` — see molecules/dialog/MoleculeDialogContent.vue.
 *
 * Call once from App.vue. The CSS variable is the product; the returned
 * `inset` is the same number without a `getComputedStyle` round-trip, and is
 * what makes the measurement assertable on its own.
 */
export function useKeyboardInset(): UseKeyboardInsetReturn {
  const inset = shallowRef(0)
  const isSupported = useSupported(() => Boolean(globalThis.visualViewport))
  const viewport = globalThis.visualViewport

  if (viewport) {
    // `scroll` matters as much as `resize`: iOS pans the visual viewport when
    // the keyboard opens, changing `offsetTop` without ever firing a resize.
    // `useEventListener` — never a bare `addEventListener` — because it hangs
    // the removal off the caller's effect scope.
    useEventListener(viewport, ['resize', 'scroll'], () => writeInset(inset, viewport))
    writeInset(inset, viewport)
  }

  return { inset, isSupported }
}
