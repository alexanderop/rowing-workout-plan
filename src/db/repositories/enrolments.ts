import { Clock, Context, Effect, Layer } from 'effect'
import type { PlanEnrolment, PlanEnrolmentDraft } from '../converters'
import { decodeEnrolmentDraft, decodeStoredEnrolment, toEnrolment } from '../converters'
import { DatabaseError, EnrolmentInvalidError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'
import { draftValidator, inMemoryTable, rowDecoder, tryDb } from './support'

export type { PlanEnrolmentDraft } from '../converters'

const validateDraft = draftValidator(
  decodeEnrolmentDraft,
  (message) => new EnrolmentInvalidError({ message }),
)

const decodeRow = rowDecoder('decode enrolment row', decodeStoredEnrolment, toEnrolment)

/** See `BenchmarksRepo`'s `buildBenchmark` — both layers mint a row the same way. */
const buildEnrolment = (
  generateId: () => string,
): ((draft: PlanEnrolmentDraft) => Effect.Effect<PlanEnrolment, EnrolmentInvalidError>) =>
  Effect.fn('EnrolmentsRepo.build')(function* (draft: PlanEnrolmentDraft) {
    const valid = yield* validateDraft(draft)
    const now = yield* Clock.currentTimeMillis
    return { id: generateId(), planId: valid.planId, startedAt: now, active: true }
  })

/** The invariant, as a rewrite of every row already in the table. */
const deactivated = (row: PlanEnrolment): PlanEnrolment => ({ ...row, active: false })

/**
 * Enrolments: which plan a rower is on.
 *
 * `create` deactivates every other enrolment in the same transaction rather
 * than leaving that to a caller. "At most one plan is active" is an invariant
 * of the table, not a step in an onboarding flow — a second screen that
 * enrols without remembering the deactivation would leave two active plans
 * and no way to tell which one the Today tab means.
 */
export class EnrolmentsRepo extends Context.Service<
  EnrolmentsRepo,
  {
    list: () => Effect.Effect<Array<PlanEnrolment>, DatabaseError>
    create: (
      draft: PlanEnrolmentDraft,
    ) => Effect.Effect<PlanEnrolment, DatabaseError | EnrolmentInvalidError>
    remove: (id: string) => Effect.Effect<void, DatabaseError>
    /** Overwrites rows with matching ids — the import primitive. */
    putMany: (rows: ReadonlyArray<PlanEnrolment>) => Effect.Effect<void, DatabaseError>
    /** Empties the table — the delete-everything primitive. */
    clear: () => Effect.Effect<void, DatabaseError>
  }
>()('vue-pwa-starter/db/EnrolmentsRepo') {
  static readonly layer = Layer.effect(
    EnrolmentsRepo,
    Effect.gen(function* () {
      const build = buildEnrolment(yield* GenerateId)

      return EnrolmentsRepo.of({
        list: Effect.fn('EnrolmentsRepo.list')(function* () {
          const stored = yield* tryDb('list enrolments', () => db.enrolments.toArray())
          return yield* Effect.forEach(stored, decodeRow)
        }),

        create: Effect.fn('EnrolmentsRepo.create')(function* (draft: PlanEnrolmentDraft) {
          const enrolment = yield* build(draft)
          // The transaction callback stays pure Dexie — foreign promises (and
          // Effect yields) inside it would break the transaction.
          yield* tryDb('create enrolment', () =>
            db.transaction('rw', db.enrolments, async () => {
              await db.enrolments.toCollection().modify({ active: false })
              await db.enrolments.add(enrolment)
            }),
          )
          return enrolment
        }),

        remove: Effect.fn('EnrolmentsRepo.remove')(function* (id: string) {
          yield* tryDb('delete enrolment', async () => {
            await db.enrolments.delete(id)
          })
        }),

        /**
         * Import path. Every existing row is deactivated in the same
         * transaction as the write, so a restore cannot leave the table with
         * two active enrolments — which is what a plain `bulkPut` did: the
         * backup's active row landed beside the local one, both claiming to
         * be the plan you are on, and which of them a screen showed came down
         * to the order Dexie happened to return random UUIDs in.
         *
         * The backup wins, because that is what restoring one means.
         */
        putMany: Effect.fn('EnrolmentsRepo.putMany')(function* (
          rows: ReadonlyArray<PlanEnrolment>,
        ) {
          yield* tryDb('bulk import enrolments', async () => {
            await db.transaction('rw', db.enrolments, async () => {
              await db.enrolments.toCollection().modify({ active: false })
              await db.enrolments.bulkPut([...rows])
            })
          })
        }),

        clear: Effect.fn('EnrolmentsRepo.clear')(function* () {
          yield* tryDb('clear enrolments', () => db.enrolments.clear())
        }),
      })
    }),
  )

  /**
   * The in-memory fake. `create` is the only operation with a semantic of its
   * own to keep: the deactivation rides along as `insert`'s rewrite, so the
   * fake enforces the one-active invariant in a single `Ref.update` the way
   * the real one enforces it in a single transaction.
   */
  static readonly testLayer = Layer.effect(
    EnrolmentsRepo,
    Effect.gen(function* () {
      const table = yield* inMemoryTable<PlanEnrolment>('EnrolmentsRepo')
      const build = buildEnrolment(yield* GenerateId)

      return EnrolmentsRepo.of({
        ...table,

        create: Effect.fn('EnrolmentsRepo.Test.create')(function* (draft: PlanEnrolmentDraft) {
          const enrolment = yield* build(draft)
          yield* table.insert(enrolment, deactivated)
          return enrolment
        }),

        // The fake used not to deactivate on import, which made it the one
        // place the one-active invariant did not hold — so the only tier that
        // could catch a double-active restore was the browser one, against
        // real IndexedDB. It holds here now, and `unit/db/backup.spec.ts`
        // asserts it in 100 ms.
        putMany: Effect.fn('EnrolmentsRepo.Test.putMany')(function* (
          rows: ReadonlyArray<PlanEnrolment>,
        ) {
          yield* table.putMany(rows, deactivated)
        }),
      })
    }),
  )
}

export const listEnrolments = EnrolmentsRepo.use((repo) => repo.list())

export const enrolInPlan = (draft: PlanEnrolmentDraft) =>
  EnrolmentsRepo.use((repo) => repo.create(draft))

export const deleteEnrolment = (id: string) => EnrolmentsRepo.use((repo) => repo.remove(id))
