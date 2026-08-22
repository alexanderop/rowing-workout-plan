/**
 * Backup payloads the app accepts, for tests that need to drive an import.
 *
 * Spelled out as literals rather than produced by `exportData`: a test that
 * builds its fixture with the code under test cannot tell a broken encoder
 * from a broken decoder. The version has to track `BACKUP_VERSION` in
 * `src/db/backup.ts`, and the round-trip spec in `db/backup.spec.ts` is what
 * fails if it drifts.
 */
export const EMPTY_BACKUP = {
  app: 'vue-pwa-starter',
  version: 4,
  exportedAt: '2024-01-01T00:00:00.000Z',
  benchmarks: [],
  enrolments: [],
  workouts: [],
} as const

/**
 * One row of each table, with a workout that carries intervals and a
 * `planSessionId`. This is the payload the round-trip assertions use, because
 * an empty backup round-trips whether or not any table reaches the envelope.
 */
export const FULL_BACKUP = {
  app: 'vue-pwa-starter',
  version: 4,
  exportedAt: '2024-01-01T00:00:00.000Z',
  benchmarks: [{ id: 'bench-1', kind: '2k', timeMs: 424_200, recordedAt: 1_700_000_000_000 }],
  enrolments: [{ id: 'enrol-1', planId: 'pete5k', startedAt: 1_700_000_000_000, active: true }],
  workouts: [
    {
      id: 'workout-1',
      startedAt: 1_700_000_100_000,
      source: 'erg',
      planSessionId: 'pete5k-w3-s2',
      distanceM: 6000,
      durationMs: 1_348_800,
      avgSplitMs: 112_400,
      avgWatts: 246.47,
      avgRate: 25,
      intervals: [
        { index: 0, distanceM: 1000, durationMs: 224_800, splitMs: 112_400, restMs: 60_000 },
        { index: 1, distanceM: 1000, durationMs: 224_800, splitMs: 112_400, restMs: 0 },
      ],
    },
  ],
} as const

/**
 * A backup from before the training tables existed: version 3 carried an
 * envelope and nothing else. Kept as a fixture so the rejection is asserted
 * against a real historical payload rather than an invented one.
 */
export const V3_BACKUP = {
  app: 'vue-pwa-starter',
  version: 3,
  exportedAt: '2024-01-01T00:00:00.000Z',
} as const

/** The shape of the fixture above, for anything that passes one around. */
export type BackupFixture = typeof EMPTY_BACKUP
