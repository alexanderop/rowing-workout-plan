import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { FastCheck } from 'effect/testing'

import { pete5k } from '@/features/training/catalog'
import { formatSplit } from '@/features/training/pace'
import type { Rotation } from '@/features/training/schedule'
import {
  benchmarkPace,
  isRotationShifted,
  steadyBandText,
  targetFor,
  TARGET_OFFSETS_MS,
} from '@/features/training/targets'
import { SESSION_KINDS } from '@/features/training/types'
import type { PlanSession, SessionKind } from '@/features/training/types'

/**
 * The invented half of the trainer, so the assertions split the same way the
 * module does.
 *
 * The **orderings** are the part worth guaranteeing, and they are properties:
 * steady is slower than shortRest is slower than longRest is slower than the
 * paced 2k's middle rep, for every benchmark a human could row. Those hold
 * whatever the offsets are tuned to, and a change that breaks one has changed
 * the plan rather than the numbers.
 *
 * The **tables** pin the current offsets against the design canvas, and are
 * expected to move when someone argues with them. They are written as splits
 * a rower would read rather than as milliseconds, because that is the form the
 * disagreement will arrive in.
 */

/** The canvas's worked example: a 2k of 7:04.2. */
const BENCHMARK_2K_MS = 424_200

/** 2k times a human being actually rows: 5:30 to 10:00. */
const PLAUSIBLE_2K_MS = FastCheck.integer({ min: 330_000, max: 600_000 })
const ROTATIONS: ReadonlyArray<Rotation> = [1, 2, 3, 4]

const succeeded = <A, E>(result: Result.Result<A, E>): A => Result.getOrThrow(result)
const failed = <A, E>(result: Result.Result<A, E>): E => Result.getOrThrow(Result.flip(result))

const session = (kind: SessionKind, extra: Partial<PlanSession> = {}): PlanSession => ({
  id: `test-${kind}`,
  kind,
  ...extra,
})

const splitOf = (kind: SessionKind, benchmark = BENCHMARK_2K_MS, rotation: Rotation = 1): number =>
  succeeded(targetFor(session(kind, { reps: 3 }), benchmark, rotation)).splitMs

const readable = (splitMs: number): string => succeeded(formatSplit(splitMs))

describe('targetFor, against the design canvas', () => {
  it('reproduces the canvas splits from its 7:04.2 benchmark', () => {
    expect(readable(splitOf('longRest'))).toBe('1:50.0')
    expect(readable(splitOf('pacedTwoK'))).toBe('1:47.0')
    expect(readable(splitOf('steady'))).toBe('2:06.0')
  })

  it('puts shortRest at 1:52.0, where the canvas prints 1:52.4', () => {
    // A documented disagreement, not a bug. The epic's offset table says
    // shortRest is +6s off 2k pace, and +6s off 1:46.05 is 1:52.05 — the
    // canvas figure needs +6.35s. The other three offsets land on their canvas
    // numbers exactly, and the canvas pairs this same 1:52.4 with 247 W, which
    // is the split for 1:52.3 (see pace.spec.ts), so this session's mockup
    // numbers are the loose ones. Set TARGET_OFFSETS_MS.shortRest to 6_350 to
    // adopt the canvas instead; nothing else needs to change.
    expect(readable(splitOf('shortRest'))).toBe('1:52.0')
    expect(splitOf('shortRest')).toBe(112_050)
  })

  it('rates and prices the week 3 short-rest session the screen shows', () => {
    const target = succeeded(targetFor(pete5k.weeks[2].sessions[1], BENCHMARK_2K_MS, 1))

    expect(target.rateRange).toEqual({ low: 24, high: 26 })
    expect(target.watts).toBeCloseTo(248.79, 2)
    expect(target.reps).toHaveLength(6)
    for (const rep of target.reps) expect(rep.splitMs).toBe(target.splitMs)
  })

  it('prices a 5k off Paul’s Law rather than a flat offset', () => {
    // Five seconds per doubling: 5k is 1.32 doublings past the 2k benchmark,
    // so +6.6s. That puts the week 12 test at roughly 18:46, which is what a
    // 7:04 2k is worth over 5k.
    const fiveK = succeeded(
      targetFor(session('distancePiece', { distanceM: 5000 }), BENCHMARK_2K_MS, 1),
    )
    const sixK = succeeded(
      targetFor(session('distancePiece', { distanceM: 6000 }), BENCHMARK_2K_MS, 1),
    )

    expect(readable(fiveK.splitMs)).toBe('1:52.6')
    expect(readable(sixK.splitMs)).toBe('1:53.9')
    expect(sixK.splitMs).toBeGreaterThan(fiveK.splitMs)
  })

  it('gives a piece at the benchmark distance exactly 2k pace', () => {
    // The origin of the scale: zero doublings, so zero offset. If this drifts,
    // every other distance is measured from the wrong place.
    const target = succeeded(
      targetFor(session('distancePiece', { distanceM: 2000 }), BENCHMARK_2K_MS, 1),
    )
    expect(target.splitMs).toBe(106_050)
  })
})

