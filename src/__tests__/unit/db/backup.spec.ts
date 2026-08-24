import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { decodeBackup, exportData, importData } from '@/db/backup'
import { BackupInvalidError } from '@/db/errors'
import { dbTestLayer } from '@/db/layer'
import { BenchmarksRepo } from '@/db/repositories/benchmarks'
import { EnrolmentsRepo } from '@/db/repositories/enrolments'
import { WorkoutsRepo } from '@/db/repositories/workouts'
import { EMPTY_BACKUP, FULL_BACKUP, V3_BACKUP } from '../../helpers/backup'

/**
 * The backup programs are pure Effect — no IndexedDB, no runtime setup — so
 * the import rules run in the Node unit tier against the repositories'
 * in-memory layers. `it.effect` from @effect/vitest runs the returned Effect
 * for us (with test services such as TestClock provided); failures stay
 * values, promoted into the success channel with `Effect.flip` where a test
 * wants to look at them.
 *
 * The browser tier keeps driving the same programs against real Dexie through
 * the `runDb` promise edge — the two are not redundant, because only that one
 * can tell you the storage engine agrees.
 */
describe('decodeBackup', () => {
  it.effect('accepts a current payload', () =>
    Effect.gen(function* () {
      const payload = yield* decodeBackup(EMPTY_BACKUP)
      expect(payload.app).toBe('vue-pwa-starter')
      expect(payload.exportedAt).toBe(EMPTY_BACKUP.exportedAt)
    }),
  )

  it.effect('accepts a payload carrying all three tables', () =>
    Effect.gen(function* () {
      const payload = yield* decodeBackup(FULL_BACKUP)
      expect(payload.benchmarks).toHaveLength(1)
      expect(payload.enrolments).toHaveLength(1)
      expect(payload.workouts[0].intervals).toHaveLength(2)
    }),
  )

  it.effect('fails with BackupInvalidError as data — nothing is thrown', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(decodeBackup({ hello: 'world' }))
      expect(error).toBeInstanceOf(BackupInvalidError)
      expect(error._tag).toBe('Db.BackupInvalidError')
      expect(error.message).not.toHaveLength(0)
    }),
  )

  it.effect('rejects a backup from another app', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(decodeBackup({ ...EMPTY_BACKUP, app: 'someone-elses-app' }))
      expect(error).toBeInstanceOf(BackupInvalidError)
    }),
  )

  it.effect('rejects versions this app does not understand', () =>
    Effect.gen(function* () {
      // Both directions: a payload from a future release, and the v3 envelope
      // that predates every one of these tables and carries no rows to restore.
      expect(yield* Effect.flip(decodeBackup({ ...EMPTY_BACKUP, version: 99 }))).toBeInstanceOf(
        BackupInvalidError,
      )
      expect(yield* Effect.flip(decodeBackup(V3_BACKUP))).toBeInstanceOf(BackupInvalidError)
    }),
  )

  it.effect('rejects a payload whose rows are damaged', () =>
    Effect.gen(function* () {
      // A workout with no distance is not an old workout, it is a broken one,
      // and it must not get in through the import path either. This is the
      // same schema the repository reads rows with — that sharing is the point.
      const damaged = {
        ...FULL_BACKUP,
        workouts: [{ ...FULL_BACKUP.workouts[0], distanceM: 0 }],
      }
      expect(yield* Effect.flip(decodeBackup(damaged))).toBeInstanceOf(BackupInvalidError)
    }),
  )

  it.effect('recovers by tag with Effect.catchTag', () =>
    Effect.gen(function* () {
      const recovered = yield* decodeBackup(null).pipe(
        Effect.catchTag('Db.BackupInvalidError', () => Effect.succeed(null)),
      )
      expect(recovered).toBeNull()
    }),
  )
})

