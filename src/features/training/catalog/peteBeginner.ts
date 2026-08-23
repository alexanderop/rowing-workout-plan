import {
  definePlan,
  longRest,
  MINUTE_MS,
  optional,
  shortRest,
  steady,
  timedIntervals,
  timedSteady,
} from './build'
import type { SessionBody, WeekBody } from './build'
import type { Plan } from '../types'

/**
 * The published 24 week 'Pete Plan' Beginner Training, transcribed.
 *
 * Transcribed rather than adapted, unlike the two 5k plans beside it: this
 * one is printed week by week on thepeteplan.com and there is nothing to
 * derive. What is below is that page, in its order, with the rest times it
 * states. `peteBeginner.spec.ts` pins the numbers, because a transcription
 * that is wrong is wrong *consistently* and every invariant still passes.
 *
 * ## Three sessions a week, and two you might pick up
 *
 * Pete writes each week as three core sessions plus two in [square brackets]:
 * "complete the core workouts every week, and when you have the time and
 * motivation you might pick one of the optional workouts on occasional
 * weeks". Those are the `optional(...)` entries, always the fourth and fifth
 * of a week — appended, never interleaved, because the ids are positional.
 *
 * ## No rotation
 *
 * All 24 weeks differ, so they are written out literally rather than
 * generated, and `rotationWeeks` is the plan's own length: one pass through
 * the cycle *is* the plan. That keeps `targets.ts`'s per-rotation step from
 * ever firing, which is right — a beginner's target comes from their 2k, not
 * from how many weeks they have been at it.
 *
 * ## Which interval kind a session is
 *
 * A distance interval is `longRest` when its rest is at least 60% of the
 * estimated work time, and `shortRest` below that, at a nominal beginner pace
 * of 2:00/500m. That reproduces Pete's own three groups from the page's
 * "desired training effect" section — his Group 3 speed sessions (500m to
 * 1000m reps) land on `longRest`, his Group 2 speed-endurance sessions (1500m
 * and 2000m reps) on `shortRest` — and it agrees with how `pete5k` already
 * uses the two kinds. His Group 1 endurance work is `steady`, `timedSteady`
 * and `timedIntervals`.
 *
 * **One deviation, deliberate.** Week 4's optional `2 x 2500m / 2min` is a
 * 20% ratio and so lands on `shortRest`, which paces it at 2k+6s where Pete
 * describes it as endurance work nearer 2k+20s. The catalogue has no
 * steady-paced *distance*-interval kind, and one session in 120 does not
 * justify an eighth. It is pinned in the spec so nobody quietly "fixes" it,
 * and recorded under Known limits in docs/adding-a-plan.md.
 */

/** Minutes, in the milliseconds every duration in the app is stated in. */
const mins = (count: number): number => count * MINUTE_MS

/**
 * A week as the page prints it: three core sessions, then the two in
 * brackets. Wrapping the last two here rather than at each of the 48 call
 * sites is what makes the table below readable as the published plan.
 */
const week = (
  first: SessionBody,
  second: SessionBody,
  third: SessionBody,
  fourth: SessionBody,
  fifth: SessionBody,
): WeekBody => [first, second, third, optional(fourth), optional(fifth)]

/**
 * The plan, one entry per week.
 *
 * Weeks 1-11 are two single distance rows either side of one interval
 * session, the rows climbing 500m a week from 5000m. From week 12 the rows
 * plateau and the second of them becomes timed endurance work instead.
 */
