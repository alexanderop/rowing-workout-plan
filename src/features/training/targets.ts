import { Result } from 'effect'

import { formatSplit, paceBand, PaceRangeError, splitFor, wattsFromSplit } from './pace'
import type { Rotation } from './schedule'
import type { PlanSession, SessionKind } from './types'

/**
 * One 2k time in, a target split per session out.
 *
 * **This is the invented part of the trainer.** Pete's plan says to pace a
 * session off the average of your last attempt at it, which needs a history
 * this app does not have on day one. Deriving targets from a single 2k
 * benchmark instead is our substitute, and every number that substitution
 * rests on is in {@link TARGET_OFFSETS_MS} — one table, at the top, so it can
 * be argued with and tuned without reading a single caller.
 *
 * The model is deliberately the simplest thing that can be wrong in an
 * obvious way: a target is 2k pace plus a fixed offset per kind. Splits add,
 * so the ordering of the offsets *is* the ordering of the targets, for every
 * benchmark and every rower — which is the part worth guaranteeing. The
 * offsets themselves are taste.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

/** The benchmark is a 2k, so 2k pace is the origin every offset is measured from. */
const BENCHMARK_DISTANCE_M = 2000

/**
 * Seconds off 2k pace, in milliseconds, per session kind. Positive is slower.
 *
 * These are starting values, not findings. They reproduce the design canvas
 * exactly for `longRest` (1:50.0), `pacedTwoK` (1:47.0 mid) and `steady`
 * (2:06) from its 7:04.2 benchmark — see `targets.spec.ts` for the one they
 * do not, and what to change if you want the canvas figure instead.
 *
 * - `steady` +20s — the Pete Plan's own rule is that steady work sits *at
 *   least* 10 s slower than the endurance intervals; 20 s off 2k pace lands
 *   there, and this is the offset a rower is most likely to cheat.
 * - `shortRest` +6s — the rest is a minute against reps of three to four, so
 *   very little of the work is repaid.
 * - `longRest` +4s — four minutes is nearly the work, so nearly 2k pace.
 * - `pacedTwoK` +1s — the middle rep only. Submaximal on purpose: it measures
 *   without costing a week's recovery, which a real 2k test does.
 * - `distancePiece` 0 — the only kind whose offset is computed rather than
 *   chosen, because it is the only one whose distance varies. This entry is
 *   the flat part, added on top of the distance scaling below; leave it at
 *   zero unless every hard distance piece should move together.
 * - `timedSteady` +20s — `steady`'s offset exactly, and deliberately the same
 *   number rather than a number that happens to match: a 30′ row is the
 *   distance row with a clock instead of a monitor, and Pete prescribes it at
 *   the pace of the 10k it stands in for.
 * - `timedIntervals` +18s — two seconds faster than the continuous piece, and
 *   the rests are what buy that. Pete's note on `3 × 10min` is the source:
 *   "the same pace as your 10k this week, and a little faster on the final
 *   one".
 */
export const TARGET_OFFSETS_MS = {
  steady: 20_000,
  shortRest: 6_000,
  longRest: 4_000,
  pacedTwoK: 1_000,
  distancePiece: 0,
  timedSteady: 20_000,
  timedIntervals: 18_000,
} satisfies Record<SessionKind, number>

/**
 * Paul's Law: a split slows by about five seconds for every doubling of the
 * distance. It is the one piece of this module that is not invented — it is
 * the rowing world's standard rule of thumb — and it is what lets a single
 * benchmark price a 5k and a 6k differently instead of giving them one
 * "hard distance" offset that is wrong for both.
 */
const MS_PER_DOUBLING = 5_000

/**
 * Stroke rates, per kind. Only `shortRest`'s 24–26 is pinned by the design
 * canvas; the rest follow the plan's own guidance — steady is capped at 25,
 * hard work goes above it — and are as tunable as the offsets.
 */
const RATE_RANGES = {
  steady: { low: 22, high: 25 },
  shortRest: { low: 24, high: 26 },
  longRest: { low: 26, high: 28 },
  pacedTwoK: { low: 28, high: 30 },
  distancePiece: { low: 24, high: 26 },
  timedSteady: { low: 22, high: 25 },
  timedIntervals: { low: 22, high: 26 },
} satisfies Record<SessionKind, RateRange>