describe('the ordering of the kinds', () => {
  it.prop('holds for any benchmark', [PLAUSIBLE_2K_MS], ([benchmark]) => {
    const steady = splitOf('steady', benchmark)
    const shortRest = splitOf('shortRest', benchmark)
    const longRest = splitOf('longRest', benchmark)
    const pacedTwoK = splitOf('pacedTwoK', benchmark)

    expect(steady).toBeGreaterThan(shortRest)
    expect(shortRest).toBeGreaterThan(longRest)
    expect(longRest).toBeGreaterThan(pacedTwoK)
  })

  it.prop('survives the rotation shift', [PLAUSIBLE_2K_MS], ([benchmark]) => {
    // The shift moves shortRest and longRest but not the two either side of
    // them, so a step large enough to reorder the kinds would break the plan.
    for (const rotation of ROTATIONS) {
      expect(splitOf('steady', benchmark, rotation)).toBeGreaterThan(
        splitOf('shortRest', benchmark, rotation),
      )
      expect(splitOf('shortRest', benchmark, rotation)).toBeGreaterThan(
        splitOf('longRest', benchmark, rotation),
      )
      expect(splitOf('longRest', benchmark, rotation)).toBeGreaterThan(
        splitOf('pacedTwoK', benchmark, rotation),
      )
    }
  })

  it.prop(
    'makes a faster benchmark a faster target for every kind',
    [PLAUSIBLE_2K_MS, PLAUSIBLE_2K_MS],
    ([slower, faster]) => {
      FastCheck.pre(faster < slower)

      for (const kind of ['steady', 'shortRest', 'longRest', 'pacedTwoK'] as const)
        expect(splitOf(kind, faster), kind).toBeLessThan(splitOf(kind, slower))
    },
  )
})

describe('the rotation shift', () => {
  it('takes a tenth off the short- and long-rest targets each rotation', () => {
    expect(splitOf('shortRest', BENCHMARK_2K_MS, 1)).toBe(112_050)
    expect(splitOf('shortRest', BENCHMARK_2K_MS, 2)).toBe(111_950)
    expect(splitOf('shortRest', BENCHMARK_2K_MS, 4)).toBe(111_750)
    expect(splitOf('longRest', BENCHMARK_2K_MS, 4)).toBe(109_750)
  })

  it('leaves steady, the paced 2k and distance pieces where they are', () => {
    for (const rotation of ROTATIONS) {
      expect(splitOf('steady', BENCHMARK_2K_MS, rotation)).toBe(126_050)
      expect(splitOf('pacedTwoK', BENCHMARK_2K_MS, rotation)).toBe(107_050)
    }
  })

  it('holds the target while the reps lengthen inside one rotation', () => {
    // Weeks 1, 2 and 3 are the same rotation with longer reps each week. The
    // target must not move, or the progression is pace *and* volume at once.
    const splits = [0, 1, 2].map(
      (week) => succeeded(targetFor(pete5k.weeks[week].sessions[1], BENCHMARK_2K_MS, 1)).splitMs,
    )
    expect(new Set(splits).size).toBe(1)
  })
})

