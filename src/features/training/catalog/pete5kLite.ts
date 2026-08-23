import { definePlan, longRest, MINUTE_MS, pacedTwoK, rotating, shortRest, steady } from './build'
import type { SessionBody, WeekBody } from './build'
import type { Plan } from '../types'

/**
 * The same twelve weeks at three sessions each: 36.
 *
 * `pete5k`'s rotation at half the weekly volume: one steady row instead of
 * three, and the hard distance piece dropped. What survives is one session of
 * each interval kind, because the rotation-ending paced 2k is what re-targets
 * the next rotation — a lite plan that never measures you cannot pace itself.
 *
 * The steady row keeps the full plan's 10k floor. "Lite" here is three
 * sessions a week rather than six and shorter reps within them, not an easier
 * definition of steady.
 *
 * No taper: there is no volume to taper from, so week 12 ends on the paced 2k
 * like every other rotation does — which is why there is no `overrides` entry
 * below where the full plan has one.
 *
 * A separate file rather than a parameter on `pete5k`: the two share a shape
 * and nothing else, and the day one of them changes its rotation the other
 * must not follow it silently.
 */

const ROTATIONS = 4
const ROTATION_WEEKS = 3

const STEADY = steady(10_000)

const SHORT_REST_ROTATION: readonly SessionBody[] = [
  shortRest(6, 500, MINUTE_MS),
  shortRest(5, 750, MINUTE_MS),
  shortRest(4, 1000, MINUTE_MS),
]

/**
 * Two rows, not three: the third week of every rotation closes on the paced
 * 2k instead, so a third row here would be data nothing reads. (Mutation
 * testing is what caught that — a row no code path reaches cannot be killed,
 * and an unreachable row survives every mutant applied to it.)
 */
const LONG_REST_ROTATION: readonly SessionBody[] = [
  longRest(4, 1000, 4 * MINUTE_MS),
  longRest(3, 1500, 4 * MINUTE_MS),
]

const liteWeek = (slot: number): WeekBody => [
  SHORT_REST_ROTATION[slot],
  STEADY,
  slot === ROTATION_WEEKS - 1 ? pacedTwoK(3, 2000, 3 * MINUTE_MS) : LONG_REST_ROTATION[slot],
]

export const pete5kLite: Plan = definePlan({
  id: 'pete5k-lite',
  name: 'Pete Plan 5k — Lite',
  descriptionKey: 'plans.catalog.pete5kLite.description',
  source: 'thepeteplan.com',
  rotationWeeks: ROTATION_WEEKS,
  weeks: rotating({ rotations: ROTATIONS, rotationWeeks: ROTATION_WEEKS, week: liteWeek }),
})
