import { useAtomSet } from '@effect/atom-vue'
import { Effect } from 'effect'
import type { ShallowRef } from 'vue'
import { shallowRef } from 'vue'
import type { DbProgram } from '@/db'
import { dbMutation } from '@/db'

/**
 * The write edge every screen that persists something reaches for, with the
 * in-flight guard attached.
 *
 * `dbMutation` on its own does not stop a second tap from starting a second
 * write — `concurrent: true` is there so a slow write is not *interrupted* by
 * the next one, which is the opposite problem. The guard is the component's
 * job, and it was being written out per component: a `ref(false)`, set before
 * the first `await`, released in an `Effect.ensuring` piped on *outermost* so
 * an interrupt releases it too. Two of the four call sites had it. The two
 * that did not (enrolling in a plan, wiping the database) would each run
 * twice on a double tap.
 *
 * So the guard moves here, where the ordering that makes it work — set
 * synchronously before any await, released by `ensuring` outside every
 * `catchTag` — is written once and cannot be piped on in the wrong order by
 * the next caller.
 *
 * What stays with the caller is the part that is genuinely theirs: which
 * program to run, what to say when it lands, and which tagged failures it can
 * produce. `write` takes a program whose failures are already handled, exactly
 * as `dbMutation` does, so an unhandled `DatabaseError` is still a type error
 * at the call site rather than a runtime surprise here.
 *
 * The other thing it owns is the defect. Every caller's comment claimed the
 * mutation promise "rejects only on a defect, which Vue routes to
 * `app.config.errorHandler`" — it does not: the fn atom resolves with
 * `undefined` and the defect is gone. No rejection, so neither the handler nor
 * the `unhandledrejection` backstop in `main.ts` fires, and nothing reaches
 * the console. A crash mid-write was silent, in an app whose whole promise is
 * that your data is on your device. So the defect is caught inside the program
 * and rethrown out of `write`, which is the contract those comments described
 * and the one `main.ts` is written against.
 */
interface UseDbWriteReturn {
  /** True from the tap until the program settles. Bind it into `disabled`. */
  isWriting: ShallowRef<boolean>
  /**
   * Runs one write, at most one at a time. A call made while another is in
   * flight is dropped, which is what a double tap is.
   *
   * The returned promise resolves when the program settles; it rejects on a
   * defect, which Vue routes to `app.config.errorHandler` for a promise it
   * was handed — so return it from the handler.
   */
  write: (program: DbProgram) => Promise<void>
}

export function useDbWrite(): UseDbWriteReturn {
  const runMutation = useAtomSet(() => dbMutation, { mode: 'promise' })
  const isWriting = shallowRef(false)

  const release = Effect.sync(() => {
    isWriting.value = false
  })

  async function write(program: DbProgram): Promise<void> {
    // Both statements are synchronous and before the first await, so two taps
    // in one tick cannot both get past this.
    if (isWriting.value) return
    isWriting.value = true

    // Caught rather than tapped: the fn atom does not reject on a defect, so
    // observing it inside the program is the only way to still have it out
    // here. `ensuring` is outermost so the guard is released on every branch
    // — success, a handled failure, this one, and an interrupt (which is not
    // a defect, and so is not rethrown).
    //
    // A separate flag rather than testing the captured value: `Effect.die`
    // takes anything, `undefined` included, and a sentinel that a real defect
    // can equal is the silence this whole branch exists to end.
    let died = false
    let defect: unknown
    await runMutation(
      program.pipe(
        Effect.catchDefect((cause) =>
          Effect.sync(() => {
            died = true
            defect = cause
          }),
        ),
        Effect.ensuring(release),
      ),
    )

    // Outside Effect, so it is a rejection of the promise the caller hands
    // back to Vue rather than a second defect nothing is listening for.
    if (died) throw defect
  }

  return { isWriting, write }
}
