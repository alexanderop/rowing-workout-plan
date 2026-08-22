import { expect, vi } from 'vitest'
import { useNoteAge } from '@/features/notes/useNoteAge'
import { it as base } from '../../fixtures'

/**
 * Fake timers, narrowed to the two clocks this composable actually sits
 * between: the `setInterval` `useTimestamp` schedules, and the `Date` that
 * Effect's default Clock reads inside `noteAge`. Faking the rest would reach
 * into the browser runner's own timing for no gain.
 *
 * A double is fine here — the ban in docs/functional-core.md is on the unit
 * tier, and it is the *core* that has to be reachable without one. `noteAge`
 * proves that already: `src/__tests__/unit/notes/domain.spec.ts` walks every
 * bucket boundary with `TestClock` and no fake timers at all. What is left
 * for this file is the only thing the composable adds — *when* the program is
 * re-run — and a clock is the subject of that claim, not a stand-in for a
 * collaborator it could not call.
 */
const it = base.extend('clock', async ({}, { onCleanup }) => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  onCleanup(() => {
    vi.useRealTimers()
  })

  return {
    advance: (ms: number): void => {
      vi.advanceTimersByTime(ms)
    },
    /** How many intervals are still scheduled — with `toFake` this narrow, ours. */
    scheduled: (): number => vi.getTimerCount(),
  }
})

/**
 * The bucket boundaries are not retested here on purpose. They belong to
 * `noteAge`, they are pinned in the unit tier in ~100 ms, and the split is the
 * point: the module owns *what* the age is, the composable owns *when* it is
 * asked again.
 */
it('ages a note that is already on screen', ({ clock, mountComposable }) => {
  const updatedAt = Date.now()
  const { result: age } = mountComposable(() => useNoteAge(() => updatedAt))

  expect(age.value).toEqual({ unit: 'justNow' })

  // No re-render, no new props: a card left open crosses the minute boundary
  // and relabels itself, which is the whole reason this is a composable and
  // not a `computed` in NoteCard.vue.
  clock.advance(60_000)

  expect(age.value).toEqual({ unit: 'minutes', count: 1 })
})

/**
 * The claim that only holds inside a component instance, and the reason a list
 * of 30 cards is not 30 timers: the ticker is a `createSharedComposable`, so
 * the interval is refcounted and stops when the **last** caller unmounts. That
 * refcount is decremented from `tryOnScopeDispose` — with no scope it is never
 * decremented at all, and every card ever scrolled past keeps a 30-second
 * timer alive for the life of the tab.
 *
 * The evidence is the scheduler, not the value. The tempting version of this
 * test — unmount, advance a minute, assert the age is still `justNow` — fails
 * even when the interval *is* cleared: a computed nothing subscribes to any
 * more is not frozen, it just recomputes on the next read, and `noteAge` then
 * sees the advanced clock. A leaked interval is a fact about what is still
 * scheduled, so that is what gets asserted.
 */
it('stops ticking once the card that showed it goes away', ({ clock, mountComposable }) => {
  const updatedAt = Date.now()
  const { unmount } = mountComposable(() => useNoteAge(() => updatedAt))

  // One 30-second interval, and it belongs to the component that asked for it.
  expect(clock.scheduled()).toBe(1)

  unmount()

  expect(clock.scheduled()).toBe(0)
})