/**
 * How much faster each rotation is than the one before it, and which kinds
 * feel it.
 *
 * This is the plan's spine, and the reason it belongs here rather than in a
 * screen: *within* a rotation the target holds while the reps get longer —
 * that is the progression — and *between* rotations it steps down by a tenth.
 * The Session detail mockup says exactly this in words ("Hold this pace as the
 * reps get longer. Next rotation, go a tenth faster"); this is the same
 * sentence as arithmetic.
 *
 * `pacedTwoK` is deliberately not shifted: its job is to measure you, and a
 * target that walks itself faster every rotation would be measuring its own
 * assumptions. `steady` is not shifted because steady is not a target to beat,
 * and the two timed kinds are aerobic work for the same reason.
 */
const ROTATION_STEP_MS = 100
const ROTATION_SHIFTED_KINDS: ReadonlySet<SessionKind> = new Set(['shortRest', 'longRest'])

/**
 * The stroke-rate window a session is rowed in.
 *
 * Not exported yet: nothing outside this module names it, and knip's
 * no-orphans gate is what keeps that honest. The screens that will need the
 * name arrive in slice 6; exporting it before then is a guess.
 */
interface RateRange {
  readonly low: number
  readonly high: number
}

/** What to hold, how fast to turn it over, and what that costs. See {@link RateRange} on why this is not exported either. */
interface PaceTarget {
  readonly splitMs: number
  readonly rateRange: RateRange
  readonly watts: number
}

/**
 * A session's target, summary first.
 *
 * `reps` is the per-rep breakdown the Session detail screen lists, one entry
 * per rep, and it is the whole reason this is not just a `PaceTarget`: a
 * `pacedTwoK` is three different efforts and reporting one split for it would
 * pace two of them wrong. Every other kind repeats a single target, so the
 * screen never has to ask which shape it got.
 */
export interface SessionTarget extends PaceTarget {
  readonly reps: readonly PaceTarget[]
}

/** A split, priced and rated. The one place a target becomes a `PaceTarget`. */
function targetAt(kind: SessionKind, splitMs: number): Result.Result<PaceTarget, PaceRangeError> {
  return Result.map(wattsFromSplit(splitMs), (watts) => ({
    splitMs,
    rateRange: RATE_RANGES[kind],
    watts,
  }))
}

/**
 * How far off 2k pace this session sits, before the benchmark is applied.
 *
 * A `distancePiece` is the only kind that needs to read the session rather
 * than just its kind, and the only one that can fail: a piece with no
 * distance has no target, and guessing one would put a confident number on a
 * screen for a session nobody described.
 */
function offsetFor(
  session: PlanSession,
  rotation: Rotation,
): Result.Result<number, PaceRangeError> {
  const base = TARGET_OFFSETS_MS[session.kind]

  if (session.kind === 'distancePiece') {
    // A missing distance becomes zero and falls into the same guard as a
    // negative one, rather than getting a clause of its own: an explicit
    // `=== undefined` test reads as thorough and decides nothing, because
    // `Number.isFinite(undefined)` is already false. Mutation testing is what
    // surfaced it — a clause no input can reach cannot be killed.
    const distanceM = session.distanceM ?? 0
    if (!Number.isFinite(distanceM) || distanceM <= 0)
      return Result.fail(new PaceRangeError({ field: 'distanceM', value: distanceM }))

    return Result.succeed(base + MS_PER_DOUBLING * Math.log2(distanceM / BENCHMARK_DISTANCE_M))
  }

  if (!ROTATION_SHIFTED_KINDS.has(session.kind)) return Result.succeed(base)
  return Result.succeed(base - (rotation - 1) * ROTATION_STEP_MS)
}

/**
 * The paced 2k, rep by rep: easy, test, easy.
 *
 * The outer reps are rowed at steady pace — the canvas calls the session
 * "Paced 2k, easy either side" — and only the middle one is the measurement.
 * Encoding that here is the whole point of the kind: three flat-out 2ks is
 * both a different session and a much worse week.
 */
