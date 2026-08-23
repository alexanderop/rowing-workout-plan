import { Result } from 'effect'

import { distanceMFor, durationMsFor, type PaceRangeError } from './pace'
import type { Plan, PlanSession, PlanWeek, SessionKind } from './types'

/**
 * How a session is written down, and how far it is.
 *
 * The catalogue stores a session as numbers — `{ reps: 6, repDistanceM: 1000,
 * restMs: 60_000 }` — and every screen shows it as a sentence: "6 × 1k / 1′
 * rest". That translation is a decision with real edge cases (1,800 m is not
 * "1.8k", a rest of 3:30 is not "3′"), so it happens here rather than in a
 * template, and what comes out is *data for a message* rather than the
 * message itself. The component looks the sentence up in the catalogue and
 * fills it in; nothing here knows English.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

const METRES_PER_KILOMETRE = 1000
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60

/**
 * The five sentences seven kinds are written as. `pacedTwoK` reads as
 * intervals because that is what it looks like on the erg; what makes it
 * different is the per-rep pacing, and that is `targets.ts`'s business.
 *
 * The two timed kinds get sentences of their own rather than borrowing
 * `steady` and `intervals`: those name a distance, and a session bounded by
 * the clock has none to name.
 */
type SessionStyle = 'steady' | 'intervals' | 'piece' | 'time' | 'timeIntervals'

const STYLES = {
  steady: 'steady',
  shortRest: 'intervals',
  longRest: 'intervals',
  pacedTwoK: 'intervals',
  distancePiece: 'piece',
  timedSteady: 'time',
  timedIntervals: 'timeIntervals',
} satisfies Record<SessionKind, SessionStyle>

/**
 * The parts of the sentence, ready to hand to `t()` as named parameters.
 *
 * Every field is present for every style, and the unused ones are simply not
 * named by that style's message — vue-i18n ignores a parameter nothing asks
 * for. The alternative, optional fields per style, would make every call site
 * narrow a union to fill in a template it does not otherwise care about.
 */
export interface SessionDescription {
  readonly style: SessionStyle
  readonly reps: number
  readonly distance: string
  readonly duration: string
  readonly rest: string
}

/**
 * A distance as a rower writes it: `500m`, `1k`, `1800m`, `10k`.
 *
 * Whole kilometres only. 1,800 m is written out because "1.8k" is a number
 * nobody says out loud on an erg, and the floor keeps 500 m from becoming
 * "0.5k". Below a kilometre — and at zero, which only a malformed session
 * produces — it stays in metres.
 */
export function formatDistance(metres: number): string {
  if (metres >= METRES_PER_KILOMETRE && metres % METRES_PER_KILOMETRE === 0)
    return `${metres / METRES_PER_KILOMETRE}k`

  return `${metres}m`
}

/**
 * A duration as the plan states it: `1′`, `4′`, `3′30″`, `30′`.
 *
 * The prime marks rather than `1:00`, and the same form on every screen: a
 * colon between two numbers is a split everywhere else in this app, and a
 * rest that looks like a pace is the kind of thing a rower reads wrong once
 * and then rows wrong for a session.
 *
 * It was `formatRest` while rest was the only duration a plan stated. The
 * timed kinds state work in the same unit and want the same form, and a
 * function called `formatRest` printing the length of a 30′ row reads wrong
 * at the call site — so the name says what it formats, not what it was for.
 */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / MS_PER_SECOND)
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE

  return seconds === 0 ? `${minutes}′` : `${minutes}′${seconds}″`
}

/** The session as a sentence's worth of parts. */
export function describeSession(session: PlanSession): SessionDescription {
  const style = STYLES[session.kind]

  return {
    style,
    reps: session.reps ?? 1,
    distance: formatDistance(pieceDistanceM(session)),
    duration: formatDuration(pieceDurationMs(session)),
    rest: formatDuration(session.restMs ?? 0),
  }
}

/** The kinds the clock bounds rather than the monitor. */
const TIMED_KINDS: ReadonlySet<SessionKind> = new Set(['timedSteady', 'timedIntervals'])

/** Whether this session is prescribed as a duration rather than a distance. */
export function isTimed(session: PlanSession): boolean {
  return TIMED_KINDS.has(session.kind)
}

/**
 * How long *one* piece of the session is, for the kinds that state it — the
 * timed twin of {@link pieceDistanceM}, and zero for every distance kind.
 *
 * The fallthrough is `repDurationMs`, not an explicit `timedIntervals` test,
 * for the same reason {@link pieceDistanceM} ends on `repDistanceM`: a kind
 * that does not carry the field has it `undefined` and lands on zero anyway,
 * so the extra branch decides nothing and no input can reach the arm behind
 * it. Mutation testing is what surfaced that — an unreachable arm survives
 * every mutant applied to it.
 */
export function pieceDurationMs(session: PlanSession): number {
  if (session.kind === 'timedSteady') return session.durationMs ?? 0

  return session.repDurationMs ?? 0
}

