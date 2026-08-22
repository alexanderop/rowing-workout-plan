import { Clock, Context, Effect, Layer, Option, Ref } from 'effect'
import type { Note } from '../converters'
import {
  decodeNoteDraft,
  decodeNotePatch,
  decodeStoredNote,
  type NoteDraft,
  type NotePatch,
  toNote,
} from '../converters'
import { DatabaseError, NoteInvalidError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'

export type { NoteDraft, NotePatch } from '../converters'

/** Wraps one Dexie call, turning any rejection into a tagged DatabaseError. */
const tryDb = <A>(operation: string, run: () => Promise<A>): Effect.Effect<A, DatabaseError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new DatabaseError({ operation, cause }),
  })

/**
 * Normalizes and validates a draft. Both layers run it, so the in-memory fake
 * cannot accept a note the real repository would reject — and callers get the
 * trimming for free rather than each remembering to do it.
 */
const validateDraft = (draft: NoteDraft): Effect.Effect<NoteDraft, NoteInvalidError> =>
  decodeNoteDraft(draft).pipe(
    Effect.mapError((error) => new NoteInvalidError({ message: error.message })),
  )

/**
 * Same contract for updates: the patch schema reuses the draft's field rules,
 * so an update cannot blank a title that a create would have rejected — the
 * domain rule holds on every write path, and both layers run it.
 */
const validatePatch = (patch: NotePatch): Effect.Effect<NotePatch, NoteInvalidError> =>
  decodeNotePatch(patch).pipe(
    Effect.mapError((error) => new NoteInvalidError({ message: error.message })),
  )

/**
 * Turns one row off disk into a domain note, validating it on the way.
 *
 * A row that fails is a `DatabaseError` rather than a tag of its own: the only
 * honest response to "the store handed back something that is not a note" is
 * the same as to "the store would not answer", and a tag whose handler is
 * identical to an existing one is ceremony. The `SchemaError` rides along as
 * the cause, so the console still says which field was wrong.
 *
 * One bad row fails the whole read, deliberately. `StoredDbNote` already
 * accepts every shape this app has ever written, so a row that misses it is
 * damaged rather than merely old — and quietly dropping it would show the
 * user a short list they might then export over their last good backup.
 */
// IndexedDB is untrusted input by this project's rules; `decodeStoredNote`
// below is the parse `no-unknown-parameters` asks for, and this parameter is
// its input.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself
const decodeRow = (stored: unknown): Effect.Effect<Note, DatabaseError> =>
  decodeStoredNote(stored).pipe(
    Effect.mapError((cause) => new DatabaseError({ operation: 'decode note row', cause })),
    Effect.map(toNote),
  )

/**
 * The notes repository as an Effect service: the class is both the DI key
 * and the place the production Layer lives. Only this service touches the
 * Dexie tables — everything above it (backup logic, the store) composes the
 * effects it returns, which is what keeps business logic separate from
 * storage and swappable in one place.
 */
export class NotesRepo extends Context.Service<
  NotesRepo,
  {
    list: () => Effect.Effect<Array<Note>, DatabaseError>
    create: (draft: NoteDraft) => Effect.Effect<Note, DatabaseError | NoteInvalidError>
    update: (id: string, patch: NotePatch) => Effect.Effect<void, DatabaseError | NoteInvalidError>
    togglePinned: (id: string) => Effect.Effect<void, DatabaseError>
    remove: (id: string) => Effect.Effect<void, DatabaseError>
    /** Overwrites rows with matching ids — the import primitive. */
    putMany: (notes: Array<Note>) => Effect.Effect<void, DatabaseError>
  }
