import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createNote,
  DatabaseError,
  deleteNote,
  listNotes,
  NoteInvalidError,
  runDb,
  toggleNotePinned,
  updateNote,
} from '@/db'
import { resetDatabase } from '@/db'
import { db } from '@/db/schema'

/**
 * `runDb` only accepts programs whose failures are already handled, so these
 * tests have to say what they mean about failure: `Effect.orDie` where a
 * storage failure would mean a broken test, `Effect.flip` where the failure
 * *is* the assertion.
 */
describe('notes repository', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('creates and lists notes', async () => {
    await runDb(createNote({ title: 'First', body: 'body' }).pipe(Effect.orDie))

    const notes = await runDb(listNotes.pipe(Effect.orDie))
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ title: 'First', body: 'body', pinned: false })
  })

  it('updates a note and bumps updatedAt', async () => {
    const created = await runDb(createNote({ title: 'Pin me', body: '' }).pipe(Effect.orDie))

    await runDb(updateNote(created.id, { pinned: true }).pipe(Effect.orDie))

    const [note] = await runDb(listNotes.pipe(Effect.orDie))
    expect(note?.pinned).toBe(true)
    expect(note?.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)
  })

  it('toggles pinned against the stored row', async () => {
    const created = await runDb(createNote({ title: 'Pin me', body: '' }).pipe(Effect.orDie))

    await runDb(toggleNotePinned(created.id).pipe(Effect.orDie))
    expect((await runDb(listNotes.pipe(Effect.orDie)))[0]?.pinned).toBe(true)

    await runDb(toggleNotePinned(created.id).pipe(Effect.orDie))
    expect((await runDb(listNotes.pipe(Effect.orDie)))[0]?.pinned).toBe(false)
  })

  it('does not lose a toggle when two run concurrently', async () => {
    const created = await runDb(createNote({ title: 'Double tap', body: '' }).pipe(Effect.orDie))

    // Two separate runs, the way two taps produce two separate handlers. Both
    // toggles read the current value inside their own transaction, so they
    // compose: false -> true -> false. Computing from a row read before the
    // taps would leave it stuck at true.
    await Promise.all([
      runDb(toggleNotePinned(created.id).pipe(Effect.orDie)),
      runDb(toggleNotePinned(created.id).pipe(Effect.orDie)),
    ])

    expect((await runDb(listNotes.pipe(Effect.orDie)))[0]?.pinned).toBe(false)
  })

  it('ignores a toggle for a note that no longer exists', async () => {
    await expect(runDb(toggleNotePinned('missing').pipe(Effect.orDie))).resolves.toBeUndefined()
  })

  it('rejects a draft without a title, from the Dexie-backed layer too', async () => {
    const error = await runDb(
      createNote({ title: '   ', body: 'orphan' }).pipe(Effect.flip, Effect.orDie),
    )

    expect(error).toBeInstanceOf(NoteInvalidError)
    expect(await runDb(listNotes.pipe(Effect.orDie))).toHaveLength(0)
  })

  it('fails the read when a stored row is not a note', async () => {
    // Written straight through Dexie, the way a row from a future version, a
    // restored profile, or devtools arrives — the repository never produced
    // this. `db.table(...)` is untyped, which is the point: the compiler
    // cannot help here, so the schema has to.
    await db.table('notes').add({ id: 'corrupt', title: 42, body: '', createdAt: 1 })

    const error = await runDb(listNotes.pipe(Effect.flip, Effect.orDie))

    expect(error).toBeInstanceOf(DatabaseError)
    expect(error.operation).toBe('decode note row')
  })

  it('surfaces storage failures as tagged DatabaseError instances', async () => {
    // Closing the database makes the next Dexie call reject — the shape of
    // any real-world storage failure (quota, private browsing). The failure
    // stays in the error channel where `catchTag` can reach it; `flip` moves
    // it into the success channel so this can be asserted without ever
    // leaving Effect.
    db.close()

    const error = await runDb(listNotes.pipe(Effect.flip, Effect.orDie))
    expect(error).toBeInstanceOf(DatabaseError)

    await db.open()
  })

  it('deletes a note', async () => {
    const created = await runDb(createNote({ title: 'Gone soon', body: '' }).pipe(Effect.orDie))

    await runDb(deleteNote(created.id).pipe(Effect.orDie))

    expect(await runDb(listNotes.pipe(Effect.orDie))).toHaveLength(0)
  })
})
