import { Effect } from 'effect'
import { describe, expect } from 'vitest'
import { it } from '../fixtures'
import { EMPTY_BACKUP } from '../helpers/backup'
import { seedTraining } from '../helpers/seed'
import { LogScreen } from '../pages/logScreen'
import { exportData, runDb } from '@/db'

/**
 * "Delete everything", through the real settings screen and against real
 * IndexedDB.
 *
 * The pattern the training flows use: interact the way a user does, assert
 * what the screen says, then assert what is actually on disk. A wipe is the
 * one action where the second half carries the whole test — a screen can say
 * "everything was deleted" over a database that still has every row in it,
 * and the user has no way to tell until the next time they open the app.
 *
 * Seeding happens *after* the screen is mounted, which is safe only here:
 * settings subscribes to no read atom, so nothing on it was loaded from a
 * database that was still empty. Every training screen needs the other order,
 * which is why those fixtures take the seed.
 */
const SEED = {
  benchmark2kMs: 424_200,
  planId: 'pete5k',
  workouts: [{ distanceM: 10_000 }],
} as const

/** Everything on disk, read through the one program that touches all three tables. */
const contents = () => runDb(exportData.pipe(Effect.orDie))

describe('deleting everything from settings', () => {
  it('asks first, and deletes nothing until it is confirmed', async ({ settings }) => {
    await seedTraining(SEED)

    await settings.openDeleteDialog()
    await settings.cancelDelete()

    // Backing out is the common case for a destructive control, and the one
    // where a bug is silent: nothing on screen changes either way.
    expect(await contents()).toMatchObject({
      benchmarks: [expect.objectContaining({ timeMs: 424_200 })],
      enrolments: [expect.objectContaining({ planId: 'pete5k' })],
      workouts: [expect.objectContaining({ distanceM: 10_000 })],
    })
  })

  it('empties every table once it is confirmed, and says so', async ({ settings }) => {
    await seedTraining(SEED)

    await settings.deleteEverything()

    await settings.expectToast('Everything was deleted')
    // The whole payload, not the three arrays: a partial match says nothing
    // about a table it was not handed, which is the one that would survive a
    // wipe unnoticed.
    expect(await contents()).toEqual({ ...EMPTY_BACKUP, exportedAt: expect.any(String) })
  })

  it('leaves the log empty behind it', async ({ settings }) => {
    await seedTraining(SEED)

    await settings.deleteEverything()

    // The screens the deleted rows were on are the point of the wipe, so the
    // test walks to one rather than stopping at the database.
    await settings.tab('Log').click()
    const log = LogScreen.within(settings)
    await log.expectReady()
    await expect.element(log.bucket('This week')).not.toBeInTheDocument()
    await expect.element(log.entry('Free row')).not.toBeInTheDocument()
  })

  it('offers the delete even with nothing to delete', async ({ settings }) => {
    // No seed: a fresh install. Deleting nothing has to succeed rather than
    // report a failure the user reads as "your data could not be deleted".
    await settings.deleteEverything()

    await settings.expectToast('Everything was deleted')
  })
})
