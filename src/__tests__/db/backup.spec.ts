import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { enrolInPlan, exportData, importData, listEnrolments, resetDatabase, runDb } from '@/db'
import { EMPTY_BACKUP, FULL_BACKUP } from '../helpers/backup'

/**
 * The backup round trip against real IndexedDB.
 *
 * The unit tier drives the same programs over the in-memory repositories, so
 * what this one adds is the storage engine's opinion: that every row a
 * repository writes comes back through a wipe and a re-import byte for byte,
 * nested interval arrays included. That is the promise a local-first app
 * makes — the backup file is the only copy — so it is asserted against the
 * real store, not a fake.
 */
describe('backup export/import', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('round-trips an export back through import', async () => {
    // `orDie` says a storage failure here would be a broken premise rather
    // than the assertion under test; the tagged path is exercised in the
    // repository specs.
    const payload = await runDb(exportData.pipe(Effect.orDie))

    expect(payload).toMatchObject({ app: 'vue-pwa-starter' })
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    await resetDatabase()

    // Importing what we just exported is the whole contract; `orDie` says a
    // failure here would be a bug in the test's premise, not the assertion.
    await runDb(importData(payload).pipe(Effect.orDie))
  })

  it('accepts the payload shape the rest of the suite hands around', async () => {
    // The fixture is written out by hand rather than produced by exportData,
    // so a version bump that forgets one of them fails here rather than
    // passing because both sides moved together.
    await runDb(importData(EMPTY_BACKUP).pipe(Effect.orDie))
  })

  it('survives a workout being written, exported, wiped and re-imported', async () => {
    // The whole contract of a local-first app in one test: the file is the
    // only copy, so what comes back has to be what went in.
    await runDb(importData(FULL_BACKUP).pipe(Effect.orDie))
    const exported = await runDb(exportData.pipe(Effect.orDie))

    await resetDatabase()
    expect(await runDb(exportData.pipe(Effect.orDie))).toMatchObject({
      benchmarks: [],
      enrolments: [],
      workouts: [],
    })

    await runDb(importData(exported).pipe(Effect.orDie))
    const restored = await runDb(exportData.pipe(Effect.orDie))

    expect(restored.benchmarks).toEqual(exported.benchmarks)
    expect(restored.enrolments).toEqual(exported.enrolments)
    expect(restored.workouts).toEqual(exported.workouts)
    expect(restored.workouts[0].intervals).toHaveLength(2)
  })

  it('leaves exactly one enrolment active after importing over an existing one', async () => {
    // A restore taken on another device carries its own enrolment ids, so a
    // plain bulk put landed the backup's active row *beside* the local one —
    // two rows both claiming to be the plan you are on, and which of them a
    // screen showed came down to the order Dexie returned random UUIDs in.
    await runDb(enrolInPlan({ planId: 'pete5k-lite' }).pipe(Effect.orDie))

    await runDb(importData(FULL_BACKUP).pipe(Effect.orDie))

    const enrolments = await runDb(listEnrolments.pipe(Effect.orDie))
    expect(enrolments.filter((row) => row.active)).toEqual([
      expect.objectContaining({ id: 'enrol-1', planId: 'pete5k' }),
    ])
    // The local row is kept, just no longer active: a backup restores what it
    // carries without deleting history it says nothing about.
    expect(enrolments).toHaveLength(2)
  })

  it('leaves exactly one enrolment active when the backup itself carries two', async () => {
    // The transaction deactivates the rows already on disk; it says nothing
    // about the batch landing on top of them. A backup file is untrusted
    // input off disk like any other, and a hand-edited or half-merged one
    // carrying two active rows restored two — against `progress.ts`, which
    // documents its `startedAt` tiebreak as unreachable *because* `putMany`
    // deactivates. Asserted here as well as in the unit tier because only
    // this one runs the real transaction.
    await runDb(
      importData({
        ...EMPTY_BACKUP,
        enrolments: [
          { id: 'older', planId: 'pete5k', startedAt: 1_000, active: true },
          { id: 'newer', planId: 'pete5k-lite', startedAt: 2_000, active: true },
        ],
      }).pipe(Effect.orDie),
    )

    const enrolments = await runDb(listEnrolments.pipe(Effect.orDie))
    expect(enrolments.filter((row) => row.active).map((row) => row.id)).toEqual(['newer'])
    expect(enrolments).toHaveLength(2)
  })

  it('rejects payloads that are not backups with a tagged error', async () => {
    // The failure stays in the error channel all the way to the component,
    // which is what lets the settings view tell "not a backup" apart from
    // "the write failed" with `catchTags` instead of `instanceof`.
    const error = await runDb(importData({ hello: 'world' }).pipe(Effect.flip, Effect.orDie))

    expect(error._tag).toBe('Db.BackupInvalidError')
  })
})
