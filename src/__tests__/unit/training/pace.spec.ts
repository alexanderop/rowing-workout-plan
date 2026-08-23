import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { FastCheck } from 'effect/testing'
import {
  durationMsFor,
  formatSplit,
  PaceRangeError,
  paceBand,
  splitFor,
  splitFromWatts,
  wattsFromSplit,
} from '@/features/training/pace'

/**
 * The arithmetic every other slice reads its numbers from, so the assertions
 * here are graded by `pnpm test:mutation` as well as by whether they pass —
 * a weak one costs more in this file than anywhere else in the app.
 *
 * Three things are being pinned, and they are not the same thing:
 *
 * - **The relation.** Concept2's `watts = 2.80 / (s/m)³` and the distance
 *   arithmetic around it. Properties say what is true of every input; the
 *   tables say what must not move.
 * - **The display.** `formatSplit` truncates tenths, which is a decision
 *   rather than a consequence, so it has its own boundary cases.
 * - **The guards.** Every function refuses a non-positive or non-finite
 *   input, naming the parameter. That is what keeps `NaN` off a screen, and
 *   an assertion that only checks "it failed" would let the wrong field
 *   through.
 */

/** Splits a human being actually rows: 1:20 to 3:00 per 500 m. */
const PLAUSIBLE_SPLIT_MS = FastCheck.integer({ min: 80_000, max: 180_000 })

const succeeded = <A, E>(result: Result.Result<A, E>): A => Result.getOrThrow(result)
const failed = <A, E>(result: Result.Result<A, E>): E => Result.getOrThrow(Result.flip(result))