>()('vue-pwa-starter/db/NotesRepo') {
  static readonly layer = Layer.effect(
    NotesRepo,
    Effect.gen(function* () {
      const generateId = yield* GenerateId

      return NotesRepo.of({
        list: Effect.fn('NotesRepo.list')(function* () {
          const stored = yield* tryDb('list notes', () => db.notes.toArray())
          return yield* Effect.forEach(stored, decodeRow)
        }),

        create: Effect.fn('NotesRepo.create')(function* (draft: NoteDraft) {
          const valid = yield* validateDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const note: Note = {
            id: generateId(),
            title: valid.title,
            body: valid.body,
            pinned: false,
            createdAt: now,
            updatedAt: now,
          }
          yield* tryDb('create note', () => db.notes.add(note))
          return note
        }),

        update: Effect.fn('NotesRepo.update')(function* (id: string, patch: NotePatch) {
          const valid = yield* validatePatch(patch)
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('update note', async () => {
            await db.notes.update(id, { ...valid, updatedAt: now })
          })
        }),

        // Flips `pinned` based on what is currently on disk, inside a
        // read-write transaction. Deliberately not `update(id, { pinned:
        // !note.pinned })`: that computes the next value from a row the caller
        // read earlier, so two rapid taps both write the same value and one of
        // them is lost. The transaction callback stays pure Dexie — foreign
        // promises (and Effect yields) inside it would break the transaction.
        togglePinned: Effect.fn('NotesRepo.togglePinned')(function* (id: string) {
          const now = yield* Clock.currentTimeMillis
          yield* tryDb('toggle pinned', () =>
            db.transaction('rw', db.notes, async () => {
              const stored = await db.notes.get(id)
              if (!stored) return
              await db.notes.update(id, { pinned: !(stored.pinned ?? false), updatedAt: now })
            }),
          )
        }),

        remove: Effect.fn('NotesRepo.remove')(function* (id: string) {
          yield* tryDb('delete note', async () => {
            await db.notes.delete(id)
          })
        }),

        putMany: Effect.fn('NotesRepo.putMany')(function* (notes: Array<Note>) {
          yield* tryDb('bulk import notes', async () => {
            await db.notes.bulkPut(notes)
          })
        }),
      })
    }),
  )

  /**
   * Ref-backed in-memory fake — no IndexedDB, so full programs (exportData,
   * importData, anything composed over the repo) run in the Node unit tier.
   * Semantics mirror the production layer: timestamps come from the Clock
   * service (TestClock in tests), putMany overwrites rows with matching ids.
   *
   * One object backs two tags: production code sees it as `NotesRepo`, tests
   * additionally reach it as `NotesRepoTest` to arm a storage failure — the
   * fake's stand-in for the seam where `tryDb` fails in the wild. Provide
   * with `Effect.provide(NotesRepo.testLayer)`.
   */
  static readonly testLayer = Layer.effectContext(
    Effect.gen(function* () {
      const rows = yield* Ref.make<ReadonlyMap<string, Note>>(new Map())
      const generateId = yield* GenerateId
      const nextFailure = yield* Ref.make<Option.Option<DatabaseError>>(Option.none())

      // Every operation passes through here first, the way every production
      // operation passes through tryDb — armed via `NotesRepoTest.failNext`,
      // disarmed after one failure.
      const maybeFail = Effect.gen(function* () {
        const failure = yield* Ref.getAndSet(nextFailure, Option.none())
        if (Option.isSome(failure)) return yield* Effect.fail(failure.value)
      })

      const service = {
        list: Effect.fn('NotesRepo.Test.list')(function* () {
          yield* maybeFail
          return [...(yield* Ref.get(rows)).values()]
        }),

        create: Effect.fn('NotesRepo.Test.create')(function* (draft: NoteDraft) {
          const valid = yield* validateDraft(draft)
          yield* maybeFail
          const now = yield* Clock.currentTimeMillis
          const note: Note = {
            id: generateId(),
            title: valid.title,
            body: valid.body,
            pinned: false,
            createdAt: now,
            updatedAt: now,
          }
          yield* Ref.update(rows, (current) => new Map(current).set(note.id, note))
          return note
        }),

        update: Effect.fn('NotesRepo.Test.update')(function* (id: string, patch: NotePatch) {
          const valid = yield* validatePatch(patch)
          yield* maybeFail
          const now = yield* Clock.currentTimeMillis
          yield* Ref.update(rows, (current) => {
            const existing = current.get(id)
            if (!existing) return current
            return new Map(current).set(id, { ...existing, ...valid, updatedAt: now })
          })
        }),

        togglePinned: Effect.fn('NotesRepo.Test.togglePinned')(function* (id: string) {
          yield* maybeFail
          const now = yield* Clock.currentTimeMillis
          yield* Ref.update(rows, (current) => {
            const existing = current.get(id)
            if (!existing) return current
            return new Map(current).set(id, {
              ...existing,
              pinned: !existing.pinned,
              updatedAt: now,
            })
          })
        }),

        remove: Effect.fn('NotesRepo.Test.remove')(function* (id: string) {
          yield* maybeFail
          yield* Ref.update(rows, (current) => {
            const next = new Map(current)
            next.delete(id)
            return next
          })
        }),

        putMany: Effect.fn('NotesRepo.Test.putMany')(function* (notes: Array<Note>) {
          yield* maybeFail
          yield* Ref.update(rows, (current) => {
            const next = new Map(current)
            for (const note of notes) next.set(note.id, note)
            return next
          })
        }),

        failNext: Effect.fn('NotesRepo.Test.failNext')(function* (error: DatabaseError) {
          yield* Ref.set(nextFailure, Option.some(error))
        }),
      }

      return Context.empty().pipe(
        Context.add(NotesRepo, service),
        Context.add(NotesRepoTest, service),
      )
    }),
  )
}

/**
 * Control surface of the in-memory fake, behind its own tag so production
 * code cannot see it: only `NotesRepo.testLayer` provides it, and only tests
 * ask for it. `failNext` makes the fake's next operation fail with the given
 * `DatabaseError`, which is what lets the unit tier exercise the recovery
 * branches (`Effect.catchTag('Db.DatabaseError', …)`) that otherwise only
 * fire against a broken real IndexedDB.
 */
export class NotesRepoTest extends Context.Service<
  NotesRepoTest,
  {
    failNext: (error: DatabaseError) => Effect.Effect<void>
  }
>()('vue-pwa-starter/db/NotesRepoTest') {}

/**
 * Ready-made programs over the repository — this is what `@/db` exposes.
 * Each one is a description, not a running operation: pass it to `runDb`
 * (or compose it further with `Effect.*` first) to execute it.
 */
export const listNotes = NotesRepo.use((repo) => repo.list())

export const createNote = (draft: NoteDraft) => NotesRepo.use((repo) => repo.create(draft))

export const updateNote = (id: string, patch: NotePatch) =>
  NotesRepo.use((repo) => repo.update(id, patch))

export const toggleNotePinned = (id: string) => NotesRepo.use((repo) => repo.togglePinned(id))

export const deleteNote = (id: string) => NotesRepo.use((repo) => repo.remove(id))
