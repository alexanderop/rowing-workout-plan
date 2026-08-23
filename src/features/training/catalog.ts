import type { Plan, PlanSession, PlanWeek, SessionKind } from './types'

/**
 * The plans, as immutable data.
 *
 * **Adapted from thepeteplan.com, not transcribed from it.** The Pete Plan as
 * Pete Marston publishes it is a *continuous* plan: a three-week cycle of six
 * sessions repeated indefinitely, built on `8 x 500m / 3:30r`-style speed
 * intervals and `5 x 1500m / 5:00r`-style endurance intervals, with the rest
 * roughly twice the work. `pete5k` below is a twelve-week course built on the
 * same three-week rotation idea but different sessions — shorter rests, a
 * rotation-ending paced 2k, and an end date. The published plan is a separate
 * catalogue entry still to come (the Plans screen lists it as "Ongoing"), and
 * it should not be folded into this one.
 *
 * What is *not* invented is week 3: `[steady, 6x1k/1', steady, 4x1800m/4',
 * steady, 3x2k/3']` is pinned by the design canvas, and every other week is
 * built from the same rotation so that week falls out of the general rule.
 *
 * The shape of the thing is the point. Four rotations of three weeks: within a
 * rotation the reps lengthen at the same target pace, and the next rotation
 * restarts short and a touch faster. That is the plan's entire progression
 * model, so it is expressed once — as the three-element rotation tables below
 * — rather than typed out twelve times. Changing a session shape is editing
 * one row here; the weeks regenerate.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

const MINUTE_MS = 60_000

/**
 * Weeks in one rotation, and weeks in a plan: four rotations of three.
 *
 * Local to this file. The rotation is not an artefact of how weeks are laid
 * out — it is the structure the Plan week screen explains and the structure
 * `targets.ts` shifts by — so it travels on the `Plan` as `rotationWeeks`,
 * and `schedule.ts` reads it from there. These two are what the plans below
 * happen to be built from, and a third plan is free to be built from others.
 */
const ROTATION_WEEKS = 3
const PLAN_WEEKS = 12

/**
 * The floor on a steady row, with no ceiling — the screens say "10k+". Steady
 * volume is the half of this plan that is bounded by a rower's week rather
 * than by the plan, so the catalogue states a minimum and stops.
 */
const STEADY_MIN_DISTANCE_M = 10_000

/** A session before it has a place in a plan, and so before it has an id. */
type SessionBody = Omit<PlanSession, 'id'>

/** What an interval session prescribes, identical in every field but its kind. */
interface Prescription {
  readonly reps: number
  readonly repDistanceM: number
  readonly restMs: number
}

function intervals(kind: SessionKind, prescription: Prescription): SessionBody {
  return { kind, ...prescription }
}

const STEADY: SessionBody = { kind: 'steady', minDistanceM: STEADY_MIN_DISTANCE_M }

/**
 * The three rotation tables, indexed by a week's place in its rotation (0, 1,
 * 2). Reading down a column is one rotation; the reps lengthen as you go.
 *
 * Rest is constant within a table on purpose: it is what distinguishes the two
 * interval kinds from each other, so varying it week to week would make
 * "short rest" mean something different in week 1 than in week 3.
 */
const SHORT_REST_ROTATION: readonly Prescription[] = [
  { reps: 8, repDistanceM: 500, restMs: MINUTE_MS },
  { reps: 6, repDistanceM: 750, restMs: MINUTE_MS },
  { reps: 6, repDistanceM: 1000, restMs: MINUTE_MS },
]

const LONG_REST_ROTATION: readonly Prescription[] = [
  { reps: 5, repDistanceM: 1000, restMs: 4 * MINUTE_MS },
  { reps: 4, repDistanceM: 1500, restMs: 4 * MINUTE_MS },
  { reps: 4, repDistanceM: 1800, restMs: 4 * MINUTE_MS },
]

/**
 * The week's one hard continuous effort, except at the end of a rotation,
 * where it becomes the paced 2k that sets the next rotation's targets. The
 * rotation has to end on a measurement or there is nothing to go "a touch
 * faster" than.
 */
const HARD_PIECE_ROTATION: readonly SessionBody[] = [
  { kind: 'distancePiece', distanceM: 5000 },
  { kind: 'distancePiece', distanceM: 6000 },
  intervals('pacedTwoK', { reps: 3, repDistanceM: 2000, restMs: 3 * MINUTE_MS }),
]

