import { Clock, Context, Effect, Layer } from 'effect'
import type { Benchmark, BenchmarkDraft } from '../converters'
import { decodeBenchmarkDraft, decodeStoredBenchmark, toBenchmark } from '../converters'
import { BenchmarkInvalidError, DatabaseError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'
import { draftValidator, inMemoryTable, rowDecoder, tryDb } from './support'

export type { BenchmarkDraft } from '../converters'

const validateDraft = draftValidator(
  decodeBenchmarkDraft,
  (message) => new BenchmarkInvalidError({ message }),
)

const decodeRow = rowDecoder('decode benchmark row', decodeStoredBenchmark, toBenchmark)

/**
 * What a new benchmark row looks like: validate, stamp, mint an id.
 *
 * Shared by both layers rather than written out in each, because "which
 * fields a create fills in" is the one part of a fake that has to match the
 * real thing exactly — a test that passes against a fake stamping its own
 * `recordedAt` proves nothing about the table that does not.
 */
const buildBenchmark = (
  generateId: () => string,
): ((draft: BenchmarkDraft) => Effect.Effect<Benchmark, BenchmarkInvalidError>) =>
  Effect.fn('BenchmarksRepo.build')(function* (draft: BenchmarkDraft) {
    const valid = yield* validateDraft(draft)
    const now = yield* Clock.currentTimeMillis
    return { id: generateId(), kind: valid.kind, timeMs: valid.timeMs, recordedAt: now }
  })

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
    /** Empties the table — the delete-everything primitive. */
    clear: () => Effect.Effect<void, DatabaseError>
  }
>()('vue-pwa-starter/db/BenchmarksRepo') {
  static readonly layer = Layer.effect(
    BenchmarksRepo,
    Effect.gen(function* () {
      const build = buildBenchmark(yield* GenerateId)

      return BenchmarksRepo.of({
        list: Effect.fn('BenchmarksRepo.list')(function* () {
          const stored = yield* tryDb('list benchmarks', () => db.benchmarks.toArray())
          return yield* Effect.forEach(stored, decodeRow)
        }),

        create: Effect.fn('BenchmarksRepo.create')(function* (draft: BenchmarkDraft) {
          const benchmark = yield* build(draft)
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

        clear: Effect.fn('BenchmarksRepo.clear')(function* () {
          yield* tryDb('clear benchmarks', () => db.benchmarks.clear())
        }),
      })
    }),
  )

  /**
   * The in-memory fake — the shared table from `./support`, plus the one
   * operation that is this table's own. Nothing about a benchmark needs more
   * than `inMemoryTable` gives: no ordering, no cross-row invariant.
   */
  static readonly testLayer = Layer.effect(
    BenchmarksRepo,
    Effect.gen(function* () {
      const table = yield* inMemoryTable<Benchmark>('BenchmarksRepo')
      const build = buildBenchmark(yield* GenerateId)

      return BenchmarksRepo.of({
        ...table,

        create: Effect.fn('BenchmarksRepo.Test.create')(function* (draft: BenchmarkDraft) {
          const benchmark = yield* build(draft)
          yield* table.insert(benchmark)
          return benchmark
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
