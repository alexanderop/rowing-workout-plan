import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import {
  decodeBenchmarkDraft,
  decodeEnrolmentDraft,
  decodeStoredBenchmark,
  decodeStoredEnrolment,
  decodeStoredWorkout,
  decodeWorkoutDraft,
  toBenchmark,
  toEnrolment,
  toWorkout,
} from '@/db/converters'

/**
 * The row schemas are the app's only defence against its own storage.
 *
 * IndexedDB is untrusted input — rows survive app versions, get restored with
 * a profile, and are editable from devtools — so these assertions come in two
 * kinds. The **rejections** pin what must never decode: a timestamp that is
 * not a point in time, a distance the pace arithmetic would divide by. The
 * **backfills** pin the other half of "The Long Now": every shape this app
 * has ever written still reads, and reads *complete*.
 *
 * Graded by `pnpm test:mutation`, so a rejection asserted only as "it failed"
 * is not enough — the field that failed is the assertion.
 */

const decoded = <A>(program: Effect.Effect<A, unknown>) => Effect.runSync(program)
const rejects = <A>(program: Effect.Effect<A, unknown>) =>
  Effect.runSync(Effect.flip(Effect.mapError(program, () => 'rejected' as const)))

const A_BENCHMARK = { id: 'bench-1', kind: '2k', timeMs: 424_200, recordedAt: 1_700_000_000_000 }
const AN_ENROLMENT = { id: 'enrol-1', planId: 'pete5k', startedAt: 1_700_000_000_000, active: true }
const A_WORKOUT = {
  id: 'workout-1',
  startedAt: 1_700_000_000_000,
  source: 'erg',
  distanceM: 6000,
  durationMs: 1_348_800,
  avgSplitMs: 112_400,
  intervals: [],
}

describe('benchmarks', () => {
  it.effect('decodes a current row', () =>
    Effect.gen(function* () {
      expect(yield* decodeStoredBenchmark(A_BENCHMARK)).toEqual(A_BENCHMARK)
    }),
  )

  it.each(['2k', '5k', '6k'])('accepts a %s', (kind) => {
    expect(decoded(decodeStoredBenchmark({ ...A_BENCHMARK, kind })).kind).toBe(kind)
  })

  it.each(['1k', '2K', '', '10k'])('refuses a benchmark over %p', (kind) => {
    // The three distances are the ones the trainer knows how to pace from.
    // A fourth is a feature, not a row that should slip in through devtools.
    expect(rejects(decodeStoredBenchmark({ ...A_BENCHMARK, kind }))).toBe('rejected')
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses a time of %p', (timeMs) => {
    expect(rejects(decodeStoredBenchmark({ ...A_BENCHMARK, timeMs }))).toBe('rejected')
  })

  it('refuses a row with no id', () => {
    expect(rejects(decodeStoredBenchmark({ ...A_BENCHMARK, id: '' }))).toBe('rejected')
  })

  it('carries a decoded row through unchanged', () => {
    // Nothing is relaxed on this row, so the converter is identity — stated as
    // a test so that adding an optional field later without a backfill fails
    // here rather than shipping a partial benchmark.
    const stored = decoded(decodeStoredBenchmark(A_BENCHMARK))
    expect(toBenchmark(stored)).toEqual(A_BENCHMARK)
  })
})

describe('a timestamp is a real point in time', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])('refuses %p', (recordedAt) => {
    // `Schema.Number` would accept all of these. A row with `recordedAt: NaN`
    // decodes cleanly and then sorts into an arbitrary position forever,
    // because every comparison against NaN is false.
    expect(rejects(decodeStoredBenchmark({ ...A_BENCHMARK, recordedAt }))).toBe('rejected')
  })

  it('accepts the epoch', () => {
    // Zero is a real instant, and TestClock starts there — a schema that
    // refused it would fail every clock-driven test for the wrong reason.
    expect(decoded(decodeStoredBenchmark({ ...A_BENCHMARK, recordedAt: 0 })).recordedAt).toBe(0)
  })
})

describe('enrolments', () => {
  it('decodes a current row', () => {
    expect(decoded(decodeStoredEnrolment(AN_ENROLMENT))).toEqual(AN_ENROLMENT)
  })

  it('reads a historical row that predates the active flag', () => {
    // The one field with an honest default: a row written before the app
    // could hold more than one enrolment *is* the enrolment.
    const { active: _active, ...legacy } = AN_ENROLMENT
    expect(toEnrolment(decoded(decodeStoredEnrolment(legacy))).active).toBe(true)
  })

  it('leaves an explicit false alone', () => {
    // The backfill must not be "true whenever we feel like it": a deactivated
    // enrolment that came back active would give the Today tab two plans.
    const stored = decoded(decodeStoredEnrolment({ ...AN_ENROLMENT, active: false }))
    expect(toEnrolment(stored).active).toBe(false)
  })

  it('refuses a row with no plan', () => {
    expect(rejects(decodeStoredEnrolment({ ...AN_ENROLMENT, planId: '' }))).toBe('rejected')
  })
})

