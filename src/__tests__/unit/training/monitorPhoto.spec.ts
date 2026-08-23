import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import {
  MONITOR_PHOTO_PROMPT,
  MonitorPhotoError,
  parseMonitorReading,
} from '@/features/training/monitorPhoto'

/**
 * The deterministic half of the photo scan. The model transcribes; every
 * conversion, derivation and cross-check is here, so this file is where the
 * feature's correctness actually lives — and it is in the mutation scope.
 *
 * Three contracts are pinned:
 *
 * - **The transcription tolerated.** JSON hunted out of prose, numbers as
 *   numbers or as display strings with separators and units, clocks in every
 *   shape a PM5 writes one.
 * - **The derivation.** Duration from the shown time when there is one, from
 *   the average split when there is not — the Just Row summary screen shows
 *   no total time at all.
 * - **The cross-check.** Time and split on the same photo must agree within
 *   the tolerance, and a disagreement flags the reading rather than failing
 *   it: the time wins, the rower is told to look.
 */

const succeeded = (text: string) => Result.getOrThrow(parseMonitorReading(text))
const failed = (text: string): MonitorPhotoError =>
  Result.getOrThrow(Result.flip(parseMonitorReading(text)))

/** The one from the photo this feature was asked for: a Just Row summary —
 * distance and average split on screen, no total time anywhere. */
const JUST_ROW = '{"distance": "4559", "time": null, "avgSplit": "2:44.5", "rate": "20"}'

