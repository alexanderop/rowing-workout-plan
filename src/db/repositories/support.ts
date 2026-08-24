import { Effect, Ref } from 'effect'
import { DatabaseError } from '../errors'

/**
 * Shared plumbing for the three training repositories.
 *
 * One copy rather than three. Each of these was written out per table before,
 * which made the *shape* of a repository something you had to notice rather
 * than something you were handed: three chances for the operation name to go
 * stale, for a catch to be forgotten, or — the one that actually bites — for
 * an in-memory fake to answer differently from the real table it stands in
 * for. What is left in a repository file is only what is true of that table
 * alone.
 */

/** Wraps one Dexie call, turning any rejection into a tagged DatabaseError. */
export const tryDb = <A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, DatabaseError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new DatabaseError({ operation, cause }),
  })

/** What every schema decode failure carries, and all this module needs of one. */
interface DecodeFailure {
  readonly message: string
}

/**
 * Normalizes and validates a draft, re-tagging the schema failure as the
 * table's own invalid-draft error.
 *
 * Both of a repository's layers run the validator it returns, so the
 * in-memory fake cannot accept a draft the real repository would reject.
 */
export const draftValidator =
  <D, E>(decode: (draft: D) => Effect.Effect<D, DecodeFailure>, toError: (message: string) => E) =>
  (draft: D): Effect.Effect<D, E> =>
    decode(draft).pipe(Effect.mapError((error) => toError(error.message)))

/**
 * Turns one row off disk into a domain object, validating it on the way.
 *
 * A row that fails is a `DatabaseError` rather than a tag of its own: the only
 * honest response to "the store handed back something that is not a benchmark"
 * is the same as to "the store would not answer". The `SchemaError` rides
 * along as the cause, so the console still says which field was wrong.
 *
 * One bad row fails the whole read, deliberately. Each `Stored*` schema already
 * accepts every shape this app has ever written, so a row that misses it is
 * damaged rather than merely old — and quietly dropping it would show the user
 * a short list they might then export over their last good backup.
 */
export const rowDecoder =
  <S, A>(
    operation: string,
    // IndexedDB is untrusted input by this project's rules; `decode` is the
    // parse `no-unknown-parameters` asks for, and this is its input.
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself
    decode: (stored: unknown) => Effect.Effect<S, unknown>,
    toDomain: (stored: S) => A,
  ) =>
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself
  (stored: unknown): Effect.Effect<A, DatabaseError> =>
    decode(stored).pipe(
      Effect.mapError((cause) => new DatabaseError({ operation, cause })),
      Effect.map(toDomain),
    )

/** The table operations that are the same for every row type. */
export interface InMemoryTable<A> {
  /** Insertion order, which the real tables' `list` may re-sort. */
  readonly list: () => Effect.Effect<Array<A>>
  readonly remove: (id: string) => Effect.Effect<void>
  readonly putMany: (
    incoming: ReadonlyArray<A>,
    rewrite?: (existing: A) => A,
  ) => Effect.Effect<void>
  readonly clear: () => Effect.Effect<void>
  /** `putMany` for the single row a `create` has just built — the name the call site wants. */
  readonly insert: (row: A, rewrite?: (existing: A) => A) => Effect.Effect<void>
}

/**
 * A Ref-backed in-memory table — no IndexedDB, so full programs (exportData,
 * importData, anything composed over a repo) run in the Node unit tier.
 *
 * One implementation rather than three near-identical ones. The four
 * operations below carry no per-table semantics at all, so writing them out
 * per repository bought nothing and risked exactly the divergence a fake is
 * supposed to rule out. What *is* per-table — the newest-first ordering
 * workouts read in, the deactivation enrolments write through — stays in the
 * repository, where `list` and `insert` compose over this.
 *
 * `insert` and `putMany` take an optional rewrite for the rows already there,
 * so a table with a "one of these is active" invariant can enforce it in the
 * same update — which is as atomic as a `Ref` gets, and is what the real
 * table's transaction buys.
 */
export const inMemoryTable = <A extends { readonly id: string }>(
  name: string,
): Effect.Effect<InMemoryTable<A>> =>
  Effect.gen(function* () {
    const rows = yield* Ref.make<ReadonlyMap<string, A>>(new Map())

    const putMany = Effect.fn(`${name}.Test.putMany`)(function* (
      incoming: ReadonlyArray<A>,
      rewrite?: (existing: A) => A,
    ) {
      yield* Ref.update(rows, (current) => {
        const next = new Map<string, A>()
        for (const [id, existing] of current) next.set(id, rewrite ? rewrite(existing) : existing)
        for (const row of incoming) next.set(row.id, row)
        return next
      })
    })

    return {
      putMany,

      list: Effect.fn(`${name}.Test.list`)(function* () {
        return [...(yield* Ref.get(rows)).values()]
      }),

      remove: Effect.fn(`${name}.Test.remove`)(function* (id: string) {
        yield* Ref.update(rows, (current) => {
          const next = new Map(current)
          next.delete(id)
          return next
        })
      }),

      clear: Effect.fn(`${name}.Test.clear`)(function* () {
        yield* Ref.set(rows, new Map())
      }),

      insert: (row: A, rewrite?: (existing: A) => A) => putMany([row], rewrite),
    }
  })