/**
 * The 5k the whole plan is named for. It replaces week 12's paced 2k, and the
 * third steady row of that week is dropped with it — which is why the full
 * plan is 71 sessions and not 72. A taper is the one week where less work is
 * the work.
 */
const FIVE_K_TEST: SessionBody = { kind: 'distancePiece', distanceM: 5000 }

/**
 * Six sessions: three steady rows interleaved with the week's three hard ones,
 * so no two hard sessions ever land on consecutive days.
 */
function fullWeek(slot: number, isFinalWeek: boolean): readonly SessionBody[] {
  const short = intervals('shortRest', SHORT_REST_ROTATION[slot])
  const long = intervals('longRest', LONG_REST_ROTATION[slot])

  if (isFinalWeek) return [STEADY, short, STEADY, long, FIVE_K_TEST]
  return [STEADY, short, STEADY, long, STEADY, HARD_PIECE_ROTATION[slot]]
}

/**
 * The same rotation at half the weekly volume: one steady row instead of
 * three, and the hard distance piece dropped. What survives is one session of
 * each interval kind, because the rotation-ending paced 2k is what re-targets
 * the next rotation — a lite plan that never measures you cannot pace itself.
 *
 * The steady row keeps the full plan's 10k floor. "Lite" here is three
 * sessions a week rather than six and shorter reps within them, not an easier
 * definition of steady.
 */
const LITE_SHORT_REST_ROTATION: readonly Prescription[] = [
  { reps: 6, repDistanceM: 500, restMs: MINUTE_MS },
  { reps: 5, repDistanceM: 750, restMs: MINUTE_MS },
  { reps: 4, repDistanceM: 1000, restMs: MINUTE_MS },
]

/**
 * Two rows, not three: the third week of every rotation closes on the paced
 * 2k instead, so a third row here would be data nothing reads. (Mutation
 * testing is what caught that — a row no code path reaches cannot be killed.)
 */
const LITE_LONG_REST_ROTATION: readonly Prescription[] = [
  { reps: 4, repDistanceM: 1000, restMs: 4 * MINUTE_MS },
  { reps: 3, repDistanceM: 1500, restMs: 4 * MINUTE_MS },
]

function liteWeek(slot: number): readonly SessionBody[] {
  const short = intervals('shortRest', LITE_SHORT_REST_ROTATION[slot])
  const closer =
    slot === ROTATION_WEEKS - 1
      ? intervals('pacedTwoK', { reps: 3, repDistanceM: 2000, restMs: 3 * MINUTE_MS })
      : intervals('longRest', LITE_LONG_REST_ROTATION[slot])

  return [short, STEADY, closer]
}

/**
 * Lays the rotation out over twelve weeks and gives every session an id.
 *
 * The id is positional — `pete5k-w3-s2` — which makes it stable across a
 * rebuild, readable in a database row, and derivable from a screen the user is
 * looking at. It is also why nothing may be inserted into the middle of a week
 * later: an id that moves silently re-points every completed workout.
 */
function buildPlan(
  id: string,
  name: string,
  descriptionKey: string,
  source: string,
  weekBody: (slot: number, isFinalWeek: boolean) => readonly SessionBody[],
): Plan {
  const weeks: PlanWeek[] = []

  for (let weekIndex = 1; weekIndex <= PLAN_WEEKS; weekIndex += 1) {
    const slot = (weekIndex - 1) % ROTATION_WEEKS
    const bodies = weekBody(slot, weekIndex === PLAN_WEEKS)

    weeks.push({
      index: weekIndex,
      sessions: bodies.map((body, position) => ({
        id: `${id}-w${weekIndex}-s${position + 1}`,
        ...body,
      })),
    })
  }

  return { id, name, descriptionKey, source, rotationWeeks: ROTATION_WEEKS, weeks }
}

/** Twelve weeks, 71 sessions, tapering into a 5k test. */
export const pete5k: Plan = buildPlan(
  'pete5k',
  'Pete Plan 5k',
  'plans.catalog.pete5k.description',
  'thepeteplan.com',
  (slot, isFinalWeek) => fullWeek(slot, isFinalWeek),
)

/** The same twelve weeks at three sessions each: 36. No taper — there is no
 * volume to taper from, so week 12 ends on the paced 2k like every other
 * rotation does. */
export const pete5kLite: Plan = buildPlan(
  'pete5k-lite',
  'Pete Plan 5k — Lite',
  'plans.catalog.pete5kLite.description',
  'thepeteplan.com',
  (slot) => liteWeek(slot),
)

/** Everything the Plans screen lists, in the order it lists it. */
export const PLANS: readonly Plan[] = [pete5k, pete5kLite]