describe('the backup programs', () => {
  it.effect('exports a payload its own importer accepts', () =>
    Effect.gen(function* () {
      const payload = yield* exportData

      // The round trip is the contract, and asserting it as a program rather
      // than field by field is what keeps it true when a table is added: a
      // row that reaches the export but not the schema fails right here.
      yield* importData(payload)
      expect(payload.app).toBe('vue-pwa-starter')
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('carries every table through the round trip unchanged', () =>
    Effect.gen(function* () {
      yield* importData(FULL_BACKUP)
      const exported = yield* exportData

      expect(exported.benchmarks).toEqual(FULL_BACKUP.benchmarks)
      expect(exported.enrolments).toEqual(FULL_BACKUP.enrolments)
      expect(exported.workouts).toEqual(FULL_BACKUP.workouts)

      // And again, from the export rather than the fixture: a field the
      // exporter drops would still match on the first pass if the importer
      // drops it too.
      yield* importData(exported)
      expect(yield* exportData).toEqual(exported)
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('leaves exactly one enrolment active after importing over an existing one', () =>
    Effect.gen(function* () {
      // Enrol locally, then restore a backup carrying an active enrolment of
      // its own. A plain bulk put lands the backup's row *beside* the local
      // one and both claim to be the plan you are on.
      //
      // This lived only in the browser tier until the in-memory enrolments
      // table enforced the invariant its real counterpart does. It is the
      // property, not the storage engine, so it belongs here too — the
      // transaction that makes it atomic is still asserted against real
      // IndexedDB in `src/__tests__/db/backup.spec.ts`.
      const local = yield* EnrolmentsRepo.use((repo) => repo.create({ planId: 'pete5k' }))
      yield* importData(FULL_BACKUP)

      const enrolments = yield* EnrolmentsRepo.use((repo) => repo.list())
      expect(enrolments.filter((row) => row.active).map((row) => row.id)).toEqual(['enrol-1'])
      // The local row is kept, just no longer active: a backup restores what
      // it holds, it does not delete what it does not.
      expect(enrolments.find((row) => row.id === local.id)?.active).toBe(false)
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('leaves exactly one enrolment active when the backup itself has two', () =>
    Effect.gen(function* () {
      // Deactivating the rows already in the table says nothing about the
      // batch landing on top of them. A backup file is untrusted input off
      // disk, and one carrying two active enrolments used to restore two —
      // which `progress.ts` documents as unreachable *because* `putMany`
      // deactivates. The most recently started wins, the same rule
      // `activePlan` breaks its tie on.
      yield* importData({
        ...EMPTY_BACKUP,
        enrolments: [
          { id: 'older', planId: 'pete5k', startedAt: 1_000, active: true },
          { id: 'newer', planId: 'pete5kLite', startedAt: 2_000, active: true },
        ],
      })

      const enrolments = yield* EnrolmentsRepo.use((repo) => repo.list())
      expect(enrolments.filter((row) => row.active).map((row) => row.id)).toEqual(['newer'])
      // Both rows are kept — a restore does not delete what it holds.
      expect(enrolments).toHaveLength(2)
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('normalizes a historical row on the way in', () =>
    Effect.gen(function* () {
      // A workout written before the app recorded intervals or knew where a
      // row came from. The import path is the one that can re-introduce old
      // shapes long after the migration that would have fixed them has run,
      // so the converter has to hold here, not just on reads.
      yield* importData({
        ...EMPTY_BACKUP,
        workouts: [
          {
            id: 'legacy-1',
            startedAt: 1_700_000_000_000,
            distanceM: 10_000,
            durationMs: 2_520_000,
            avgSplitMs: 126_000,
          },
        ],
      })

      const [workout] = (yield* exportData).workouts
      expect(workout.source).toBe('manual')
      expect(workout.intervals).toEqual([])
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('stamps the export with the clock rather than the wall clock', () =>
    Effect.gen(function* () {
      // TestClock starts at the epoch, which is the whole reason `exportData`
      // yields `DateTime.now` instead of reading `Date.now()`: the timestamp
      // is an input, so it is assertable.
      const payload = yield* exportData
      expect(payload.exportedAt).toBe('1970-01-01T00:00:00.000Z')
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('refuses anything that is not a backup', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(importData({ app: 'vue-pwa-starter' }))
      expect(error).toBeInstanceOf(BackupInvalidError)
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('writes nothing when the payload is refused', () =>
    Effect.gen(function* () {
      yield* importData(FULL_BACKUP)
      yield* Effect.flip(importData({ hello: 'world' }))

      // The decode is the first line of importData, so a rejected payload
      // cannot half-apply. Asserting it is what keeps that ordering.
      expect((yield* exportData).workouts).toHaveLength(1)
    }).pipe(Effect.provide(dbTestLayer)),
  )
})

describe('the in-memory repositories', () => {
  it.effect('back the same programs the production layers do', () =>
    Effect.gen(function* () {
      // Not a test of the fake for its own sake: this is the assertion that
      // dbTestLayer actually provides all three services, which is what every
      // test above silently depends on.
      yield* BenchmarksRepo.use((repo) => repo.create({ kind: '2k', timeMs: 424_200 }))
      yield* EnrolmentsRepo.use((repo) => repo.create({ planId: 'pete5k' }))
      yield* WorkoutsRepo.use((repo) =>
        repo.create({
          source: 'manual',
          distanceM: 10_000,
          durationMs: 2_520_000,
          avgSplitMs: 126_000,
        }),
      )

      const payload = yield* exportData
      expect(payload.benchmarks).toHaveLength(1)
      expect(payload.enrolments).toHaveLength(1)
      expect(payload.workouts).toHaveLength(1)
    }).pipe(Effect.provide(dbTestLayer)),
  )
})