describe('wattsFromSplit', () => {
  it('reproduces known split/power pairs', () => {
    // Straight from Concept2's own relation. The design canvas prints 247 W
    // beside 1:52.4, which is a mockup slip: 247 W is 1:52.3, and 1:52.4 is
    // 246 W. The formula is the authority, so the number here is 246.
    expect(succeeded(wattsFromSplit(112_400))).toBeCloseTo(246.47, 2)
    expect(succeeded(wattsFromSplit(106_000))).toBeCloseTo(293.87, 2)
    expect(succeeded(wattsFromSplit(126_000))).toBeCloseTo(174.97, 2)
  })

  it('rounds to the watt the way a screen would', () => {
    expect(Math.round(succeeded(wattsFromSplit(112_400)))).toBe(246)
    expect(Math.round(succeeded(wattsFromSplit(106_000)))).toBe(294)
    expect(Math.round(succeeded(wattsFromSplit(126_000)))).toBe(175)
  })

  it.prop(
    'is strictly decreasing in the split',
    [PLAUSIBLE_SPLIT_MS, PLAUSIBLE_SPLIT_MS],
    ([a, b]) => {
      // The invariant that makes the whole model usable: a slower split is
      // always less power, with no plateau anywhere in the range. Stated as a
      // comparison rather than a recomputed formula, so it cannot agree with
      // the code by copying it.
      const [slower, faster] = a > b ? [a, b] : [b, a]
      if (slower === faster) {
        expect(succeeded(wattsFromSplit(slower))).toBe(succeeded(wattsFromSplit(faster)))
        return
      }
      expect(succeeded(wattsFromSplit(slower))).toBeLessThan(succeeded(wattsFromSplit(faster)))
    },
  )

  it('refuses a split that is not a duration', () => {
    for (const bad of [0, -1, -112_400, Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = failed(wattsFromSplit(bad))
      expect(error).toBeInstanceOf(PaceRangeError)
      expect(error._tag).toBe('Training.PaceRangeError')
      expect(error.field).toBe('splitMs')
    }
  })

  it('reports the offending value, not just the field', () => {
    // The value is what a UI needs to say anything useful, and what a log
    // entry needs to be worth reading.
    expect(failed(wattsFromSplit(-3)).value).toBe(-3)
  })
})

describe('splitFromWatts', () => {
  it('inverts the known pairs', () => {
    expect(succeeded(splitFromWatts(294))).toBeCloseTo(105_984, 0)
    expect(succeeded(splitFromWatts(175))).toBeCloseTo(125_992, 0)
    expect(succeeded(splitFromWatts(247))).toBeCloseTo(112_320, 0)
  })

  it.prop('round-trips a split through power', [PLAUSIBLE_SPLIT_MS], ([splitMs]) => {
    const watts = succeeded(wattsFromSplit(splitMs))
    // Within a hundredth of a millisecond: the cube and cube root are exact
    // inverses, so anything larger than float noise here is a real defect.
    expect(succeeded(splitFromWatts(watts))).toBeCloseTo(splitMs, 2)
  })

  it('refuses a wattage that is not a power', () => {
    for (const bad of [0, -294, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(failed(splitFromWatts(bad)).field).toBe('watts')
    }
  })
})

describe('durationMsFor and splitFor', () => {
  it('converts between a piece and its pace', () => {
    // A 2k at 1:46.0 is 7:04.0; the canvas's sample 2k of 7:04.2 is 1:46.05.
    expect(succeeded(durationMsFor(2000, 106_000))).toBe(424_000)
    expect(succeeded(splitFor(2000, 424_200))).toBe(106_050)
    expect(succeeded(durationMsFor(500, 112_400))).toBe(112_400)
    expect(succeeded(splitFor(1000, 224_800))).toBe(112_400)
  })

  it.prop(
    'round-trips a distance through its duration',
    [FastCheck.integer({ min: 100, max: 42_195 }), PLAUSIBLE_SPLIT_MS],
    ([distanceM, splitMs]) => {
      const durationMs = succeeded(durationMsFor(distanceM, splitMs))
      expect(succeeded(splitFor(distanceM, durationMs))).toBeCloseTo(splitMs, 6)
    },
  )

  it('names which of the two arguments was wrong', () => {
    // Both parameters are guarded, and a failure that pointed at the wrong
    // one would send a user to fix the field that was already fine.
    expect(failed(durationMsFor(0, 112_400)).field).toBe('distanceM')
    expect(failed(durationMsFor(2000, 0)).field).toBe('splitMs')
    expect(failed(splitFor(-2000, 424_000)).field).toBe('distanceM')
    expect(failed(splitFor(2000, Number.NaN)).field).toBe('durationMs')
  })

  it('checks the distance before the duration', () => {
    // Two bad arguments, one failure: the first one reported is the first one
    // declared, so the error is stable rather than whichever guard ran last.
    expect(failed(splitFor(0, 0)).field).toBe('distanceM')
  })

  it('never returns Infinity for a zero distance', () => {
    // The reason the whole module returns a Result. `424000 / 0` is a number
    // that renders.
    expect(Result.isFailure(splitFor(0, 424_000))).toBe(true)
  })
})

describe('formatSplit', () => {
  it('writes a split the way a rower reads it', () => {
    expect(succeeded(formatSplit(112_400))).toBe('1:52.4')
    expect(succeeded(formatSplit(106_000))).toBe('1:46.0')
    expect(succeeded(formatSplit(126_000))).toBe('2:06.0')
  })

  it('zero-pads the seconds and does not pad the minutes', () => {
    expect(succeeded(formatSplit(5_000))).toBe('0:05.0')
    expect(succeeded(formatSplit(600))).toBe('0:00.6')
    expect(succeeded(formatSplit(600_000))).toBe('10:00.0')
  })

  it('truncates tenths rather than rounding them', () => {
    // The display decision, pinned on both sides of the tenth so a change to
    // rounding cannot land quietly. 1:46.05 is what the canvas writes as
    // 1:46.0.
    expect(succeeded(formatSplit(106_050))).toBe('1:46.0')
    expect(succeeded(formatSplit(112_499))).toBe('1:52.4')
    expect(succeeded(formatSplit(112_500))).toBe('1:52.5')
  })

  it('absorbs the float noise a computed split arrives with', () => {
    // splitFor multiplies and divides, so a pace that is 106_000 ms can reach
    // here as 105_999.999…. Truncating that directly reads 1:45.9.
    expect(succeeded(formatSplit(105_999.999_999_99))).toBe('1:46.0')
    expect(succeeded(formatSplit(106_000.000_000_01))).toBe('1:46.0')
  })

  it('never carries a rounded 60 into the seconds field', () => {
    expect(succeeded(formatSplit(119_960))).toBe('1:59.9')
    expect(succeeded(formatSplit(119_999))).toBe('1:59.9')
    expect(succeeded(formatSplit(120_000))).toBe('2:00.0')
  })

  it('refuses to render a split that is not one', () => {
    for (const bad of [0, -112_400, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(failed(formatSplit(bad)).field).toBe('splitMs')
    }
  })
})

describe('paceBand', () => {
  it('opens the window either side of the target', () => {
    expect(succeeded(paceBand(112_400, 1_000))).toEqual({ lower: 111_400, upper: 113_400 })
  })

  it('puts the faster split at the lower edge', () => {
    // Splits count down as they get faster, so `lower` is the hard end of the
    // band. A live screen that had these the wrong way round would praise you
    // for going slow.
    const band = succeeded(paceBand(112_400, 1_000))
    expect(band.lower).toBeLessThan(112_400)
    expect(band.upper).toBeGreaterThan(112_400)
  })

  it('allows a tolerance of zero — hit it exactly', () => {
    expect(succeeded(paceBand(112_400, 0))).toEqual({ lower: 112_400, upper: 112_400 })
  })

  it('refuses a band wide enough to reach zero', () => {
    // The fast edge would be a split of zero or less, which is not a pace.
    // Clamping instead would show a band nobody asked for.
    expect(failed(paceBand(112_400, 112_400)).field).toBe('toleranceMs')
    expect(failed(paceBand(112_400, 200_000)).field).toBe('toleranceMs')
    expect(Result.isSuccess(paceBand(112_400, 112_399))).toBe(true)
  })

  it('refuses a negative or non-finite tolerance', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(failed(paceBand(112_400, bad)).field).toBe('toleranceMs')
    }
  })

  it('refuses a target that is not a split', () => {
    expect(failed(paceBand(0, 1_000)).field).toBe('splitMs')
  })

  it.prop(
    'always contains its target',
    [PLAUSIBLE_SPLIT_MS, FastCheck.integer({ min: 0, max: 5_000 })],
    ([splitMs, toleranceMs]) => {
      const band = succeeded(paceBand(splitMs, toleranceMs))
      expect(band.lower).toBeLessThanOrEqual(splitMs)
      expect(band.upper).toBeGreaterThanOrEqual(splitMs)
      expect(band.upper - band.lower).toBe(toleranceMs * 2)
    },
  )
})
