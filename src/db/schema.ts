import Dexie from 'dexie'

/**
 * Dexie tables and migrations.
 *
 * The database is empty: the notes worked example was removed and the
 * training tables (workouts, plan enrolments, benchmarks) land in their own
 * slice. Version 1 is therefore declared with no object stores — Dexie still
 * needs a version to open against, and starting the training tables on this
 * version keeps them a fresh install rather than a migration from a shape
 * nobody ever shipped.
 *
 * The *shape* of a row belongs in `converters.ts` as a Schema this file's
 * table typing derives from, never as a type declared here: two descriptions
 * of one row are free to drift. See docs/local-first.md.
 */
class StarterDatabase extends Dexie {
  constructor() {
    super('vue-pwa-starter')

    this.version(1).stores({})
  }
}

const db = new StarterDatabase()

/**
 * Deletes and reopens the database. Used by tests for isolation; also the
 * seam for a "delete all data" action.
 */
export async function resetDatabase(): Promise<void> {
  await db.delete()
  await db.open()
}
