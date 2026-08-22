import { createSharedComposable, useTimestamp } from '@vueuse/core'
import { Effect } from 'effect'
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from 'vue'
import { computed, toValue } from 'vue'
import type { NoteAge } from './domain'
import { noteAge } from './domain'

/**
 * One ticker for the whole list.
 *
 * `useTimestamp` starts an interval, and a list renders one `useNoteAge` per
 * card — so calling it inside the composable would put N intervals on a page
 * of N notes, each firing at its own offset and re-rendering one card at a
 * time. `createSharedComposable` runs the body once in a detached effect
 * scope, hands every caller the same ref, and stops the interval when the
 * last card unmounts. Sharing the *effect* is what this buys; shared *state*
 * in this app is an atom (docs/index.md), and that split is deliberate.
 *
 * Consequence worth knowing: arguments to a shared composable are only
 * honoured on the first call, which is why the interval is fixed here rather
 * than offered as an option on `useNoteAge`.
 */
const useAgeTicker = createSharedComposable(
  (): ShallowRef<number> => useTimestamp({ interval: 30_000 }),
)

/**
 * Reactive wrapper around the Clock-based `noteAge` program. The split
 * matters: Effect owns what "now" means (which is what makes the bucket
 * logic deterministic under TestClock), while this composable only decides
 * when the UI re-evaluates it — every 30 s, so a card on screen ages from
 * "just now" into "1 min ago" without a reload.
 *
 * `MaybeRefOrGetter` + `toValue`, so a caller can pass a number, a ref, or
 * `() => note.updatedAt` and have the age follow an edit.
 */
export function useNoteAge(updatedAt: MaybeRefOrGetter<number>): ComputedRef<NoteAge> {
  const tick = useAgeTicker()
  return computed(() => {
    // Subscribing to the ticker re-runs the program; the time it sees still
    // comes from the Clock service, not from this timestamp.
    void tick.value
    return Effect.runSync(noteAge(toValue(updatedAt)))
  })
}