describe('pacedTwoK', () => {
  // Built inside each test, never in the describe body: a call that throws
  // during collection fails the *suite*, and a suite that never collects
  // reports zero failing tests — which reads as a passing mutant. Same trap
  // catalogBuild.spec.ts exists to avoid.
  const pacedTarget = () => succeeded(targetFor(pete5k.weeks[2].sessions[5], BENCHMARK_2K_MS, 1))

  it('returns a target per rep, not one split for the session', () => {
    expect(pacedTarget().reps).toHaveLength(3)
  })

  it('makes reps 1 and 3 equal, and slower than rep 2', () => {
    const [first, middle, third] = pacedTarget().reps
    expect(first).toEqual(third)
    expect(first.splitMs).toBeGreaterThan(middle.splitMs)
  })

  it('rows the outer reps at steady pace and rate', () => {
    const [first, middle] = pacedTarget().reps
    expect(first.splitMs).toBe(splitOf('steady'))
    expect(first.rateRange).toEqual({ low: 22, high: 25 })
    expect(middle.rateRange).toEqual({ low: 28, high: 30 })
  })

  it('summarises the session by its middle rep', () => {
    const target = pacedTarget()
    expect(target.splitMs).toBe(target.reps[1].splitMs)
    expect(target.splitMs).toBe(107_050)
  })
})

describe('stroke rates', () => {
  it('gives every kind its own window', () => {
    const rateOf = (kind: SessionKind, extra: Partial<PlanSession> = {}) =>
      succeeded(targetFor(session(kind, extra), BENCHMARK_2K_MS, 1)).rateRange

    expect(rateOf('steady')).toEqual({ low: 22, high: 25 })
    expect(rateOf('shortRest')).toEqual({ low: 24, high: 26 })
    expect(rateOf('longRest')).toEqual({ low: 26, high: 28 })
    expect(rateOf('pacedTwoK')).toEqual({ low: 28, high: 30 })
    expect(rateOf('distancePiece', { distanceM: 5000 })).toEqual({ low: 24, high: 26 })
  })

  it('keeps steady under the plan’s 25spm ceiling and hard work above it', () => {
    const rateOf = (kind: SessionKind) =>
      succeeded(targetFor(session(kind), BENCHMARK_2K_MS, 1)).rateRange

    expect(rateOf('steady').high).toBeLessThanOrEqual(25)
    for (const kind of ['longRest', 'pacedTwoK'] as const)
      expect(rateOf(kind).low, kind).toBeGreaterThan(rateOf('steady').high)
  })
})

describe('benchmarkPace', () => {
  it('is the 500 m split of the canvas 2k, to the tenth a rower reads', () => {
    // 7:04.2 over 2,000 m is 1:46.05 per 500 m, which formats as 1:46.0 —
    // the figure the design canvas prints for this benchmark.
    expect(succeeded(benchmarkPace(BENCHMARK_2K_MS))).toBeCloseTo(106_050, 6)
    expect(succeeded(formatSplit(succeeded(benchmarkPace(BENCHMARK_2K_MS))))).toBe('1:46.0')
  })

  it('is the same 2k pace every target is built on', () => {
    // Not a restatement: this is what makes the sheet's live echo the number
    // the plan will actually be paced from, rather than a second calculation
    // that can drift from it.
    const steady = succeeded(targetFor(session('steady'), BENCHMARK_2K_MS, 1))

    expect(steady.splitMs).toBeCloseTo(
      succeeded(benchmarkPace(BENCHMARK_2K_MS)) + TARGET_OFFSETS_MS.steady,
      6,
    )
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuses a 2k of %p', (benchmark) => {
    expect(failed(benchmarkPace(benchmark))).toMatchObject({
      _tag: 'Training.PaceRangeError',
      field: 'durationMs',
    })
  })
})

