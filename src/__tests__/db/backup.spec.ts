import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportData, importData, resetDatabase, runDb } from '@/db'
import { EMPTY_BACKUP } from '../helpers/backup'

/**
 * The backup round trip against real IndexedDB. The database has no tables
 * yet — the notes worked example was removed and the training tables land in
 * their own slice — so what this proves today is the envelope: an export
 * decodes as an import, and anything else is refused by tag rather than
 * half-applied. A table added later is added to these assertions in the same
 * commit, which is the point of keeping the spec rather than deleting it with
 * the rows it used to carry.
 */
describe('backup export/import', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('round-trips an export back through import', async () => {
    const payload = await runDb(exportData)

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

  it('rejects payloads that are not backups with a tagged error', async () => {
    // The failure stays in the error channel all the way to the component,
    // which is what lets the settings view tell "not a backup" apart from
    // "the write failed" with `catchTags` instead of `instanceof`.
    const error = await runDb(importData({ hello: 'world' }).pipe(Effect.flip, Effect.orDie))

    expect(error._tag).toBe('Db.BackupInvalidError')
  })
})
