import { Clock, Context, Effect, Layer, Ref } from 'effect'
import type { Benchmark, BenchmarkDraft } from '../converters'
import { decodeBenchmarkDraft, decodeStoredBenchmark, toBenchmark } from '../converters'
import { BenchmarkInvalidError, DatabaseError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'
import { tryDb } from './support'

export type { BenchmarkDraft } from '../converters'

/**
 * Normalizes and validates a draft. Both layers run it, so the in-memory fake
 * cannot accept a benchmark the real repository would reject.
 */
const validateDraft = (
  draft: BenchmarkDraft,
): Effect.Effect<BenchmarkDraft, BenchmarkInvalidError> =>
  decodeBenchmarkDraft(draft).pipe(
    Effect.mapError((error) => new BenchmarkInvalidError({ message: error.message })),
  )

/**
 * Turns one row off disk into a domain benchmark, validating it on the way.
 *
 * A row that fails is a `DatabaseError` rather than a tag of its own: the only
 * honest response to "the store handed back something that is not a benchmark"
 * is the same as to "the store would not answer". The `SchemaError` rides
 * along as the cause, so the console still says which field was wrong.
 *
 * One bad row fails the whole read, deliberately. `StoredDbBenchmark` already
 * accepts every shape this app has ever written, so a row that misses it is
 * damaged rather than merely old — and quietly dropping it would show the user
 * a short list they might then export over their last good backup.
 */
// IndexedDB is untrusted input by this project's rules; `decodeStoredBenchmark`
// below is the parse `no-unknown-parameters` asks for, and this is its input.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself
const decodeRow = (stored: unknown): Effect.Effect<Benchmark, DatabaseError> =>
  decodeStoredBenchmark(stored).pipe(
    Effect.mapError((cause) => new DatabaseError({ operation: 'decode benchmark row', cause })),
    Effect.map(toBenchmark),
  )

/**
 * The benchmarks repository as an Effect service: the class is both the DI key
 * and the place the production Layer lives. Only this service touches the
 * Dexie table — everything above it composes the effects it returns.
 */
export class BenchmarksRepo extends Context.Service<
  BenchmarksRepo,
  {
    list: () => Effect.Effect<Array<Benchmark>, DatabaseError>
    create: (
      draft: BenchmarkDraft,
    ) => Effect.Effect<Benchmark, DatabaseError | BenchmarkInvalidError>
    remove: (id: string) => Effect.Effect<void, DatabaseError>
    /** Overwrites rows with matching ids — the import primitive. */
    putMany: (rows: ReadonlyArray<Benchmark>) => Effect.Effect<void, DatabaseError>
  }
>()('vue-pwa-starter/db/BenchmarksRepo') {
  static readonly layer = Layer.effect(
    BenchmarksRepo,
    Effect.gen(function* () {
      const generateId = yield* GenerateId

      return BenchmarksRepo.of({
        list: Effect.fn('BenchmarksRepo.list')(function* () {
          const stored = yield* tryDb('list benchmarks', () => db.benchmarks.toArray())
          return yield* Effect.forEach(stored, decodeRow)
        }),

        create: Effect.fn('BenchmarksRepo.create')(function* (draft: BenchmarkDraft) {
          const valid = yield* validateDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const benchmark: Benchmark = {
            id: generateId(),
            kind: valid.kind,
            timeMs: valid.timeMs,
            recordedAt: now,
          }
          yield* tryDb('create benchmark', () => db.benchmarks.add(benchmark))
          return benchmark
        }),

        remove: Effect.fn('BenchmarksRepo.remove')(function* (id: string) {
          yield* tryDb('delete benchmark', async () => {
            await db.benchmarks.delete(id)
          })
        }),

        putMany: Effect.fn('BenchmarksRepo.putMany')(function* (rows: ReadonlyArray<Benchmark>) {
          yield* tryDb('bulk import benchmarks', async () => {
            await db.benchmarks.bulkPut([...rows])
          })
        }),
      })
    }),
  )

  /**
   * Ref-backed in-memory fake — no IndexedDB, so full programs (exportData,
   * importData, anything composed over the repo) run in the Node unit tier.
   * Semantics mirror the production layer: timestamps come from the Clock
   * service (TestClock in tests), putMany overwrites rows with matching ids.
   */
  static readonly testLayer = Layer.effect(
    BenchmarksRepo,
    Effect.gen(function* () {
      const rows = yield* Ref.make<ReadonlyMap<string, Benchmark>>(new Map())
      const generateId = yield* GenerateId

      return BenchmarksRepo.of({
        list: Effect.fn('BenchmarksRepo.Test.list')(function* () {
          return [...(yield* Ref.get(rows)).values()]
        }),

        create: Effect.fn('BenchmarksRepo.Test.create')(function* (draft: BenchmarkDraft) {
          const valid = yield* validateDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const benchmark: Benchmark = {
            id: generateId(),
            kind: valid.kind,
            timeMs: valid.timeMs,
            recordedAt: now,
          }
          yield* Ref.update(rows, (current) => new Map(current).set(benchmark.id, benchmark))
          return benchmark
        }),

        remove: Effect.fn('BenchmarksRepo.Test.remove')(function* (id: string) {
          yield* Ref.update(rows, (current) => {
            const next = new Map(current)
            next.delete(id)
            return next
          })
        }),

        putMany: Effect.fn('BenchmarksRepo.Test.putMany')(function* (
          incoming: ReadonlyArray<Benchmark>,
        ) {
          yield* Ref.update(rows, (current) => {
            const next = new Map(current)
            for (const row of incoming) next.set(row.id, row)
            return next
          })
        }),
      })
    }),
  )
}

/**
 * Ready-made programs over the repository — this is what `@/db` exposes.
 * Each one is a description, not a running operation: pass it to `runDb`
 * (or compose it further with `Effect.*` first) to execute it.
 */
export const listBenchmarks = BenchmarksRepo.use((repo) => repo.list())

export const recordBenchmark = (draft: BenchmarkDraft) =>
  BenchmarksRepo.use((repo) => repo.create(draft))

export const deleteBenchmark = (id: string) => BenchmarksRepo.use((repo) => repo.remove(id))
