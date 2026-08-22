import type { ShallowRef } from 'vue'
import { shallowRef } from 'vue'
import { useDocumentVisibility, useEventListener } from '@vueuse/core'
import { watch } from 'vue'

/**
 * The wall clock, re-read whenever the app comes back to the foreground.
 *
 * The screens that group by day or by week take `now` as a parameter — that
 * is what makes the grouping in `history.ts` testable at any date rather than
 * only on the day the suite runs. Reading it once at setup made that honest
 * and the shell wrong: an installed PWA resumed from the app switcher never
 * navigates, so after midnight Today showed yesterday's date, and after
 * Monday 00:00 the Log's "This week" heading was a week behind.
 *
 * Visibility rather than an interval: the value only matters when someone is
 * looking, and a timer ticking every minute behind a locked screen is work
 * nobody asked for. `pageshow` covers the back/forward cache, which restores
 * a page without ever changing visibility.
 *
 * Returns the ref itself rather than an object — one value, so the call site
 * picks the name (docs/composables.md).
 */
export function useNow(): ShallowRef<number> {
  const now = shallowRef(Date.now())

  const refresh = (): void => {
    now.value = Date.now()
  }

  const visibility = useDocumentVisibility()
  watch(visibility, (state) => {
    if (state === 'visible') refresh()
  })

  useEventListener(globalThis.window, 'pageshow', refresh)

  return now
}
