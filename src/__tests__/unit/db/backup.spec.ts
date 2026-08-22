import { describe, expect, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import { FastCheck } from 'effect/testing'
import { decodeBackup, exportData, importData } from '@/db/backup'
import { StoredDbNote, toNote } from '@/db/converters'
import { BackupInvalidError } from '@/db/errors'
import { NotesRepo } from '@/db/repositories/notes'

/**
 * decodeBackup is a pure Effect program — no IndexedDB, no runtime setup —
 * so the import rules run in the Node unit tier. `it.effect` from
 * @effect/vitest runs the returned Effect for us (with test services such as
 * TestClock provided); failures stay values, promoted into the success
 * channel with `Effect.flip` where a test wants to look at them.
 *
 * The full programs (exportData, importData) need a NotesRepo — the
 * Ref-backed `NotesRepo.testLayer` provides one without IndexedDB, so they
 * run in this tier too. The browser tier keeps testing the same programs
 * against real Dexie through the `runDb` promise edge.
 */

const validNote = {
  id: 'a',
  title: 'Hello',
  body: 'world',
  pinned: true,
  createdAt: 1,
  updatedAt: 2,
}

const validBackup = {
  app: 'vue-pwa-starter',
  version: 2,
  exportedAt: '2026-01-01T00:00:00.000Z',
  notes: [validNote],
}

describe('decodeBackup', () => {
  it.effect('accepts a current (v2) payload', () =>
    Effect.gen(function* () {
      const payload = yield* decodeBackup(validBackup)
      expect(payload.notes).toHaveLength(1)
      expect(payload.version).toBe(2)
    }),
  )

  it.effect('accepts a legacy v1 payload whose notes lack pinned/updatedAt', () =>
    Effect.gen(function* () {
      const payload = yield* decodeBackup({
        app: 'vue-pwa-starter',
        version: 1,
        exportedAt: '2024-01-01T00:00:00.000Z',
        notes: [{ id: 'legacy', title: 'From the past', body: '', createdAt: 42 }],
      })
      expect(payload.version).toBe(1)
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
      const error = yield* Effect.flip(decodeBackup({ ...validBackup, app: 'someone-elses-app' }))
      expect(error).toBeInstanceOf(BackupInvalidError)
    }),
  )

  it.effect('rejects versions newer than this app understands', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(decodeBackup({ ...validBackup, version: 3 }))
      expect(error).toBeInstanceOf(BackupInvalidError)
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

describe('backup programs against the in-memory NotesRepo', () => {
  it.effect('round-trips notes through import and export', () =>
    Effect.gen(function* () {
      const count = yield* importData(validBackup)
      expect(count).toBe(1)

      const payload = yield* exportData
      expect(payload.version).toBe(2)
      expect(payload.notes).toMatchObject([
        { id: 'a', title: 'Hello', body: 'world', pinned: true },
      ])
    }).pipe(Effect.provide(NotesRepo.testLayer)),
  )

  it.effect('normalizes legacy v1 rows on import', () =>
    Effect.gen(function* () {
      yield* importData({
        app: 'vue-pwa-starter',
        version: 1,
        exportedAt: '2024-01-01T00:00:00.000Z',
        notes: [{ id: 'legacy', title: 'From the past', body: '', createdAt: 42 }],
      })

      const repo = yield* NotesRepo
      expect(yield* repo.list()).toEqual([
        {
          id: 'legacy',
          title: 'From the past',
          body: '',
          pinned: false,
          createdAt: 42,
          updatedAt: 42,
        },
      ])
    }).pipe(Effect.provide(NotesRepo.testLayer)),
  )

  it.effect('overwrites rows with matching ids instead of duplicating them', () =>
    Effect.gen(function* () {
      yield* importData(validBackup)
      yield* importData({ ...validBackup, notes: [{ ...validNote, title: 'Updated' }] })

      const repo = yield* NotesRepo
      expect(yield* repo.list()).toMatchObject([{ id: 'a', title: 'Updated' }])
    }).pipe(Effect.provide(NotesRepo.testLayer)),
  )

  it.effect('stamps exportedAt from the Clock service (TestClock here)', () =>
    Effect.gen(function* () {
      const payload = yield* exportData
      expect(payload.exportedAt).toBe('1970-01-01T00:00:00.000Z')
    }).pipe(Effect.provide(NotesRepo.testLayer)),
  )

  // Property-based round-trip over the whole space of valid backups, not just
  // the two fixtures above. `Schema.toArbitrary` turns the row schema into a
  // fast-check generator (mixing v1 and v2 shapes, since the optional fields
  // are part of the schema); ids are kept unique because import overwrites on
  // id, which would make the count assertion meaningless for duplicates.
  const storedRows = FastCheck.uniqueArray(Schema.toArbitrary(StoredDbNote), {
    selector: (row) => row.id,
  })

  it.effect.prop(
    'imports any valid backup fully and exports every note normalized',
    { rows: storedRows },
    ({ rows }) =>
      Effect.gen(function* () {
        const count = yield* importData({
          app: 'vue-pwa-starter',
          version: 2,
          exportedAt: '2026-01-01T00:00:00.000Z',
          notes: rows,
        })
        expect(count).toBe(rows.length)

        const payload = yield* exportData
        const exported = new Map(payload.notes.map((note) => [note.id, note]))

        expect(payload.notes).toHaveLength(rows.length)
        for (const row of rows) {
          expect(exported.get(row.id)).toEqual(toNote(row))
        }
      }).pipe(Effect.provide(NotesRepo.testLayer)),
  )
})