describe('workouts', () => {
  it('decodes a current row', () => {
    expect(decoded(decodeStoredWorkout(A_WORKOUT))).toEqual(A_WORKOUT)
  })

  it.each(['erg', 'manual'])('accepts a %s workout', (source) => {
    expect(toWorkout(decoded(decodeStoredWorkout({ ...A_WORKOUT, source }))).source).toBe(source)
  })

  it('refuses a source it does not know', () => {
    expect(rejects(decodeStoredWorkout({ ...A_WORKOUT, source: 'strava' }))).toBe('rejected')
  })

  it('reads a historical row with no source and no intervals', () => {
    const { source: _source, intervals: _intervals, ...legacy } = A_WORKOUT
    const workout = toWorkout(decoded(decodeStoredWorkout(legacy)))

    // A row that does not say where it came from was not captured off an erg,
    // because erg capture is the thing that would have said so.
    expect(workout.source).toBe('manual')
    expect(workout.intervals).toEqual([])
  })

  it('keeps intervals it was given', () => {
    const intervals = [
      { index: 0, distanceM: 1000, durationMs: 224_800, splitMs: 112_400, restMs: 60_000 },
    ]
    expect(toWorkout(decoded(decodeStoredWorkout({ ...A_WORKOUT, intervals }))).intervals).toEqual(
      intervals,
    )
  })

  it('keeps a planSessionId, and allows its absence', () => {
    // Presence is what makes a workout count towards a plan, so both branches
    // are load-bearing: `schedule.positionFor` reads exactly this field.
    const linked = decoded(decodeStoredWorkout({ ...A_WORKOUT, planSessionId: 'pete5k-w3-s2' }))
    expect(toWorkout(linked).planSessionId).toBe('pete5k-w3-s2')
    expect(toWorkout(decoded(decodeStoredWorkout(A_WORKOUT))).planSessionId).toBeUndefined()
  })

  it.each([0, -1, 1.5])('refuses a distance of %p', (distanceM) => {
    expect(rejects(decodeStoredWorkout({ ...A_WORKOUT, distanceM }))).toBe('rejected')
  })

  it.each([0, -1])('refuses a duration of %p', (durationMs) => {
    expect(rejects(decodeStoredWorkout({ ...A_WORKOUT, durationMs }))).toBe('rejected')
  })

  it('accepts a fractional split but not a zero one', () => {
    // A split is a measured average, not a count: rounding it at the storage
    // boundary would lose precision the log never gets back.
    expect(decoded(decodeStoredWorkout({ ...A_WORKOUT, avgSplitMs: 112_400.5 })).avgSplitMs).toBe(
      112_400.5,
    )
    expect(rejects(decodeStoredWorkout({ ...A_WORKOUT, avgSplitMs: 0 }))).toBe('rejected')
    expect(rejects(decodeStoredWorkout({ ...A_WORKOUT, avgSplitMs: Number.NaN }))).toBe('rejected')
  })

  it('refuses a damaged interval inside an otherwise valid workout', () => {
    // The array is structured-cloned rather than stored as columns, so it is
    // exactly the part a hand-edited row can corrupt without the row looking
    // wrong at the top level.
    const intervals = [{ index: 0, distanceM: 0, durationMs: 1000, splitMs: 112_400 }]
    expect(rejects(decodeStoredWorkout({ ...A_WORKOUT, intervals }))).toBe('rejected')
  })

  it('allows a rest of zero on the last rep', () => {
    const intervals = [
      { index: 0, distanceM: 1000, durationMs: 224_800, splitMs: 112_400, restMs: 0 },
    ]
    expect(decoded(decodeStoredWorkout({ ...A_WORKOUT, intervals })).intervals?.[0].restMs).toBe(0)
  })
})

describe('drafts', () => {
  it('accepts what a form supplies', () => {
    expect(decoded(decodeBenchmarkDraft({ kind: '2k', timeMs: 424_200 }))).toEqual({
      kind: '2k',
      timeMs: 424_200,
    })
  })

  it('requires an enrolment to name a plan', () => {
    expect(decoded(decodeEnrolmentDraft({ planId: 'pete5k' })).planId).toBe('pete5k')
    expect(rejects(decodeEnrolmentDraft({ planId: '' }))).toBe('rejected')
    expect(rejects(decodeEnrolmentDraft({}))).toBe('rejected')
  })

  it('holds the row rules on the write path too', () => {
    // The draft reuses the row's own field schemas, so a rule cannot hold on
    // read and not on write — which is what a separately written draft schema
    // eventually does.
    expect(rejects(decodeBenchmarkDraft({ kind: '2k', timeMs: 0 }))).toBe('rejected')
    expect(rejects(decodeWorkoutDraft({ ...A_WORKOUT, distanceM: 0 }))).toBe('rejected')
  })

  it('lets a workout draft leave startedAt to the clock', () => {
    const { startedAt: _startedAt, ...draft } = A_WORKOUT
    expect(decoded(decodeWorkoutDraft(draft)).startedAt).toBeUndefined()
  })
})
