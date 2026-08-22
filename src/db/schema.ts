import Dexie, { type Table } from 'dexie'
import type { Types } from 'effect'
import type { StoredDbNote } from './converters'

/**
 * Dexie tables and migrations. The *shape* of a note lives in converters.ts,
 * as a Schema that this file's table typing derives from — a type here and a
 * schema there would be two descriptions of the same row, free to drift.
 *
 * The table is typed `StoredDbNote`, not `DbNote`: rows written by schema v1
 * lack `pinned` and `updatedAt`. The upgrade below backfills live rows, but
 * old JSON backups can re-introduce v1 rows at import time, so every read
 * still goes through the decode-and-normalize path in converters.ts. Keeping
 * the stored type honest about optionality is what makes the compiler enforce
 * that.
 */

class StarterDatabase extends Dexie {
  notes!: Table<StoredDbNote, string>

  constructor() {
    super('vue-pwa-starter')

    // v1: original shape — only id and a createdAt index.
    this.version(1).stores({
      notes: 'id, createdAt',
    })

    // v2: adds `pinned` and `updatedAt`. The upgrade backfills existing rows
    // so post-upgrade data is complete; the converter guards everything else.
    // This is the pattern to copy for your own schema changes: bump the
    // version, migrate forward, and keep reads defensive for data that
    // bypasses the migration (imports, sync).
    this.version(2)
      .stores({
        notes: 'id, createdAt, updatedAt',
      })
      .upgrade(async (tx) => {
        // Dexie's `modify` edits rows in place, and a schema-derived type is
        // readonly — this is the one place that writes through it.
        await tx
          .table<Types.Mutable<StoredDbNote>>('notes')
          .toCollection()
          .modify((note) => {
            note.pinned ??= false
            note.updatedAt ??= note.createdAt
          })
      })
  }
}

export const db = new StarterDatabase()

/**
 * Deletes and reopens the database. Used by tests for isolation; also the
 * seam for a "delete all data" action.
 */
export async function resetDatabase(): Promise<void> {
  await db.delete()
  await db.open()
}
