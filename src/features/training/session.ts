import { Result } from 'effect'

import { durationMsFor, type PaceRangeError } from './pace'
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
 * The three sentences five kinds are written as. `pacedTwoK` reads as
 * intervals because that is what it looks like on the erg; what makes it
 * different is the per-rep pacing, and that is `targets.ts`'s business.
 */
type SessionStyle = 'steady' | 'intervals' | 'piece'

const STYLES = {
  steady: 'steady',
  shortRest: 'intervals',
  longRest: 'intervals',
  pacedTwoK: 'intervals',
  distancePiece: 'piece',
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
 * A rest as the plan states it: `1′`, `4′`, `3′30″`.
 *
 * The prime marks rather than `1:00`, and the same form on every screen: a
 * colon between two numbers is a split everywhere else in this app, and a
 * rest that looks like a pace is the kind of thing a rower reads wrong once
 * and then rows wrong for a session.
 */
export function formatRest(restMs: number): string {
  const totalSeconds = Math.round(restMs / MS_PER_SECOND)
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
    rest: formatRest(session.restMs ?? 0),
  }
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
 * How far the session is, rest excluded.
 *
 * A floor rather than a promise for `steady`, which has no upper bound — the
 * screens that add these up say "roughly", and that word is doing real work.
 */
export function sessionDistanceM(session: PlanSession): number {
  const perPiece = pieceDistanceM(session)
  if (session.kind === 'steady' || session.kind === 'distancePiece') return perPiece

  return (session.reps ?? 0) * perPiece
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
  return Result.map(durationMsFor(sessionDistanceM(session), splitMs), (workMs) => {
    const restCount = Math.max(0, (session.reps ?? 1) - 1)
    return workMs + restCount * (session.restMs ?? 0)
  })
}
