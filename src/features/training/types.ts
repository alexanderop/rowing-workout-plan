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
 * The five shapes a session can take, as data as well as a type.
 *
 * The runtime array is the declaration and the union is derived from it, so
 * there is exactly one place a sixth kind gets added. A hand-written union
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
 */
export const SESSION_KINDS = [
  'steady',
  'shortRest',
  'longRest',
  'pacedTwoK',
  'distancePiece',
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
}

/** A week of the plan. `index` is 1-based, because every screen says "Week 3". */
export interface PlanWeek {
  readonly index: number
  readonly sessions: readonly PlanSession[]
}

/** A catalogue entry. `source` is the attribution the Plans screen prints. */
export interface Plan {
  readonly id: string
  readonly name: string
  readonly source: string
  readonly weeks: readonly PlanWeek[]
}
