import {
  definePlan,
  longRest,
  MINUTE_MS,
  pacedTwoK,
  piece,
  rotating,
  shortRest,
  steady,
} from './build'
import type { SessionBody, WeekBody } from './build'
import type { Plan } from '../types'

/**
 * Twelve weeks, 71 sessions, tapering into a 5k test.
 *
 * **Adapted from thepeteplan.com, not transcribed from it.** The Pete Plan as
 * Pete Marston publishes it is a *continuous* plan: a three-week cycle of six
 * sessions repeated indefinitely, built on `8 x 500m / 3:30r`-style speed
 * intervals and `5 x 1500m / 5:00r`-style endurance intervals, with the rest
 * roughly twice the work. This is a twelve-week course built on the same
 * three-week rotation idea but different sessions — shorter rests, a
 * rotation-ending paced 2k, and an end date. The published plan is a separate
 * catalogue entry still to come (the Plans screen lists it as "Ongoing"), and
 * it should not be folded into this one.
 *
 * What is *not* invented is week 3: `[steady, 6x1k/1', steady, 4x1800m/4',
 * steady, 3x2k/3']` is pinned by the design canvas, and every other week is
 * built from the same rotation so that week falls out of the general rule.
 * `pete5k.spec.ts` is where that pin lives.
 *
 * The shape of the thing is the point. Four rotations of three weeks: within a
 * rotation the reps lengthen at the same target pace, and the next rotation
 * restarts short and a touch faster. That is the plan's entire progression
 * model, so it is expressed once — as the three-element rotation tables below
 * — rather than typed out twelve times. Changing a session shape is editing
 * one row here; the weeks regenerate.
 */

const ROTATIONS = 4
const ROTATION_WEEKS = 3
const FINAL_WEEK = ROTATIONS * ROTATION_WEEKS

/**
 * The floor on a steady row, with no ceiling — the screens say "10k+". Steady
 * volume is the half of this plan that is bounded by a rower's week rather
 * than by the plan, so it states a minimum and stops.
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
    overrides: { [FINAL_WEEK]: TAPER_WEEK },
  }),
})