const WEEKS: readonly WeekBody[] = [
  // Week 1. Pete's note: halve every session on a first pass through the plan
  // if even this looks like too much.
  week(
    steady(5000),
    longRest(6, 500, mins(2)),
    steady(5000),
    timedSteady(mins(20)),
    timedIntervals(2, mins(10), mins(2)),
  ),
  week(
    steady(5500),
    longRest(4, 750, mins(2)),
    steady(5500),
    timedSteady(mins(20)),
    timedIntervals(3, mins(8), mins(2)),
  ),
  week(
    steady(6000),
    shortRest(2, 2000, mins(4)),
    steady(6000),
    steady(5000),
    longRest(6, 500, mins(2)),
  ),
  week(
    steady(6500),
    longRest(3, 1000, mins(3)),
    steady(6500),
    steady(6000),
    shortRest(2, 2500, mins(2)),
  ),
  week(
    steady(7000),
    longRest(4, 800, mins(2)),
    steady(7000),
    timedSteady(mins(20)),
    timedIntervals(2, mins(10), mins(2)),
  ),
  week(
    steady(7500),
    shortRest(3, 2000, mins(4)),
    steady(7500),
    steady(5000),
    longRest(6, 500, mins(2)),
  ),
  week(
    steady(8000),
    longRest(7, 500, mins(2)),
    steady(8000),
    steady(6000),
    shortRest(3, 1500, mins(3)),
  ),
  week(
    steady(8500),
    shortRest(4, 1500, mins(3)),
    steady(8000),
    timedSteady(mins(25)),
    longRest(3, 1000, mins(3)),
  ),
  week(
    steady(9000),
    longRest(4, 800, mins(2)),
    steady(8000),
    steady(8000),
    timedIntervals(2, mins(10), mins(2)),
  ),
  week(
    steady(9500),
    shortRest(3, 2000, mins(4)),
    steady(8000),
    steady(8000),
    longRest(7, 500, mins(2)),
  ),
  week(
    steady(10_000),
    longRest(8, 500, mins(2)),
    steady(8000),
    timedSteady(mins(25)),
    shortRest(4, 1500, mins(3)),
  ),
  // Week 12. The single rows stop climbing and the third core session becomes
  // timed endurance work — the shape the rest of the plan keeps.
  week(
    steady(10_000),
    shortRest(4, 1500, mins(3)),
    timedIntervals(3, mins(10), mins(2)),
    steady(8000),
    longRest(4, 800, mins(2)),
  ),
  week(
    steady(10_000),
    longRest(4, 1000, mins(3)),
    timedIntervals(2, mins(15), mins(2)),
    steady(8000),
    shortRest(3, 2000, mins(4)),
  ),
  week(
    steady(10_000),
    shortRest(3, 2000, mins(4)),
    timedIntervals(4, mins(8), mins(2)),
    timedSteady(mins(30)),
    longRest(7, 500, mins(2)),
  ),
  week(
    steady(10_000),
    longRest(5, 750, mins(2)),
    timedIntervals(3, mins(10), mins(2)),
    steady(8000),
    shortRest(4, 1500, mins(3)),
  ),
  // Week 16. Over-distance: 10k is the training distance, and going past it is
  // what brings 10k inside your range.
  week(
    steady(10_500),
    shortRest(5, 1500, mins(3)),
    timedSteady(mins(30)),
    steady(10_000),
    longRest(4, 1000, mins(3)),
  ),
  week(
    steady(10_500),
    longRest(8, 500, mins(2)),
    timedIntervals(2, mins(15), mins(2)),
    timedSteady(mins(30)),
    timedIntervals(4, mins(8), mins(2)),
  ),
  week(
    steady(11_000),
    shortRest(4, 2000, mins(4)),
    timedSteady(mins(30)),
    steady(10_000),
    longRest(4, 1000, mins(3)),
  ),
  // Week 19. Back to 10k after three weeks above it, to go at the personal best.
  week(
    steady(10_000),
    longRest(5, 800, mins(2)),
    timedIntervals(3, mins(10), mins(2)),
    timedSteady(mins(30)),
    shortRest(4, 2000, mins(4)),
  ),
  week(
    steady(12_000),
    shortRest(5, 1500, mins(3)),
    timedSteady(mins(30)),
    steady(10_000),
    longRest(8, 500, mins(2)),
  ),
  week(
    steady(10_000),
    longRest(4, 1000, mins(3)),
    timedIntervals(4, mins(8), mins(2)),
    steady(12_000),
    shortRest(5, 1500, mins(3)),
  ),
  week(
    steady(12_000),
    shortRest(4, 2000, mins(4)),
    timedSteady(mins(30)),
    timedIntervals(3, mins(10), mins(2)),
    longRest(5, 800, mins(2)),
  ),
  week(
    steady(10_000),
    longRest(8, 500, mins(2)),
    timedIntervals(2, mins(15), mins(2)),
    steady(10_000),
    shortRest(4, 2000, mins(4)),
  ),
  // Week 24. No taper — the plan ends on its own hardest week, and a 2k test
  // is what comes after it.
  week(
    steady(12_000),
    shortRest(5, 1500, mins(3)),
    timedSteady(mins(30)),
    timedIntervals(2, mins(15), mins(2)),
    longRest(4, 1000, mins(3)),
  ),
]

export const peteBeginner: Plan = definePlan({
  id: 'pete-beginner',
  name: 'Pete Plan — Beginner',
  descriptionKey: 'plans.catalog.peteBeginner.description',
  source: 'thepeteplan.com',
  rotationWeeks: 24,
  weeks: WEEKS,
})