describe('parseMonitorReading', () => {
  it('reads a Just Row summary, deriving the duration from the split', () => {
    // 4559 m at 2:44.5 /500m is 4559 × 329 ms = 1_499_911 ms, rounded to the
    // whole second the time field holds.
    expect(succeeded(JUST_ROW)).toEqual({
      distanceM: 4559,
      durationMs: 1_500_000,
      avgRate: 20,
      consistent: true,
    })
  })

  it('digs the JSON out of a reply wrapped in prose', () => {
    expect(succeeded(`Sure! Here is the reading: ${JUST_ROW} Let me know!`)).toEqual(
      succeeded(JUST_ROW),
    )
    expect(succeeded(` ${JUST_ROW}`)).toEqual(succeeded(JUST_ROW))
  })

  it('carries its tag, so one catchTags can tell it from a db failure', () => {
    expect(failed('no json here')._tag).toBe('Training.MonitorPhotoError')
  })

  it('prefers the shown time over the split for the duration', () => {
    // 2000 m in 7:00 at 1:45.0 — time and split agree, time is stored.
    const reading = succeeded('{"distance": "2000", "time": "7:00", "avgSplit": "1:45.0"}')

    expect(reading.durationMs).toBe(420_000)
    expect(reading.consistent).toBe(true)
    expect(reading).not.toHaveProperty('avgRate')
  })

  it('rounds a time with tenths to the whole second the field holds', () => {
    expect(succeeded('{"distance": "2000", "time": "12:34.9"}').durationMs).toBe(755_000)
    expect(succeeded('{"distance": "2000", "time": "12:34.4"}').durationMs).toBe(754_000)
  })

  describe('the reply itself', () => {
    it('fails with noJson when the reply has no braces', () => {
      expect(failed('a rowing machine showing 4559 metres').reason).toBe('noJson')
      expect(failed('').reason).toBe('noJson')
    })

    it('fails with noJson when the braces never open', () => {
      expect(failed('} nothing here {').reason).toBe('noJson')
      expect(failed('starts { and never closes').reason).toBe('noJson')
      expect(failed('just a closing } and nothing else').reason).toBe('noJson')
    })

    it('fails with badJson when the braces hold something else', () => {
      expect(failed('{not json at all}').reason).toBe('badJson')
    })

    it('fails with badNumbers when the JSON is empty', () => {
      expect(failed('{}').reason).toBe('badNumbers')
    })
  })

  describe('distance', () => {
    it('accepts a JSON number, and rounds a decimal transcription', () => {
      expect(succeeded('{"distance": 4559, "time": "25:00"}').distanceM).toBe(4559)
      expect(succeeded('{"distance": "4559.6", "time": "25:00"}').distanceM).toBe(4560)
    })

    it('accepts the separators and units a transcription carries', () => {
      expect(succeeded('{"distance": "4,559", "time": "25:00"}').distanceM).toBe(4559)
      expect(succeeded('{"distance": "4 559 m", "time": "25:00"}').distanceM).toBe(4559)
      expect(succeeded('{"distance": "4559M", "time": "25:00"}').distanceM).toBe(4559)
    })

    it('holds the field ceiling: 99999 fits, 100000 does not', () => {
      expect(succeeded('{"distance": "99999", "time": "99:59"}').distanceM).toBe(99_999)
      expect(failed('{"distance": "100000", "time": "99:59"}').reason).toBe('badNumbers')
    })

    it('rejects a missing, zero, negative or garbled distance', () => {
      expect(failed('{"time": "7:00"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "0", "time": "7:00"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "-2000", "time": "7:00"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "12m34", "time": "7:00"}').reason).toBe('badNumbers')
      expect(failed('{"distance": true, "time": "7:00"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "", "time": "7:00"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "Infinity", "time": "7:00"}').reason).toBe('badNumbers')
    })
  })

  describe('clocks', () => {
    it('reads every shape a PM5 writes one', () => {
      expect(succeeded('{"distance": "2000", "time": "7:04"}').durationMs).toBe(424_000)
      expect(succeeded('{"distance": "2000", "time": "1:02:33"}').durationMs).toBe(3_753_000)
      expect(succeeded('{"distance": "2000", "time": "90"}').durationMs).toBe(90_000)
      expect(succeeded('{"distance": "2000", "time": "0:30"}').durationMs).toBe(30_000)
      expect(succeeded('{"distance": "2000", "time": 754.9}').durationMs).toBe(755_000)
    })

    it('rejects a clock no monitor shows', () => {
      // Sixty seconds carry, they are not displayed; and a clock has at most
      // three fields, none of them blank, fractional above the seconds, or
      // negative.
      expect(failed('{"distance": "2000", "time": "12:74"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": "1:60"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": "1:2:3:4"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": "0:0:0:5"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": "5:-30"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": "1:2.5:30"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": "12:"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": ":30"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": "1.5:30"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": "-1:30"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": "abc"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": 0}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": -30}').reason).toBe('badNumbers')
      expect(failed('{"distance": "2000", "time": true}').reason).toBe('badNumbers')
    })

    it('treats a zero clock as not shown, falling back to the split', () => {
      // ":00" on an interval screen transcribes as a time that is no time.
      const reading = succeeded('{"distance": "1000", "time": "0:00", "avgSplit": "2:00.0"}')

      expect(reading.durationMs).toBe(240_000)
      expect(reading.consistent).toBe(true)
    })

    it('treats a nonsense time the same way — the split still counts', () => {
      // A zero, negative or unbounded time is not a reading; the split is.
      const cases = [
        '{"distance": "1000", "time": 0, "avgSplit": "2:00.0"}',
        '{"distance": "1000", "time": -30, "avgSplit": "2:00.0"}',
        '{"distance": "1000", "time": 1e999, "avgSplit": "2:00.0"}',
        '{"distance": "1000", "time": "1e999", "avgSplit": "2:00.0"}',
      ]

      for (const text of cases) expect(succeeded(text).durationMs).toBe(240_000)
    })

    it('refuses an unbounded split rather than deriving from it', () => {
      expect(failed('{"distance": "1000", "avgSplit": "1e999"}').reason).toBe('badNumbers')
    })

    it('fails when the photo shows neither a time nor a split', () => {
      expect(failed('{"distance": "4559"}').reason).toBe('badNumbers')
      expect(failed('{"distance": "4559", "time": null, "avgSplit": null}').reason).toBe(
        'badNumbers',
      )
    })

    it('fails on a split with no distance to multiply it by', () => {
      expect(failed('{"avgSplit": "2:00.0"}').reason).toBe('badNumbers')
    })
  })

  describe('the duration ceiling', () => {
    it('holds the time mask ceiling: 99:59 fits, 100:00 does not', () => {
      expect(succeeded('{"distance": "20000", "time": "99:59"}').durationMs).toBe(5_999_000)
      expect(failed('{"distance": "20000", "time": "100:00"}').reason).toBe('badNumbers')
    })

    it('rejects a time that rounds away to nothing', () => {
      expect(failed('{"distance": "2000", "time": 0.4}').reason).toBe('badNumbers')
    })
  })

  describe('the cross-check', () => {
    it('flags a split that contradicts the time, keeping the time', () => {
      // 2000 m in 10:00 is a 2:30.0 average; a transcribed 2:33.5 implies
      // 614 s — 2.3% out, past the 2% tolerance.
      const reading = succeeded('{"distance": "2000", "time": "10:00", "avgSplit": "2:33.5"}')

      expect(reading.durationMs).toBe(600_000)
      expect(reading.consistent).toBe(false)
    })

    it('flags a disagreement in either direction', () => {
      // The same 14 s gap on the fast side: 2:26.5 implies 586 s.
      expect(
        succeeded('{"distance": "2000", "time": "10:00", "avgSplit": "2:26.5"}').consistent,
      ).toBe(false)
    })

    it('tolerates a disagreement of exactly two percent', () => {
      // 2:33.0 implies 612 s against 600 s shown — 12 s is exactly 2%.
      expect(
        succeeded('{"distance": "2000", "time": "10:00", "avgSplit": "2:33.0"}').consistent,
      ).toBe(true)
    })

    it('never checks a derived duration against its own source', () => {
      // 18 m at 2:30.0 implies 5.4 s, stored as 5 s — an 8% gap between the
      // exact value and its own rounding. With no shown time there is nothing
      // to disagree with, so the reading is consistent by definition.
      expect(succeeded('{"distance": "18", "avgSplit": "2:30.0"}')).toEqual({
        distanceM: 18,
        durationMs: 5000,
        consistent: true,
      })
    })
  })

  describe('rate', () => {
    it('rounds a transcribed rate and keeps it inside the field range', () => {
      expect(succeeded('{"distance": "2000", "time": "7:00", "rate": "20.4"}').avgRate).toBe(20)
      expect(succeeded('{"distance": "2000", "time": "7:00", "rate": "9.6"}').avgRate).toBe(10)
      expect(succeeded('{"distance": "2000", "time": "7:00", "rate": 60}').avgRate).toBe(60)
    })

    it('drops a rate no rower strokes at rather than failing the reading', () => {
      expect(succeeded('{"distance": "2000", "time": "7:00", "rate": "9.4"}')).not.toHaveProperty(
        'avgRate',
      )
      expect(succeeded('{"distance": "2000", "time": "7:00", "rate": "60.6"}')).not.toHaveProperty(
        'avgRate',
      )
      expect(succeeded('{"distance": "2000", "time": "7:00", "rate": "spm"}')).not.toHaveProperty(
        'avgRate',
      )
      expect(succeeded('{"distance": "2000", "time": "7:00", "rate": null}')).not.toHaveProperty(
        'avgRate',
      )
    })
  })
})

describe('MONITOR_PHOTO_PROMPT', () => {
  it('asks for exactly the fields the parser reads, as JSON', () => {
    // The prompt and the parser are two halves of one wire format; a prompt
    // that stops naming a field starves the parser of it silently.
    expect(MONITOR_PHOTO_PROMPT).toContain('JSON')
    expect(MONITOR_PHOTO_PROMPT).toContain('"distance"')
    expect(MONITOR_PHOTO_PROMPT).toContain('"time"')
    expect(MONITOR_PHOTO_PROMPT).toContain('"avgSplit"')
    expect(MONITOR_PHOTO_PROMPT).toContain('"rate"')
    expect(MONITOR_PHOTO_PROMPT).toContain('null')
  })
})