/** The session's work in milliseconds, rest excluded. Zero for a distance kind. */
export function sessionWorkMs(session: PlanSession): number {
  const perPiece = pieceDurationMs(session)
  if (session.kind === 'timedSteady') return perPiece

  return (session.reps ?? 0) * perPiece
}

/** The week's timed work, rest excluded — the timed twin of {@link weekDistanceM}. */
export function weekWorkMs(week: PlanWeek): number {
  return week.sessions.reduce((total, session) => total + sessionWorkMs(session), 0)
}

/**
 * The distance of *one* piece of the session — a rep, the steady floor, or
 * the piece itself. Separate from {@link sessionDistanceM}, which multiplies
 * it out, because the sentence names one rep ("6 × 1k") and a week summary
 * names the work (6,000 m). The per-rep list on the session screen is the
 * other caller: every kind has one, and for the two that are a single effort
 * that one piece is the session.
 */
export function pieceDistanceM(session: PlanSession): number {
  if (session.kind === 'steady') return session.minDistanceM ?? 0
  if (session.kind === 'distancePiece') return session.distanceM ?? 0

  return session.repDistanceM ?? 0
}

/**
 * How far the session is, rest excluded. Zero for a timed kind, which
 * prescribes no distance at all — see {@link sessionDistanceEstimateM}.
 *
 * A floor rather than a promise for `steady`, which has no upper bound — the
 * screens that add these up say "roughly", and that word is doing real work.
 */
export function sessionDistanceM(session: PlanSession): number {
  const perPiece = pieceDistanceM(session)
  if (session.kind === 'steady' || session.kind === 'distancePiece') return perPiece

  return (session.reps ?? 0) * perPiece
}

/**
 * The metres this session is worth, estimating the timed kinds off their own
 * target split.
 *
 * `sessionDistanceM` answers "what does the plan prescribe", and for a 30′ row
 * the honest answer is nothing — which is right for a week's *prescribed*
 * volume and useless on a screen with a metres field on it. This answers "how
 * far is that", which needs a pace and so takes one.
 *
 * A `Result` because it divides by the split for the timed kinds; a distance
 * kind succeeds with the number it already knew, split or no split.
 */
export function sessionDistanceEstimateM(
  session: PlanSession,
  splitMs: number,
): Result.Result<number, PaceRangeError> {
  if (!isTimed(session)) return Result.succeed(sessionDistanceM(session))

  return distanceMFor(sessionWorkMs(session), splitMs)
}

/** The week's work, rest excluded — the sum of its sessions. */
export function weekDistanceM(week: PlanWeek): number {
  return week.sessions.reduce((total, session) => total + sessionDistanceM(session), 0)
}

/** Metres as the kilometres a week summary quotes. */
export function kilometres(metres: number): number {
  return Math.round(metres / METRES_PER_KILOMETRE)
}

/** Where a session sits: which plan, which week, and which of that week's. */
export interface SessionLocation {
  readonly plan: Plan
  readonly week: PlanWeek
  readonly session: PlanSession
  /** 1-based within the week, because every screen says "Session 2 of 6". */
  readonly position: number
}

/**
 * The session a route names, found by scanning rather than by parsing its id.
 *
 * The ids are positional (`pete5k-w3-s2`) and could be taken apart, but that
 * would make a URL a second, unchecked encoding of the catalogue's structure:
 * a plan whose id gains a hyphen, or a week that moves, breaks the parse
 * silently and produces a wrong session rather than none. Seventy-one
 * comparisons per lookup is not a cost worth paying for that.
 */
export function findSession(plans: ReadonlyArray<Plan>, sessionId: string): SessionLocation | null {
  for (const plan of plans) {
    for (const week of plan.weeks) {
      const position = week.sessions.findIndex((session) => session.id === sessionId)
      if (position !== -1)
        return { plan, week, session: week.sessions[position], position: position + 1 }
    }
  }

  return null
}

/**
 * How long the session takes, rest included — the "~27 min" a screen prints
 * next to a session so you know whether you have time for it.
 *
 * Rest is `reps - 1` intervals, not `reps`: the last one is over when the
 * last rep is. A steady row and a hard piece have one piece and no rest, so
 * the term falls out to zero on its own rather than needing a branch.
 *
 * A `Result` because it divides by the split, and a session paced at zero is
 * not a session that takes no time — it is a session with no target.
 */
export function sessionDurationMs(
  session: PlanSession,
  splitMs: number,
): Result.Result<number, PaceRangeError> {
  // A timed session already knows its work in this unit, so the split is not
  // consulted — which is also why it cannot fail the way a distance one can.
  const workMs = isTimed(session)
    ? Result.succeed(sessionWorkMs(session))
    : durationMsFor(sessionDistanceM(session), splitMs)

  return Result.map(workMs, (work) => {
    const restCount = Math.max(0, (session.reps ?? 1) - 1)
    return work + restCount * (session.restMs ?? 0)
  })
}
