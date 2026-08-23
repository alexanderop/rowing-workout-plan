import type { Plan } from './types'

import {
  definePlan,
  longRest,
  pacedTwoK,
  piece,
  rotating,
  shortRest,
  steady,
} from './catalog/build'
import type { SessionBody, WeekBody } from './catalog/build'

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
 * Four rotations of three weeks, which is the pete5k family's shape and no
 * longer the catalogue's: `rotating` takes both as arguments and the `Plan`
 * carries `rotationWeeks` on to `schedule.ts`.
 */
const ROTATIONS = 4
const ROTATION_WEEKS = 3

/**
 * The floor on a steady row, with no ceiling — the screens say "10k+". Steady
 * volume is the half of this plan that is bounded by a rower's week rather
 * than by the plan, so the catalogue states a minimum and stops.
 */
const STEADY = steady(10_000)

/**
 * The three rotation tables, indexed by a week's place in its rotation (0, 1,
 * 2). Reading down a column is one rotation; the reps lengthen as you go.
 *
 * Rest is constant within a table on purpose: it is what distinguishes the two
 * interval kinds from each other, so varying it week to week would make
 * "short rest" mean something different in week 1 than in week 3.
 */
const SHORT_REST_ROTATION: readonly SessionBody[] = [
  shortRest(8, 500, MINUTE_MS),
  shortRest(6, 750, MINUTE_MS),
  shortRest(6, 1000, MINUTE_MS),
]

const LONG_REST_ROTATION: readonly SessionBody[] = [
  longRest(5, 1000, 4 * MINUTE_MS),
  longRest(4, 1500, 4 * MINUTE_MS),
  longRest(4, 1800, 4 * MINUTE_MS),
]

/**
 * The week's one hard continuous effort, except at the end of a rotation,
 * where it becomes the paced 2k that sets the next rotation's targets. The
 * rotation has to end on a measurement or there is nothing to go "a touch
 * faster" than.
 */
const HARD_PIECE_ROTATION: readonly SessionBody[] = [
  piece(5000),
  piece(6000),
  pacedTwoK(3, 2000, 3 * MINUTE_MS),
]

/**
 * Six sessions: three steady rows interleaved with the week's three hard ones,
 * so no two hard sessions ever land on consecutive days.
 */
const fullWeek = (slot: number): WeekBody => [
  STEADY,
  SHORT_REST_ROTATION[slot],
  STEADY,
  LONG_REST_ROTATION[slot],
  STEADY,
  HARD_PIECE_ROTATION[slot],
]

/**
 * The 5k the whole plan is named for. It replaces week 12's paced 2k, and the
 * third steady row of that week is dropped with it — which is why the full
 * plan is 71 sessions and not 72. A taper is the one week where less work is
 * the work.
 *
 * Week 12 sits at the last slot of its rotation, so it keeps that slot's
 * intervals and loses only the closer and the steady row before it.
 */
const TAPER_WEEK: WeekBody = [
  STEADY,
  SHORT_REST_ROTATION[ROTATION_WEEKS - 1],
  STEADY,
  LONG_REST_ROTATION[ROTATION_WEEKS - 1],
  piece(5000),
]

/** Twelve weeks, 71 sessions, tapering into a 5k test. */
export const pete5k: Plan = definePlan({
  id: 'pete5k',
  name: 'Pete Plan 5k',
  descriptionKey: 'plans.catalog.pete5k.description',
  source: 'thepeteplan.com',
  rotationWeeks: ROTATION_WEEKS,
  weeks: rotating({
    rotations: ROTATIONS,
    rotationWeeks: ROTATION_WEEKS,
    week: fullWeek,
    overrides: { [ROTATIONS * ROTATION_WEEKS]: TAPER_WEEK },
  }),
})

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
const LITE_SHORT_REST_ROTATION: readonly SessionBody[] = [
  shortRest(6, 500, MINUTE_MS),
  shortRest(5, 750, MINUTE_MS),
  shortRest(4, 1000, MINUTE_MS),
]

/**
 * Two rows, not three: the third week of every rotation closes on the paced
 * 2k instead, so a third row here would be data nothing reads. (Mutation
 * testing is what caught that — a row no code path reaches cannot be killed.)
 */
const LITE_LONG_REST_ROTATION: readonly SessionBody[] = [
  longRest(4, 1000, 4 * MINUTE_MS),
  longRest(3, 1500, 4 * MINUTE_MS),
]

const liteWeek = (slot: number): WeekBody => [
  LITE_SHORT_REST_ROTATION[slot],
  STEADY,
  slot === ROTATION_WEEKS - 1 ? pacedTwoK(3, 2000, 3 * MINUTE_MS) : LITE_LONG_REST_ROTATION[slot],
]

/**
 * The same twelve weeks at three sessions each: 36. No taper — there is no
 * volume to taper from, so week 12 ends on the paced 2k like every other
 * rotation does.
 */
export const pete5kLite: Plan = definePlan({
  id: 'pete5k-lite',
  name: 'Pete Plan 5k — Lite',
  descriptionKey: 'plans.catalog.pete5kLite.description',
  source: 'thepeteplan.com',
  rotationWeeks: ROTATION_WEEKS,
  weeks: rotating({ rotations: ROTATIONS, rotationWeeks: ROTATION_WEEKS, week: liteWeek }),
})

/** Everything the Plans screen lists, in the order it lists it. */
export const PLANS: readonly Plan[] = [pete5k, pete5kLite]
