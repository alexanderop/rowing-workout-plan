/**
 * Public surface of the persistence layer. Everything outside src/db
 * imports from here — never from schema.ts or the repositories directly.
 * That keeps the storage engine swappable and is enforced by the
 * architecture tests (src/__tests__/architecture).
 *
 * The API is Effect-based: each operation is a program with its failures in
 * the type (`Effect<A, BackupInvalidError | …>`). Compose those programs with
 * `Effect.*` combinators all the way into the component and handle every
 * failure with `Effect.catchTag`/`Effect.catchTags` — both execution edges
 * accept only programs whose error channel is `never`:
 *
 * - Reads that drive the UI are atoms built on `dbRuntime`; wire them with
 *   `Atom.withReactivity([…])` so writes refresh them.
 * - Writes run through the `dbMutation` fn atom, which invalidates those
 *   keys after the program lands.
 * - `runDb` remains the imperative edge for programs that read and leave
 *   (backup export, test assertions) — nothing there to invalidate.
 */
export { dbMutation } from './atoms'
export { exportData, importData } from './backup'
export { runDb } from './runtime'
export { resetDatabase } from './schema'
