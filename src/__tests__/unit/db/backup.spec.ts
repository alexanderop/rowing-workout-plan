import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { decodeBackup, exportData, importData } from '@/db/backup'
import { BackupInvalidError } from '@/db/errors'
import { EMPTY_BACKUP } from '../../helpers/backup'

/**
 * The backup programs are pure Effect — no IndexedDB, no runtime setup — so
 * the import rules run in the Node unit tier. `it.effect` from @effect/vitest
 * runs the returned Effect for us (with test services such as TestClock
 * provided); failures stay values, promoted into the success channel with
 * `Effect.flip` where a test wants to look at them.
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
      // Both directions: a payload from a future release, and one from the
      // notes-era schema whose rows have nowhere to go in this app.
      expect(yield* Effect.flip(decodeBackup({ ...EMPTY_BACKUP, version: 99 }))).toBeInstanceOf(
        BackupInvalidError,
      )
      expect(yield* Effect.flip(decodeBackup({ ...EMPTY_BACKUP, version: 2 }))).toBeInstanceOf(
        BackupInvalidError,
      )
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
    }),
  )

  it.effect('stamps the export with the clock rather than the wall clock', () =>
    Effect.gen(function* () {
      // TestClock starts at the epoch, which is the whole reason `exportData`
      // yields `DateTime.now` instead of reading `Date.now()`: the timestamp
      // is an input, so it is assertable.
      const payload = yield* exportData
      expect(payload.exportedAt).toBe('1970-01-01T00:00:00.000Z')
    }),
  )

  it.effect('refuses anything that is not a backup', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(importData({ app: 'vue-pwa-starter' }))
      expect(error).toBeInstanceOf(BackupInvalidError)
    }),
  )
})
