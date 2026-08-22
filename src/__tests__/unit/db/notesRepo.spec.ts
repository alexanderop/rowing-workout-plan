import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { DatabaseError, NoteInvalidError } from '@/db/errors'
import { GenerateId } from '@/db/generateId'
import { NotesRepo, NotesRepoTest } from '@/db/repositories/notes'

/**
 * The repository's own rules, run against the in-memory layer in the Node
 * tier. Both layers share `validateDraft`/`validatePatch`, so what holds here
 * holds for the Dexie-backed one too — that is the point of the fake
 * mirroring production semantics rather than being a convenient stub.
 *
 * Ids come from the `GenerateId` reference and timestamps from `Clock`, so a
 * created note is fully determined by the test: no uuid, no wall clock.
 */
const withRepo = <A, E>(program: Effect.Effect<A, E, NotesRepo | NotesRepoTest>) =>
  program.pipe(
    Effect.provide(NotesRepo.testLayer),
    Effect.provideService(GenerateId, () => 'fixed-id'),
  )

describe('NotesRepo.create', () => {
  it.effect('stamps a new note from the id reference and the clock', () =>
    withRepo(
      Effect.gen(function* () {
        yield* TestClock.adjust('5 minutes')
        const repo = yield* NotesRepo

        const note = yield* repo.create({ title: 'Fully determined', body: 'text' })

        expect(note).toEqual({
          id: 'fixed-id',
          title: 'Fully determined',
          body: 'text',
          pinned: false,
          createdAt: 300_000,
          updatedAt: 300_000,
        })
      }),
    ),
  )

  it.effect('trims what it stores, so no caller has to', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo

        const note = yield* repo.create({ title: '  Groceries  ', body: '  milk\n' })

        expect(note.title).toBe('Groceries')
        expect(note.body).toBe('milk')
      }),
    ),
  )

  it.effect('rejects a draft without a title, as data', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo

        const error = yield* Effect.flip(repo.create({ title: '', body: 'orphan body' }))

        expect(error).toBeInstanceOf(NoteInvalidError)
        expect(error._tag).toBe('Db.NoteInvalidError')
      }),
    ),
  )

  it.effect('rejects a title of nothing but whitespace', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo

        const error = yield* Effect.flip(repo.create({ title: '   ', body: '' }))

        expect(error).toBeInstanceOf(NoteInvalidError)
      }),
    ),
  )

  it.effect('does not store a rejected draft', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo

        yield* Effect.flip(repo.create({ title: '', body: '' }))

        expect(yield* repo.list()).toHaveLength(0)
      }),
    ),
  )

  it.effect('recovers by tag, the way the form does', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo

        const recovered = yield* repo.create({ title: '', body: '' }).pipe(
          Effect.catchTag('Db.NoteInvalidError', () => Effect.succeed('title required')),
          Effect.catchTag('Db.DatabaseError', () => Effect.succeed('storage failed')),
        )

        expect(recovered).toBe('title required')
      }),
    ),
  )
})

describe('NotesRepo.update', () => {
  it.effect('trims a patched title and body, like create does', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo
        const created = yield* repo.create({ title: 'Before', body: '' })

        yield* repo.update(created.id, { title: '  After  ', body: '  edited\n' })

        expect(yield* repo.list()).toMatchObject([{ title: 'After', body: 'edited' }])
      }),
    ),
  )

  it.effect('rejects a patch that would blank the title, as data', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo
        const created = yield* repo.create({ title: 'Keep me', body: '' })

        const error = yield* Effect.flip(repo.update(created.id, { title: '   ' }))

        expect(error).toBeInstanceOf(NoteInvalidError)
        expect(yield* repo.list()).toMatchObject([{ title: 'Keep me' }])
      }),
    ),
  )

  it.effect('leaves fields the patch does not mention untouched', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo
        const created = yield* repo.create({ title: 'Stays', body: 'stays too' })

        yield* repo.update(created.id, { pinned: true })

        expect(yield* repo.list()).toMatchObject([
          { title: 'Stays', body: 'stays too', pinned: true },
        ])
      }),
    ),
  )
})

describe('storage failure injection', () => {
  it.effect('fails the next operation with the armed error, then disarms', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo
        const control = yield* NotesRepoTest

        yield* control.failNext(
          new DatabaseError({ operation: 'list notes', cause: new Error('quota exceeded') }),
        )

        const error = yield* Effect.flip(repo.list())
        expect(error).toBeInstanceOf(DatabaseError)
        expect(error.operation).toBe('list notes')

        // One failure, then normal service — like a transient quota error.
        expect(yield* repo.list()).toEqual([])
      }),
    ),
  )

  it.effect('drives the recovery branch a component writes', () =>
    withRepo(
      Effect.gen(function* () {
        const repo = yield* NotesRepo
        const control = yield* NotesRepoTest

        yield* control.failNext(
          new DatabaseError({ operation: 'create note', cause: new Error('quota exceeded') }),
        )

        const recovered = yield* repo.create({ title: 'Doomed', body: '' }).pipe(
          Effect.catchTag('Db.DatabaseError', () => Effect.succeed('storage failed')),
          Effect.catchTag('Db.NoteInvalidError', () => Effect.succeed('title required')),
        )

        expect(recovered).toBe('storage failed')
        expect(yield* repo.list()).toHaveLength(0)
      }),
    ),
  )
})