function pacedTwoKReps(
  session: PlanSession,
  pace2kMs: number,
  testSplitMs: number,
): Result.Result<Array<PaceTarget>, PaceRangeError> {
  return Result.gen(function* () {
    const easy = yield* targetAt('steady', pace2kMs + TARGET_OFFSETS_MS.steady)
    const test = yield* targetAt('pacedTwoK', testSplitMs)

    const reps = session.reps ?? 1
    const middle = Math.floor(reps / 2)
    return Array.from({ length: reps }, (_unused, index) => (index === middle ? test : easy))
  })
}

/**
 * Whether this kind's target moves as the rotations go by.
 *
 * The interval kinds do — a rotation is a tenth of a second faster than the
 * one before it, which is the whole progression the plan is built on — and
 * the rest do not. Screens ask because the coaching note only makes sense for
 * a session whose target will actually have moved by next time; telling a
 * rower to take a tenth off their steady rows is telling them to stop rowing
 * steady.
 */
export function isRotationShifted(kind: SessionKind): boolean {
  return ROTATION_SHIFTED_KINDS.has(kind)
}

/**
 * How much either side of a steady target still counts as steady.
 *
 * Two seconds, which is the window the design canvas prints (2:04–2:08 around
 * a 2:06 target). Steady is the only kind quoted as a range rather than a
 * number, and deliberately: an interval target is a number to hit, while
 * aerobic work is a zone, and a rower holding 2:06.0 exactly for 10 km is
 * either a machine or not going steady.
 */
const STEADY_TOLERANCE_MS = 2_000

/** The two edges of the steady window, as the splits a screen prints. */
export interface SteadyBandText {
  readonly lower: string
  readonly upper: string
}

/**
 * The window a steady session is rowed inside, already written out.
 *
 * Formatted here rather than returned as milliseconds because both edges go
 * into one message (`2:04–2:08`) and a component assembling that from two
 * `Result`s is three lines of plumbing per screen that shows a steady row.
 * `lower` is the faster edge, as everywhere else a split is a duration.
 */
export function steadyBandText(splitMs: number): Result.Result<SteadyBandText, PaceRangeError> {
  return Result.gen(function* () {
    const band = yield* paceBand(splitMs, STEADY_TOLERANCE_MS)
    const lower = yield* formatSplit(band.lower)
    const upper = yield* formatSplit(band.upper)

    return { lower, upper }
  })
}

/**
 * The 500 m split a 2k time works out to.
 *
 * The one number the benchmark sheet echoes back while you type, so "7:04.2"
 * is confirmed as the pace it means *before* it is saved rather than by every
 * target on the next screen being wrong. It is `splitFor` with the distance
 * filled in — the point is that no caller outside this module has to know
 * which distance the benchmark is over.
 */
export function benchmarkPace(benchmark2kMs: number): Result.Result<number, PaceRangeError> {
  return splitFor(BENCHMARK_DISTANCE_M, benchmark2kMs)
}

/**
 * The target for one session of one plan, for a rower with this 2k.
 *
 * `rotation` comes from `schedule.rotationFor`, so the caller has already been
 * told whether the week is one this plan has — which is why this takes a
 * `Rotation` and not a week number.
 */
export function targetFor(
  session: PlanSession,
  benchmark2kMs: number,
  rotation: Rotation,
): Result.Result<SessionTarget, PaceRangeError> {
  return Result.gen(function* () {
    const pace2kMs = yield* splitFor(BENCHMARK_DISTANCE_M, benchmark2kMs)
    const offsetMs = yield* offsetFor(session, rotation)
    const summary = yield* targetAt(session.kind, pace2kMs + offsetMs)

    if (session.kind === 'pacedTwoK') {
      const reps = yield* pacedTwoKReps(session, pace2kMs, summary.splitMs)
      return { ...summary, reps }
    }

    const reps = new Array<PaceTarget>(session.reps ?? 1).fill(summary)
    return { ...summary, reps }
  })
}
