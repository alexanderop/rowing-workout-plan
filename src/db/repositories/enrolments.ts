import { Clock, Context, Effect, Layer, Ref } from 'effect'
import type { PlanEnrolment, PlanEnrolmentDraft } from '../converters'
import { decodeEnrolmentDraft, decodeStoredEnrolment, toEnrolment } from '../converters'
import { DatabaseError, EnrolmentInvalidError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'
import { tryDb } from './support'

export type { PlanEnrolmentDraft } from '../converters'

const validateDraft = (
  draft: PlanEnrolmentDraft,
): Effect.Effect<PlanEnrolmentDraft, EnrolmentInvalidError> =>
  decodeEnrolmentDraft(draft).pipe(
    Effect.mapError((error) => new EnrolmentInvalidError({ message: error.message })),
  )

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself
const decodeRow = (stored: unknown): Effect.Effect<PlanEnrolment, DatabaseError> =>
  decodeStoredEnrolment(stored).pipe(
    Effect.mapError((cause) => new DatabaseError({ operation: 'decode enrolment row', cause })),
    Effect.map(toEnrolment),
  )

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
  }
>()('vue-pwa-starter/db/EnrolmentsRepo') {
  static readonly layer = Layer.effect(
    EnrolmentsRepo,
    Effect.gen(function* () {
      const generateId = yield* GenerateId

      return EnrolmentsRepo.of({
        list: Effect.fn('EnrolmentsRepo.list')(function* () {
          const stored = yield* tryDb('list enrolments', () => db.enrolments.toArray())
          return yield* Effect.forEach(stored, decodeRow)
        }),

        create: Effect.fn('EnrolmentsRepo.create')(function* (draft: PlanEnrolmentDraft) {
          const valid = yield* validateDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const enrolment: PlanEnrolment = {
            id: generateId(),
            planId: valid.planId,
            startedAt: now,
            active: true,
          }
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
      })
    }),
  )

  /** See `BenchmarksRepo.testLayer` — same contract, same semantics. */
  static readonly testLayer = Layer.effect(
    EnrolmentsRepo,
    Effect.gen(function* () {
      const rows = yield* Ref.make<ReadonlyMap<string, PlanEnrolment>>(new Map())
      const generateId = yield* GenerateId

      return EnrolmentsRepo.of({
        list: Effect.fn('EnrolmentsRepo.Test.list')(function* () {
          return [...(yield* Ref.get(rows)).values()]
        }),

        create: Effect.fn('EnrolmentsRepo.Test.create')(function* (draft: PlanEnrolmentDraft) {
          const valid = yield* validateDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const enrolment: PlanEnrolment = {
            id: generateId(),
            planId: valid.planId,
            startedAt: now,
            active: true,
          }
          yield* Ref.update(rows, (current) => {
            const next = new Map<string, PlanEnrolment>()
            for (const [id, row] of current) next.set(id, { ...row, active: false })
            return next.set(enrolment.id, enrolment)
          })
          return enrolment
        }),

        remove: Effect.fn('EnrolmentsRepo.Test.remove')(function* (id: string) {
          yield* Ref.update(rows, (current) => {
            const next = new Map(current)
            next.delete(id)
            return next
          })
        }),

        putMany: Effect.fn('EnrolmentsRepo.Test.putMany')(function* (
          incoming: ReadonlyArray<PlanEnrolment>,
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

export const listEnrolments = EnrolmentsRepo.use((repo) => repo.list())

export const enrolInPlan = (draft: PlanEnrolmentDraft) =>
  EnrolmentsRepo.use((repo) => repo.create(draft))

export const deleteEnrolment = (id: string) => EnrolmentsRepo.use((repo) => repo.remove(id))
