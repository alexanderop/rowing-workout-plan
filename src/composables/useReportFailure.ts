import { Effect } from 'effect'
import { useToastStore } from '@/stores/toast'

/**
 * The failure branch every db-composing component shares: a structured log
 * for the developer, a toast for the user. The handler returns an Effect, so
 * recovery is part of the program rather than something that happens beside
 * it — and `Effect.logError` keeps the entry inside the program, on the fiber
 * and the span `Effect.fn` opened around the operation, which `console.error`
 * in an `Effect.sync` would step outside of.
 *
 * One helper rather than one per component so the log schema cannot drift:
 * every reported failure carries the same `boundary` / `operation` /
 * `failure` keys.
 *
 * Usage: `const reportFailure = useReportFailure('settings')`, then hand
 * `reportFailure('export backup', t('settings.data.exportError'))` to
 * `Effect.catchTag`/`Effect.catchTags`.
 */
export function useReportFailure(
  boundary: string,
): (
  operation: string,
  message: string,
) => (error: { readonly _tag: string }) => Effect.Effect<void> {
  const toast = useToastStore()

  return (operation, message) => (error) =>
    Effect.logError(error).pipe(
      Effect.annotateLogs({ boundary, operation, failure: error._tag }),
      Effect.andThen(Effect.sync(() => toast.showToast(message))),
    )
}
