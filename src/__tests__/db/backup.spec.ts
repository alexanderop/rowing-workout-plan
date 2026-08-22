import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BackupInvalidError,
  createNote,
  exportData,
  importData,
  listNotes,
  resetDatabase,
  runDb,
} from '@/db'

describe('backup export/import', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('round-trips notes through export and import', async () => {
    await runDb(createNote({ title: 'Keep me', body: 'important' }).pipe(Effect.orDie))
    const payload = await runDb(exportData.pipe(Effect.orDie))

    await resetDatabase()
    expect(await runDb(listNotes.pipe(Effect.orDie))).toHaveLength(0)

    const count = await runDb(importData(payload).pipe(Effect.orDie))

    expect(count).toBe(1)
    expect(await runDb(listNotes.pipe(Effect.orDie))).toMatchObject([
      { title: 'Keep me', body: 'important' },
    ])
  })

  it('imports a v1-era backup (rows without pinned/updatedAt)', async () => {
    const legacyPayload = {
      app: 'vue-pwa-starter',
      version: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      notes: [{ id: 'legacy', title: 'From the past', body: '', createdAt: 42 }],
    }

    await runDb(importData(legacyPayload).pipe(Effect.orDie))

    expect(await runDb(listNotes.pipe(Effect.orDie))).toEqual([
      {
        id: 'legacy',
        title: 'From the past',
        body: '',
        pinned: false,
        createdAt: 42,
        updatedAt: 42,
      },
    ])
  })

  it('rejects payloads that are not backups with a tagged error', async () => {
    // The failure stays in the error channel all the way to the component,
    // which is what lets the settings view tell "not a backup" apart from
    // "the write failed" with `catchTags` instead of `instanceof`.
    const error = await runDb(importData({ hello: 'world' }).pipe(Effect.flip, Effect.orDie))

    expect(error).toBeInstanceOf(BackupInvalidError)
    expect(await runDb(listNotes.pipe(Effect.orDie))).toHaveLength(0)
  })
})
