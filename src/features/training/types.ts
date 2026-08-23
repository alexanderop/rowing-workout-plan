import type { MessageSchema } from '@/i18n/types'

/**
 * The vocabulary a training plan is written in.
 *
 * A plan is immutable data — a catalogue entry, not a row. Nothing here is
 * persisted: an enrolment stores a `planId` and the workouts store a
 * `planSessionId`, so the plan itself is always looked up from the catalogue
 * and never copied into the database. That is why these are plain interfaces
 * rather than the `Schema.Struct` + same-name `interface` pair every stored
 * row gets — there is no decode step to be the source of truth for, and a
 * schema here would imply the shape can arrive from outside the bundle.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

/**
 * The seven shapes a session can take, as data as well as a type.
 *
 * The runtime array is the declaration and the union is derived from it, so
 * there is exactly one place an eighth kind gets added. A hand-written union
 * beside a hand-written array is the version of this that drifts.
 *
 * - `steady` — aerobic distance, `minDistanceM` and no upper bound ("10k+").
 * - `shortRest` — intervals whose rest is far shorter than the work.
 * - `longRest` — intervals whose rest is comparable to the work.
 * - `pacedTwoK` — three 2k reps that are *not* three hard 2ks: the middle one
 *   is a submaximal test and the outer two are steady-paced either side of it.
 *   The per-rep intent lives in `targets.ts`; the catalogue only says which
 *   session is one, because pacing it as three flat-out 2ks is the single
 *   most damaging way to get this plan wrong.
 * - `distancePiece` — one hard continuous piece of a stated `distanceM`.
 * - `timedSteady` — one continuous piece of a stated `durationMs` ("30′").
 * - `timedIntervals` — timed reps split by rest ("3 × 10′ / 2′ rest").
 *
 * The last two are named for their *pacing*, not by symmetry with
 * `distancePiece`. A `distancePiece` is a hard test piece; a timed session is
 * aerobic work the clock happens to bound instead of the monitor — Pete's own
 * "Group 1" — and a `timePiece` sitting beside `distancePiece` would invite
 * exactly the wrong target. The names carry the intensity because
 * `targets.ts` keys off the kind and nothing else.
 */
export const SESSION_KINDS = [
  'steady',
  'shortRest',
  'longRest',
  'pacedTwoK',
  'distancePiece',
  'timedSteady',
  'timedIntervals',
] as const

export type SessionKind = (typeof SESSION_KINDS)[number]

/**
 * One session in a plan.
 *
 * The optional fields are a deliberate union-by-convention rather than a
 * discriminated union of five interfaces: every consumer switches on `kind`
 * anyway, and five interfaces would put the same `id` on all of them. Which
 * fields a kind carries is fixed by the catalogue and checked as an invariant
 * in its spec, not by the type — `catalog.spec.ts` is where a `shortRest`
 * with no `reps` is caught.
 *
 * Distances are metres and every duration is milliseconds, matching `pace.ts`
 * so a rest period and a split are never in different units in one expression.
 */
export interface PlanSession {
  readonly id: string
  readonly kind: SessionKind
  /** Interval kinds only: how many reps. */
  readonly reps?: number
  /** Interval kinds only: the distance of one rep. */
  readonly repDistanceM?: number
  /** Interval kinds only: the rest taken *between* reps, so there are `reps - 1` of them. */
  readonly restMs?: number
  /** `distancePiece` only: the exact distance of the piece. */
  readonly distanceM?: number
  /** `steady` only: the floor, with no ceiling — row further if you have the time. */
  readonly minDistanceM?: number
  /** `timedSteady` only: the length of the piece. */
  readonly durationMs?: number
  /** `timedIntervals` only: the length of one rep. */
  readonly repDurationMs?: number
  /**
   * A session the plan offers without requiring it — Pete's [square brackets].
   *
   * One-way on purpose: absent means required, and nothing writes `false`. A
   * flag that can be present-and-false is a third state every reader has to
   * think about to reach the same answer. `schedule.ts` skips these when it
   * decides what is next, and `progress.ts` leaves them out of the weekly
   * commitment; everything else lists them like any other session.
   */
  readonly optional?: boolean
}

/** A week of the plan. `index` is 1-based, because every screen says "Week 3". */
export interface PlanWeek {
  readonly index: number
  readonly sessions: readonly PlanSession[]
}

/**
 * The i18n key for a plan's description, narrowed to the keys that exist.
 *
 * `string` was the version of this that let a plan point at a message nobody
 * wrote and print the raw key on a browse card. `i18nKeys.test.ts` does not
 * close that hole either — it flags keys nothing *names*, not names with no
 * key — so the type is where it gets closed: deleting
 * `plans.catalog.pete5kLite` from `en.ts` is now a compile error at the plan
 * that referenced it.
 *
 * The import is type-only, so nothing about the core's purity changes: no
 * runtime edge is added and `@/i18n` is a shared layer a feature may read.
 */
export type PlanDescriptionKey =
  `plans.catalog.${string & keyof MessageSchema['plans']['catalog']}.description`

/**
 * A catalogue entry.
 *
 * `name` is a proper name and is never translated — "Pete Plan 5k" is what it
 * is called in every language — while `descriptionKey` is the i18n key for
 * the sentence a browse card prints under it, and `source` the attribution
 * that card carries.
 *
 * The key travels with the entry rather than being looked up by id in the
 * component, so a plan added to the catalogue without a description does not
 * compile. A map on the other side would have let it ship and print the raw
 * key on screen.
 */
export interface Plan {
  readonly id: string
  readonly name: string
  readonly descriptionKey: PlanDescriptionKey
  readonly source: string
  /**
   * The length of one pass through the plan's cycle, in weeks.
   *
   * Plan *length* is `weeks.length` and stays derived — a second field for it
   * could disagree with the array — but the rotation is not derivable from the
   * weeks, because the weeks are generated from it. `schedule.ts` locates a
   * rower by this number, so it belongs to the plan rather than to the module
   * that happens to lay one out.
   */
  readonly rotationWeeks: number
  readonly weeks: readonly PlanWeek[]
}
