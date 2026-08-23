import type { Plan, PlanSession, PlanWeek } from '../types'

/**
 * How a plan is put together, and the vocabulary it is written in.
 *
 * Two jobs used to be one function. Stamping positional ids on weeks is
 * mechanical and every plan needs it; generating those weeks from a rotation
 * table is one strategy among several. Welded together, a plan that is not
 * rotational could not use the id machinery at all — so they are `withIds` and
 * `rotating` here, and `definePlan` is the seam they meet at.
 *
 * A plan file calls `definePlan`, and reaches for `rotating` only if it is
 * built from a cycle. Writing twelve weeks out by hand is a supported way to
 * describe a plan; it is just a worse one for a plan with a cycle.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

/**
 * A minute in milliseconds, because a rest is written the way it is spoken.
 *
 * Distances are metres and every duration is milliseconds throughout the app
 * (`types.ts`), so `3 * MINUTE_MS` is a plan file saying "three minutes" in
 * the unit `pace.ts` reads without a conversion anywhere between.
 */
export const MINUTE_MS = 60_000

/** A session before it has a place in a plan, and so before it has an id. */
export type SessionBody = Omit<PlanSession, 'id'>

/** A week before its sessions have ids: just what to row, in order. */
export type WeekBody = readonly SessionBody[]

/**
 * Gives every session in every week a positional id.
 *
 * The id is positional — `pete5k-w3-s2` — which makes it stable across a
 * rebuild, readable in a database row, and derivable from a screen the user is
 * looking at. It is also why nothing may be inserted into the middle of an
 * existing week later: an id that moves silently re-points every completed
 * workout in the log at a different session.
 *
 * Appending to a week is safe. Reordering it is not, and neither is inserting.
 */
export function withIds(id: string, bodies: readonly WeekBody[]): readonly PlanWeek[] {
  return bodies.map((sessions, offset) => ({
    index: offset + 1,
    sessions: sessions.map((body, position) => ({
      id: `${id}-w${offset + 1}-s${position + 1}`,
      ...body,
    })),
  }))
}

/** A week the rotation does not produce, keyed by its 1-based index. */
type WeekOverrides = Readonly<Record<number, WeekBody>>

export interface RotatingSpec {
  /** How many times the cycle runs. */
  readonly rotations: number
  /** How many weeks one pass through the cycle takes. */
  readonly rotationWeeks: number
  /** One slot of the cycle, `0` to `rotationWeeks - 1`. */
  readonly week: (slot: number) => WeekBody
  /**
   * Weeks that leave the rotation, by 1-based index.
   *
   * A taper is the usual reason — `{ 12: taperWeek }` rather than a
   * `isFinalWeek` flag threaded into the slot function, because a plan whose
   * taper is two weeks long, or whose exceptional week is somewhere else
   * entirely, needs to say so without the slot function growing a second job.
   */
  readonly overrides?: WeekOverrides
}

/**
 * Lays a cycle out over `rotations × rotationWeeks` weeks.
 *
 * One strategy for producing the weeks `withIds` consumes, not the only one:
 * it is what a plan built on "the reps lengthen, then the cycle restarts a
 * touch faster" wants, and nothing else has to use it.
 */
export function rotating({
  rotations,
  rotationWeeks,
  week,
  overrides = {},
}: RotatingSpec): readonly WeekBody[] {
  const weekCount = rotations * rotationWeeks

  for (const key of Object.keys(overrides)) {
    const weekIndex = Number(key)

    // A throw, not a silent no-op: an override that lands nowhere is a plan
    // whose author believes it has a taper it does not have, and the screens
    // would show the rotation's week with no sign anything was meant to
    // replace it. `catalogBuild.spec.ts` is what turns this into a reported
    // failure rather than a suite that loads zero tests.
    if (!Number.isInteger(weekIndex) || weekIndex < 1 || weekIndex > weekCount)
      throw new RangeError(`A plan of ${weekCount} weeks has no week ${key} to override`)
  }

  return Array.from(
    { length: weekCount },
    (_unused, offset) => overrides[offset + 1] ?? week(offset % rotationWeeks),
  )
}

export interface PlanSpec {
  readonly id: string
  readonly name: string
  readonly descriptionKey: string
  readonly source: string
  readonly rotationWeeks: number
  /** The weeks, from {@link rotating} or written out literally. */
  readonly weeks: readonly WeekBody[]
}

/**
 * The catalogue entry a plan file exports, ids assigned.
 *
 * Frozen because a plan is data the whole app reads and nobody owns: a screen
 * that mutated one would change what every other screen — and the id every
 * logged workout points at — is looking at, for the lifetime of the tab.
 */
export function definePlan(spec: PlanSpec): Plan {
  return Object.freeze({
    id: spec.id,
    name: spec.name,
    descriptionKey: spec.descriptionKey,
    source: spec.source,
    rotationWeeks: spec.rotationWeeks,
    weeks: withIds(spec.id, spec.weeks),
  })
}

/**
 * The five session kinds, as the sentences a plan file is written in.
 *
 * `steady(10_000)` says what `{ kind: 'steady', minDistanceM: 10_000 }` says,
 * and says it in the vocabulary the plan was published in. Which fields a kind
 * carries lives here once, rather than in every plan that uses it.
 */
export const steady = (minDistanceM: number): SessionBody => ({ kind: 'steady', minDistanceM })

export const shortRest = (reps: number, repDistanceM: number, restMs: number): SessionBody => ({
  kind: 'shortRest',
  reps,
  repDistanceM,
  restMs,
})

export const longRest = (reps: number, repDistanceM: number, restMs: number): SessionBody => ({
  kind: 'longRest',
  reps,
  repDistanceM,
  restMs,
})

export const pacedTwoK = (reps: number, repDistanceM: number, restMs: number): SessionBody => ({
  kind: 'pacedTwoK',
  reps,
  repDistanceM,
  restMs,
})

export const piece = (distanceM: number): SessionBody => ({ kind: 'distancePiece', distanceM })
