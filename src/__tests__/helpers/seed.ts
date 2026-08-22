import { Effect } from 'effect'
import type { WorkoutDraft } from '@/db'
import { enrolInPlan, logWorkout, recordBenchmark, runDb } from '@/db'

/**
 * Rows a training screen needs to already exist before it mounts.
 *
 * Read atoms load on subscribe and are only re-read when a write goes through
 * `dbMutation`, so a row written *after* the screen is on screen does not
 * appear — which is correct, and means seeding has to happen before the mount.
 * The `plans` fixture (src/__tests__/fixtures.ts) is what enforces that order;
 * this is the part it runs.
 *
 * Written through the repositories rather than into Dexie directly, so a seed
 * is a state the app itself can actually reach. A fixture that writes a row no
 * repository would accept tests a screen against data it will never see.
 */
export interface TrainingSeed {
  /** A 2k, in milliseconds. `7:04.2` is `424_200`. */
  readonly benchmark2kMs?: number
  /** The plan to be enrolled in, by catalogue id. */
  readonly planId?: string
  /** Plan session ids to log a workout against — what makes a session "done". */
  readonly completed?: ReadonlyArray<string>
  /**
   * Whole workouts, for the screens that show what was rowed rather than
   * only that it was. Anything left out falls back to {@link WORKOUT}.
   */
  readonly workouts?: ReadonlyArray<Partial<WorkoutDraft>>
}

/**
 * A plausible finished piece. The numbers are only there because the row
 * requires them: what any of this seeds is the `planSessionId`.
 */
const WORKOUT = {
  source: 'manual',
  distanceM: 6000,
  durationMs: 1_500_000,
  avgSplitMs: 125_000,
} as const

export function seedTraining(seed: TrainingSeed): Promise<void> {
  return runDb(
    Effect.gen(function* () {
      if (seed.benchmark2kMs !== undefined)
        yield* recordBenchmark({ kind: '2k', timeMs: seed.benchmark2kMs })

      if (seed.planId !== undefined) yield* enrolInPlan({ planId: seed.planId })

      for (const planSessionId of seed.completed ?? [])
        yield* logWorkout({ ...WORKOUT, planSessionId })

      for (const workout of seed.workouts ?? []) yield* logWorkout({ ...WORKOUT, ...workout })
      // A rejected seed is a broken test, not a case under test — `orDie`
      // turns it into a defect that fails loudly here rather than a screen
      // quietly rendering an empty plan three assertions later.
    }).pipe(Effect.orDie, Effect.asVoid),
  )
}
