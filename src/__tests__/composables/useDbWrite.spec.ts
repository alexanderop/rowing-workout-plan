import { Effect } from 'effect'
import { expect } from 'vitest'
import { useDbWrite } from '@/composables/useDbWrite'
import type { DbProgram } from '@/db'
import { it } from '../fixtures'

/**
 * The composable exists for the guard, so the guard is what is asserted: a
 * second write started while one is in flight is dropped, and the flag comes
 * back down however the program ends.
 *
 * Browser tier rather than unit, because `useAtomSet` needs a component
 * instance and a registry — `mountComposable` provides both. The programs
 * here are plain Effects rather than repository calls: what is under test is
 * the guard around a write, not any particular write. (An `Effect<A, never,
 * never>` is a `DbProgram`; requiring nothing satisfies requiring anything.)
 */

/** A program held open, with the handle to let it finish and the run count. */
interface HeldProgram {
  readonly program: DbProgram
  /** Lets the program complete. */
  readonly release: () => void
  /** How many times the program's body has actually run. */
  readonly runs: () => number
}

/** A program that does not finish until the returned `release` is called. */
function heldProgram(): HeldProgram {
  let count = 0
  let open!: () => void
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })

  return {
    program: Effect.promise(() => gate).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          count += 1
        }),
      ),
    ),
    release: () => open(),
    runs: () => count,
  }
}

it('drops a second write started while the first is still in flight', async ({
  mountComposable,
}) => {
  const { result } = mountComposable(() => useDbWrite())
  const { program, release, runs } = heldProgram()

  // Two taps in one tick — the double tap on Save, or on a plan card whose
  // whole surface is the button.
  const first = result.write(program)
  const second = result.write(program)

  expect(result.isWriting.value).toBe(true)

  release()
  await Promise.all([first, second])

  expect(runs()).toBe(1)
  expect(result.isWriting.value).toBe(false)
})

it('lets the next write through once the first has landed', async ({ mountComposable }) => {
  const { result } = mountComposable(() => useDbWrite())
  const first = heldProgram()

  const inFlight = result.write(first.program)
  first.release()
  await inFlight

  const second = heldProgram()
  const next = result.write(second.program)
  second.release()
  await next

  expect(second.runs()).toBe(1)
})

it('rethrows a defect, and releases the guard, when the program dies', async ({
  mountComposable,
}) => {
  const { result } = mountComposable(() => useDbWrite())

  // A defect, not a typed failure: those are handled inside the program before
  // it ever reaches `write`. `Effect.ensuring` is what covers this branch, and
  // it is the reason the release is not simply written after the await —
  // without it the sheet's Save button stays disabled for the life of the
  // screen the first time a write dies.
  await expect(
    result.write(
      Effect.sync(() => {
        throw new Error('the write blew up')
      }),
    ),
  ).rejects.toThrow('the write blew up')

  expect(result.isWriting.value).toBe(false)
})

it('rethrows a defect that is undefined, which no sentinel could tell apart', async ({
  mountComposable,
}) => {
  const { result } = mountComposable(() => useDbWrite())
  let rejected = false

  // `Effect.die` takes anything. Capturing the defect in a variable and
  // testing it against `undefined` would call this one a success.
  await result.write(Effect.die(undefined)).catch(() => {
    rejected = true
  })

  expect(rejected).toBe(true)
  expect(result.isWriting.value).toBe(false)
})
