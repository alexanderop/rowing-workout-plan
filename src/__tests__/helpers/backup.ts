/**
 * A backup payload the app accepts, for tests that need to drive an import
 * without caring what is in it.
 *
 * Spelled out as a literal rather than produced by `exportData`: a test that
 * builds its fixture with the code under test cannot tell a broken encoder
 * from a broken decoder. The version has to track `BACKUP_VERSION` in
 * `src/db/backup.ts`, and the round-trip spec in `db/backup.spec.ts` is what
 * fails if it drifts.
 */
export const EMPTY_BACKUP = {
  app: 'vue-pwa-starter',
  version: 3,
  exportedAt: '2024-01-01T00:00:00.000Z',
} as const

/** The shape of the fixture above, for anything that passes one around. */
export type BackupFixture = typeof EMPTY_BACKUP