describe('guards', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuses a 2k of %p', (benchmark) => {
    expect(failed(targetFor(session('steady'), benchmark, 1))).toMatchObject({
      _tag: 'Training.PaceRangeError',
      field: 'durationMs',
    })
  })

  it('refuses a distance piece with no distance', () => {
    expect(failed(targetFor(session('distancePiece'), BENCHMARK_2K_MS, 1))).toMatchObject({
      _tag: 'Training.PaceRangeError',
      field: 'distanceM',
      value: 0,
    })
  })

  it.each([0, -500, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses a distance piece of %p m',
    (distanceM) => {
      expect(
        failed(targetFor(session('distancePiece', { distanceM }), BENCHMARK_2K_MS, 1)),
      ).toMatchObject({
        field: 'distanceM',
        value: distanceM,
      })
    },
  )
})

describe('TARGET_OFFSETS_MS', () => {
  it('is the table the epic names, in seconds off 2k pace', () => {
    expect(TARGET_OFFSETS_MS).toEqual({
      steady: 20_000,
      shortRest: 6_000,
      longRest: 4_000,
      pacedTwoK: 1_000,
      distancePiece: 0,
    })
  })

  it('is what the targets are actually built from', () => {
    // The table is exported to be tuned. This is the assertion that it is the
    // real input and not documentation of a number hard-coded elsewhere.
    const pace2k = 106_050
    for (const kind of ['steady', 'shortRest', 'longRest', 'pacedTwoK'] as const)
      expect(splitOf(kind), kind).toBe(pace2k + TARGET_OFFSETS_MS[kind])
  })
})

describe('every session in the catalogue', () => {
  it('has a target', () => {
    for (const week of pete5k.weeks)
      for (const planSession of week.sessions)
        expect(
          Result.isSuccess(targetFor(planSession, BENCHMARK_2K_MS, 1)),
          `${planSession.id} (${planSession.kind})`,
        ).toBe(true)
  })
})

describe('isRotationShifted', () => {
  it('is true for exactly the two interval kinds whose target moves', () => {
    expect(isRotationShifted('shortRest')).toBe(true)
    expect(isRotationShifted('longRest')).toBe(true)
  })

  it('is false for the kinds a rotation does not re-pace', () => {
    for (const kind of ['steady', 'pacedTwoK', 'distancePiece'] as const)
      expect(isRotationShifted(kind), kind).toBe(false)
  })

  it('answers for exactly the kinds whose target actually moves between rotations', () => {
    // Not a restatement of the table: this drives targetFor twice, once per
    // rotation, and checks the predicate against what the numbers did.
    for (const kind of SESSION_KINDS) {
      const first = succeeded(targetFor(session(kind, { distanceM: 5000 }), BENCHMARK_2K_MS, 1))
      const second = succeeded(targetFor(session(kind, { distanceM: 5000 }), BENCHMARK_2K_MS, 2))

      expect(first.splitMs !== second.splitMs, kind).toBe(isRotationShifted(kind))
    }
  })
})

describe('steadyBandText', () => {
  it('is the canvas window around a steady target', () => {
    // 7:04.2 gives a steady target of 2:06.0, and the canvas prints the band
    // around it as 2:04–2:08.
    const steady = succeeded(targetFor(session('steady'), BENCHMARK_2K_MS, 1))

    expect(succeeded(steadyBandText(steady.splitMs))).toEqual({
      lower: '2:04.0',
      upper: '2:08.0',
    })
  })

  it('is symmetric about the target', () => {
    // 2:00.0 either side by two seconds, so the edges are equidistant in the
    // only form this function reports them in.
    expect(succeeded(steadyBandText(120_000))).toEqual({ lower: '1:58.0', upper: '2:02.0' })
  })

  it('is a window, not a point — steady is a zone', () => {
    const band = succeeded(steadyBandText(120_000))

    expect(band.lower).not.toBe(band.upper)
  })

  it.each([0, -1, Number.NaN])('refuses a split of %p', (splitMs) => {
    expect(failed(steadyBandText(splitMs))).toMatchObject({ _tag: 'Training.PaceRangeError' })
  })
})
