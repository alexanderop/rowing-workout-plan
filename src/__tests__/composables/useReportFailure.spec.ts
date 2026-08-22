import { Effect, Logger, type Record, References } from 'effect'
import { expect } from 'vitest'
import { useReportFailure } from '@/composables/useReportFailure'
import { useToastStore } from '@/stores/toast'
import { it as base } from '../fixtures'

interface LogEntry {
  readonly level: string
  /**
   * Effect's own type for the annotation map, not a restatement of it: any
   * program on the fiber may annotate with anything, so this really is an
   * open dictionary and `Record<string, unknown>` written out here would be
   * both a lint error and a second copy of a contract we do not own.
   */
  readonly annotations: Record.ReadonlyRecord<string, unknown>
}

/**
 * A logger in place of the default one, for the length of one program.
 *
 * Two jobs, and the second is not optional. The annotations are the point of
 * the composable — one helper rather than one per component, so every reported
 * failure carries the same keys — and reading them back is the only way to say
 * so. But `Effect.logError` also reaches `console.error` through the default
 * logger, and the console gate turns that into a failure the spec did not ask
 * for. `Logger.layer` *replaces* the logger set rather than adding to it, so
 * providing this one both captures the entry and keeps it off the console.
 *
 * Not a test double: swapping a service implementation is the seam Effect is
 * built around. The program is the real one, run for real.
 */
const it = base.extend('logs', async () => {
  const entries: Array<LogEntry> = []

  const logger = Logger.make<unknown, void>((options) => {
    entries.push({
      level: options.logLevel,
      annotations: { ...options.fiber.getRef(References.CurrentLogAnnotations) },
    })
  })

  return { entries, layer: Logger.layer([logger]) }
})

/**
 * `useToastStore` reaches for the atom registry through `inject`, which makes
 * this the shape the bare-call style cannot reach at all: with no component
 * instance there is nothing to inject from, and `@effect/atom-vue` quietly
 * falls back to its own module-scoped `defaultRegistry` — shared by every spec
 * in the process, so the toasts from one test show up in the next. `withSetup`
 * provides a fresh registry per mount, the same way `renderApp` does.
 *
 * Both composables are mounted in one setup on purpose: they have to see the
 * *same* registry, which is exactly how a component uses them.
 */
it('tells the user and annotates the log with its boundary', async ({ logs, mountComposable }) => {
  const { result } = mountComposable(() => ({
    reportFailure: useReportFailure('notes'),
    toast: useToastStore(),
  }))

  const recover = result.reportFailure('delete note', 'Could not delete the note')
  await Effect.runPromise(recover({ _tag: 'DatabaseError' }).pipe(Effect.provide(logs.layer)))

  // The half a user experiences.
  expect(result.toast.toasts).toMatchObject([{ message: 'Could not delete the note' }])

  // The half a developer reads at 3am. These three keys are the whole reason
  // this is one helper and not a `catchTag` body copied into each component;
  // a component that logged its own shape would not fail anything, which is
  // what makes asserting the schema here worth the logger above.
  expect(logs.entries).toMatchObject([
    {
      level: 'Error',
      annotations: { boundary: 'notes', operation: 'delete note', failure: 'DatabaseError' },
    },
  ])
})

/** The boundary is per-call-site, so it has to travel with the handler. */
it('carries the boundary it was created with', async ({ logs, mountComposable }) => {
  const { result } = mountComposable(() => useReportFailure('settings'))

  const recover = result('export backup', 'Could not export')
  await Effect.runPromise(recover({ _tag: 'BackupError' }).pipe(Effect.provide(logs.layer)))

  expect(logs.entries).toMatchObject([
    { annotations: { boundary: 'settings', operation: 'export backup', failure: 'BackupError' } },
  ])
})
