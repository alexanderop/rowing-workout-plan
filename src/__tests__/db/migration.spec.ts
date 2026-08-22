import Dexie from 'dexie'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { listNotes, runDb } from '@/db'
import { db } from '@/db/schema'

/**
 * Proves the v1→v2 upgrade path end-to-end: a database written by the old
 * schema opens under the current one with every row backfilled. This is the
 * template for testing your own schema migrations.
 */
describe('schema migration v1 → v2', () => {
  beforeEach(async () => {
    await db.delete()
  })

  it('backfills pinned and updatedAt on rows written by schema v1', async () => {
    // Write a row with a throwaway Dexie instance pinned to schema v1.
    const legacy = new Dexie('vue-pwa-starter')
    legacy.version(1).stores({ notes: 'id, createdAt' })
    await legacy.open()
    await legacy.table('notes').add({ id: 'legacy-1', title: 'Old note', body: '', createdAt: 111 })
    legacy.close()

    // Opening the app database (v2) runs the upgrade.
    await db.open()

    const notes = await runDb(listNotes.pipe(Effect.orDie))
    expect(notes).toEqual([
      {
        id: 'legacy-1',
        title: 'Old note',
        body: '',
        pinned: false,
        createdAt: 111,
        updatedAt: 111,
      },
    ])

    // The upgrade rewrote the stored row itself — not just the converter view.
    const stored = await db.notes.get('legacy-1')
    expect(stored?.pinned).toBe(false)
    expect(stored?.updatedAt).toBe(111)
  })
})
