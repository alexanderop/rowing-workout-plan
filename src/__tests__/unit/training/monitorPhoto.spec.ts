import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { MonitorPhotoError, parseMonitorReading } from '@/features/training/monitorPhoto'
import type { OcrLine } from '@/lib/ocr'
import justRow4559mClose from '../../fixtures/monitor-photo/just-row-4559m-close.json'
import justRow4559m from '../../fixtures/monitor-photo/just-row-4559m.json'

/**
 * The deterministic half of the photo scan — which, since the models do
 * nothing but transcribe, is now the whole feature. This file is where its
 * correctness lives, and it is in the mutation scope.
 *
 * Four contracts are pinned:
 *
 * - **The photos it was asked for.** Two real readings of a real PM5, kept
 *   as evidence in `fixtures/monitor-photo/`, have to come out as the row
 *   that monitor was showing. Everything below only explains why.
 * - **Which line is a value.** A PM5 draws its numbers about twice the
 *   height of the unit labels beside them; without that the `/500m` under
 *   the pace reads as a 500 metre row.
 * - **Which field a value is.** The words to its right on its own line —
 *   and `split` and `projected finish` are parts of a piece, not the piece.
 * - **The derivation and the cross-check.** Duration from the shown time
 *   when there is one, from the average split when there is not — a Just Row
 *   screen shows no total time at all. On a photo showing both, a
 *   disagreement past the tolerance flags the reading rather than failing
 *   it: the time wins, the rower is told to look.
 */

const succeeded = (lines: ReadonlyArray<OcrLine>) => Result.getOrThrow(parseMonitorReading(lines))
const failed = (lines: ReadonlyArray<OcrLine>): MonitorPhotoError =>
  Result.getOrThrow(Result.flip(parseMonitorReading(lines)))

/**
 * One line the recogniser read, at a box. Sure of itself unless a test says
 * otherwise, since how sure it was is only one rule's business and spelling
 * it out on every line here would bury the layout the rest are about.
 */
function line(
  text: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
  confidence = 1,
): OcrLine {
  return { text, left, top, right, bottom, confidence }
}

/** Values are drawn tall, unit labels short — the whole basis of telling one
 * from the other, so the fixtures keep the PM5's own proportion. */
const VALUE_HEIGHT = 60
const LABEL_HEIGHT = 20
const ROW_PITCH = 90

/**
 * A monitor screen as a reply: one row per pair, the value on the left and
 * whatever the monitor prints beside it on the right. An empty label is a
 * value with nothing next to it.
 */
function screen(
  ...rows: ReadonlyArray<readonly [value: string, label: string]>
): ReadonlyArray<OcrLine> {
  return rows.flatMap(([value, label], row) => {
    const top = 50 + row * ROW_PITCH

    return [
      line(value, 100, top, 400, top + VALUE_HEIGHT),
      // Flush against the value's right edge: a label starting exactly
      // there is beside it, and the tests below all depend on that.
      ...(label === '' ? [] : [line(label, 400, top, 700, top + LABEL_HEIGHT)]),
    ]
  })
}

/** The rows a PM5 prints for the fields this feature reads, in screen order. */
function photo(fields: {
  distance?: string
  time?: string
  avgSplit?: string
  rate?: string
}): ReadonlyArray<OcrLine> {
  const rows: Array<readonly [string, string]> = []
  if (fields.time !== undefined) rows.push([fields.time, 'time'])
  if (fields.distance !== undefined) rows.push([fields.distance, 'm'])
  if (fields.avgSplit !== undefined) rows.push([fields.avgSplit, 'ave /500m'])
  if (fields.rate !== undefined) rows.push([fields.rate, 's/m'])

  return screen(...rows)
}

const read = (fields: Parameters<typeof photo>[0]) => succeeded(photo(fields))
const misread = (fields: Parameters<typeof photo>[0]): MonitorPhotoError => failed(photo(fields))

describe('parseMonitorReading', () => {
  describe('the photos the feature was asked for', () => {
    it('reads the real reading of a real PM5', () => {
      // A Just Row screen mid-piece: 4559 m at a 2:44.5 average, no total
      // time anywhere on it. 4559 × 329 ms is 1_499_911 ms, the whole second
      // the time field holds being 25:00. See the fixture's README for what
      // the monitor was showing.
      expect(succeeded(justRow4559m)).toEqual({
        distanceM: 4559,
        durationMs: 1_500_000,
        consistent: true,
      })
    })

    it('reads the same screen photographed closer', () => {
      // The photo the previous model could not read: it made the stacked
      // `s/m` beside the stroke rate into a plain `m`, which gave the
      // distance field to the `:00` next to it and ended the reading there.
      expect(succeeded(justRow4559mClose)).toEqual({
        distanceM: 4559,
        durationMs: 1_500_000,
        consistent: true,
      })
    })

    it('leaves the rate off those photos rather than guessing at it', () => {
      // The PM5 prints `20 s/m` as a superscript neither model resolves —
      // one reads it as a bare `m`, the other as a Chinese character — so
      // the `20` is a value with nothing beside it to name it. The form's
      // rate field is optional; a guessed rate would not be.
      expect(succeeded(justRow4559m)).not.toHaveProperty('avgRate')
      expect(succeeded(justRow4559mClose)).not.toHaveProperty('avgRate')
    })
  })

  describe('which line is a value', () => {
    it('does not read the /500m under a pace as a 500 metre row', () => {
      // The label is a third the height of the number it belongs to. Treat
      // it as a value and its trailing `m` makes it a 500 m piece.
      const paceOnly = [line('2:30', 100, 50, 400, 110), line('500m', 420, 80, 520, 100)]

      expect(failed(paceOnly).reason).toBe('badNumbers')
    })

    it('reads a full-height 500 m row as the 500 m row it is', () => {
      expect(read({ distance: '500', avgSplit: '2:00.0' }).distanceM).toBe(500)
    })

    it('counts a value exactly half the tallest as a value', () => {
      // Half is the line itself, not the far side of it: a PM5 draws its
      // secondary rows a little over half the primary one, so a boundary
      // that excluded them would drop the distance off a screen whose pace
      // is the big number.
      const halfHeight = [
        line('2:30', 100, 50, 400, 170), // the tallest line: 120
        line('4559', 100, 200, 400, 260), // exactly 60
        line('m', 400, 200, 500, 220),
        line('2:44.5', 100, 300, 400, 360),
        line('ave', 400, 300, 500, 320),
      ]
      expect(succeeded(halfHeight).distanceM).toBe(4559)
    })

    it('measures against the tallest number, not the tallest word', () => {
      // The moulded `concept` badge above the screen is bigger than anything
      // on it. Let it set the scale and every real value falls under half.
      const badged = [
        line('CONCEPT', 100, 0, 900, 200),
        line('4559', 100, 250, 400, 310),
        line('m', 400, 250, 500, 270),
        line('2:44.5', 100, 350, 400, 410),
        line('ave', 400, 350, 500, 370),
      ]
      expect(succeeded(badged).distanceM).toBe(4559)
    })

    it('never lets one value label another', () => {
      // A `/500m` the model read at full height is a value, not a label —
      // and a value beside the metre count must not rename it.
      const twoValues = [
        line('4559', 100, 50, 400, 110),
        line('500m', 400, 50, 700, 110),
        line('m', 700, 50, 800, 70),
        line('2:44.5', 100, 150, 400, 210),
        line('ave', 400, 150, 500, 170),
      ]
      expect(succeeded(twoValues).distanceM).toBe(4559)
    })

    it('reads a unit the model spaced off its number', () => {
      // `4559 m` comes back as one line about as often as two, space and all.
      expect(succeeded(screen(['4559 m', ''], ['2:44.5', 'ave /500m'])).distanceM).toBe(4559)
    })

    it('does not take a value out of the middle of a word', () => {
      // `Row 2000m` is a workout's name, not its result. Only a line that
      // *starts* with digits is a number the monitor is reporting.
      const named = [
        line('Row 2000', 100, 50, 400, 110),
        line('m', 400, 50, 500, 70),
        line('2:44.5', 100, 150, 400, 210),
        line('ave', 400, 150, 500, 170),
      ]
      expect(failed(named).reason).toBe('badNumbers')
    })

    it('fails with noText on a reading holding no digits at all', () => {
      expect(failed(screen(['Units', ''], ['Menu', ''])).reason).toBe('noText')
      expect(failed([]).reason).toBe('noText')
      expect(failed([line('a rowing machine, unread', 100, 50, 400, 110)]).reason).toBe('noText')
    })

    it('carries its tag, so one catchTags can tell it from a db failure', () => {
      expect(failed([])._tag).toBe('Training.MonitorPhotoError')
    })
  })

  describe('which field a value is', () => {
    it('takes the metres from the value labelled m, and the average from the one labelled ave', () => {
      expect(read({ distance: '4559', avgSplit: '2:44.5' })).toEqual({
        distanceM: 4559,
        durationMs: 1_500_000,
        consistent: true,
      })
    })

    it('reads the unit off the value itself when the model runs them together', () => {
      // `4559 m` comes back as one line, `4559m`, about as often as two.
      expect(succeeded(screen(['4559m', ''], ['2:44.5', 'ave /500m'])).distanceM).toBe(4559)
    })

    it('finds the unit inside a line the model ran together', () => {
      // Florence-2 merges a whole row as readily as it separates one — the
      // real photo below has `:00` and the stroke rate as a single line. A
      // metre count whose `m` is mid-line is still a metre count.
      const runOn = screen(['4559 m 874', ''], ['2:44.5', 'ave /500m'])

      expect(succeeded(runOn).distanceM).toBe(4559)
    })

    it('does not turn a spaced-out /500 m into a 500 metre row', () => {
      // Cutting the labels into words costs the `500` its `m`; the pace rule
      // has to know a bare `500` or the distance rule claims the `m` that is
      // left over.
      const spaced = [
        line('2:30', 100, 50, 400, 110),
        line('/500 m', 400, 70, 520, 90),
        line('4559', 100, 150, 400, 210),
        line('m', 400, 150, 500, 170),
        line('2:44.5', 100, 250, 400, 310),
        line('ave', 400, 250, 500, 270),
      ]
      expect(succeeded(spaced).distanceM).toBe(4559)
    })

    it('drops a split and a projected finish — parts of a piece, not the piece', () => {
      const withSplits = screen(
        ['4559', 'm'],
        ['2:44.5', 'ave /500m'],
        ['874', 'split m'],
        ['9999', 'projected finish'],
      )

      expect(succeeded(withSplits).distanceM).toBe(4559)
    })

    it('drops them through the model’s own misspellings of the labels', () => {
      // `projted` and `flish` are what Florence-2 makes of `projected
      // finish` on a blurry LCD; the whole row hangs on catching them.
      const misspelt = screen(['4559', 'm'], ['2:44.5', 'ave /500m'], ['9999', 'projted flish'])

      expect(succeeded(misspelt).distanceM).toBe(4559)
    })

    it('drops a calorie count and a watts reading', () => {
      const withPower = screen(['4559', 'm'], ['2:44.5', 'ave /500m'], ['210', 'watts'])

      expect(succeeded(withPower).distanceM).toBe(4559)
    })

    it('ignores a value with nothing beside it to say what it is', () => {
      // The top-left clock on a Just Row screen carries no label at all.
      expect(failed(screen(['25:00', ''], ['4559', ''])).reason).toBe('badNumbers')
    })

    it('reads the labels to the right of a value, not the ones to its left', () => {
      // `ave` printed left of the metre count would turn 4559 metres into a
      // 4559 second average split, and leave the row with no distance.
      const mirrored = [
        line('ave /500m', 100, 50, 300, 70),
        line('4559', 320, 50, 620, 110),
        line('m', 620, 50, 700, 70),
        line('2:44.5', 320, 150, 620, 210),
        line('ave', 620, 150, 700, 170),
      ]
      expect(succeeded(mirrored).distanceM).toBe(4559)
    })

    it('reads a label whose box overlaps the number’s own', () => {
      // Measured centre to centre, not edge to edge. A detector pads every
      // box it finds, so the `m` of `4559 m` starts a few pixels left of
      // where the number's box ends — on an edge test the distance loses its
      // unit and the photo fails. The `ave` below overlaps the same way and
      // is read the same way, which is the trade: a label sitting over the
      // *right half* of a number is taken as beside it.
      const overlapping = [
        line('4559', 100, 50, 400, 110),
        line('ave', 350, 50, 500, 70),
        line('m', 500, 50, 600, 70),
        line('2:44.5', 100, 150, 400, 210),
        line('ave', 400, 150, 500, 170),
      ]
      // `ave` wins the row over `m`, so the metre count is filed as a split
      // and the photo comes back unread rather than wrong.
      expect(failed(overlapping).reason).toBe('badNumbers')
    })

    it('reads only the labels on the value’s own line', () => {
      // Touching boxes do not overlap. The `ave` above ends exactly where
      // the metre count starts and the one below starts exactly where it
      // ends; both belong to their own row, and either one claiming this
      // value would file 4559 metres as a split time.
      const stacked = [
        line('ave', 400, 30, 500, 50),
        line('4559', 100, 50, 400, 110),
        line('m', 400, 50, 500, 70),
        line('ave', 400, 110, 500, 130),
        line('2:44.5', 100, 150, 400, 210),
        line('ave', 400, 150, 500, 170),
      ]
      expect(succeeded(stacked)).toEqual({
        distanceM: 4559,
        durationMs: 1_500_000,
        consistent: true,
      })
    })

    it('keeps the first value a label claims, not the last', () => {
      // The PM5 prints the workout's own totals above the per-split rows, so
      // the first metre count down the screen is the distance rowed.
      expect(read({ distance: '4559', avgSplit: '2:44.5' }).distanceM).toBe(
        succeeded(screen(['4559', 'm'], ['2:44.5', 'ave /500m'], ['874', 'm'])).distanceM,
      )
    })
  })

  describe('distance', () => {
    it('accepts the separators and units a transcription carries', () => {
      expect(read({ distance: '4,559', avgSplit: '2:44.5' }).distanceM).toBe(4559)
      expect(read({ distance: '4559.6', avgSplit: '2:44.5' }).distanceM).toBe(4560)
    })

    it('holds the field ceiling: 99999 fits, 100000 does not', () => {
      expect(read({ distance: '99999', time: '99:59' }).distanceM).toBe(99_999)
      expect(misread({ distance: '100000', time: '99:59' }).reason).toBe('badNumbers')
    })

    it('rejects a missing or zero distance', () => {
      expect(misread({ time: '7:00' }).reason).toBe('badNumbers')
      expect(misread({ distance: '0', time: '7:00' }).reason).toBe('badNumbers')
    })
  })

  describe('clocks', () => {
    it('reads every shape a PM5 writes one', () => {
      expect(read({ distance: '2000', time: '7:04' }).durationMs).toBe(424_000)
      expect(read({ distance: '2000', time: '1:02:33' }).durationMs).toBe(3_753_000)
      expect(read({ distance: '2000', time: '90' }).durationMs).toBe(90_000)
      expect(read({ distance: '2000', time: '0:30' }).durationMs).toBe(30_000)
    })

    it('rounds a time with tenths to the whole second the field holds', () => {
      expect(read({ distance: '2000', time: '12:34.9' }).durationMs).toBe(755_000)
      expect(read({ distance: '2000', time: '12:34.4' }).durationMs).toBe(754_000)
    })

    it('rejects a clock no monitor shows', () => {
      // Sixty seconds carry, they are not displayed; and a clock has at most
      // three fields, none of them blank, fractional above the seconds, or
      // negative.
      const nonsense = [
        '12:74',
        '1:60',
        '1:2:3:4',
        // Four fields that would otherwise total a plausible five seconds,
        // and a fractional minute inside a three-field clock — the two the
        // length and whole-number checks exist for.
        '0:0:0:5',
        '1:2.5:30',
        '12:',
        ':30',
        '1.5:30',
      ]

      for (const time of nonsense)
        expect(misread({ distance: '2000', time }).reason).toBe('badNumbers')
    })

    it('refuses a digit run long enough to overflow a double', () => {
      // A small model on a noisy photo can repeat a digit until the number
      // stops being one: 400 nines is `Infinity`, which passes a `> 0` check
      // the way `NaN` does not. Reaching `durationMsFor` with it *throws*
      // rather than failing, and a throw here escapes `parseMonitorReading`
      // altogether — the sheet would sit on "Reading the photo…" for good.
      const overflowing = { distance: '4559', avgSplit: '9'.repeat(400) }

      expect(() => parseMonitorReading(photo(overflowing))).not.toThrow()
      expect(misread(overflowing).reason).toBe('badNumbers')
    })

    it('treats a zero clock as not shown, falling back to the split', () => {
      // `:00` is what the photo this feature was built from shows where a
      // total time would be.
      const reading = read({ distance: '1000', time: '0:00', avgSplit: '2:00.0' })

      expect(reading.durationMs).toBe(240_000)
      expect(reading.consistent).toBe(true)
    })

    it('fails when the photo shows neither a time nor a split', () => {
      expect(misread({ distance: '4559' }).reason).toBe('badNumbers')
    })

    it('fails on a split with no distance to multiply it by', () => {
      expect(misread({ avgSplit: '2:00.0' }).reason).toBe('badNumbers')
    })
  })

  describe('the duration ceiling', () => {
    it('holds the time mask ceiling: 99:59 fits, 100:00 does not', () => {
      expect(read({ distance: '20000', time: '99:59' }).durationMs).toBe(5_999_000)
      expect(misread({ distance: '20000', time: '100:00' }).reason).toBe('badNumbers')
    })

    it('rejects a time that rounds away to nothing', () => {
      expect(misread({ distance: '2000', time: '0.4' }).reason).toBe('badNumbers')
    })
  })

  describe('the cross-check', () => {
    it('flags a split that contradicts the time, keeping the time', () => {
      // 2000 m in 10:00 is a 2:30.0 average; a transcribed 2:33.5 implies
      // 614 s — 2.3% out, past the 2% tolerance.
      const reading = read({ distance: '2000', time: '10:00', avgSplit: '2:33.5' })

      expect(reading.durationMs).toBe(600_000)
      expect(reading.consistent).toBe(false)
    })

    it('flags a disagreement in either direction', () => {
      // The same 14 s gap on the fast side: 2:26.5 implies 586 s.
      expect(read({ distance: '2000', time: '10:00', avgSplit: '2:26.5' }).consistent).toBe(false)
    })

    it('tolerates a disagreement of exactly two percent', () => {
      // 2:33.0 implies 612 s against 600 s shown — 12 s is exactly 2%.
      expect(read({ distance: '2000', time: '10:00', avgSplit: '2:33.0' }).consistent).toBe(true)
    })

    it('checks against the exact shown time, not its whole-second rounding', () => {
      // 50 m at 2:34.0 implies exactly the 15.4 s shown; the form stores 15 s,
      // and 400 ms of rounding alone is 2.6% — a false alarm before this check
      // moved to the exact time.
      expect(read({ distance: '50', time: '15.4', avgSplit: '2:34.0' })).toEqual({
        distanceM: 50,
        durationMs: 15_000,
        consistent: true,
      })
    })

    it('never checks a derived duration against its own source', () => {
      // 18 m at 2:30.0 implies 5.4 s, stored as 5 s — an 8% gap between the
      // exact value and its own rounding. With no shown time there is nothing
      // to disagree with, so the reading is consistent by definition.
      expect(read({ distance: '18', avgSplit: '2:30.0' })).toEqual({
        distanceM: 18,
        durationMs: 5000,
        consistent: true,
      })
    })
  })

  describe('rate', () => {
    it('reads the value labelled s/m, rounded into the field range', () => {
      expect(read({ distance: '2000', time: '7:00', rate: '20.4' }).avgRate).toBe(20)
      expect(read({ distance: '2000', time: '7:00', rate: '9.6' }).avgRate).toBe(10)
      expect(read({ distance: '2000', time: '7:00', rate: '60' }).avgRate).toBe(60)
    })

    it('drops a rate no rower strokes at rather than failing the reading', () => {
      expect(read({ distance: '2000', time: '7:00', rate: '9.4' })).not.toHaveProperty('avgRate')
      expect(read({ distance: '2000', time: '7:00', rate: '60.6' })).not.toHaveProperty('avgRate')
      expect(read({ distance: '2000', time: '7:00' })).not.toHaveProperty('avgRate')
    })
  })
})

describe('what the reading is believed about', () => {
  it('ignores a line the recogniser was unsure of', () => {
    // A photographed erg is not a page: the frame and the six rubber buttons
    // come back as text too. This one would otherwise be a 4 metre row.
    const withNoise = [
      ...screen(['4559', 'm'], ['2:44.5', 'ave /500m']),
      line('4', 800, 50, 900, 110, 0.2),
      line('m', 900, 50, 950, 70, 0.2),
    ]

    expect(succeeded(withNoise).distanceM).toBe(4559)
  })

  it('does not let an unsure line set the scale every value is measured against', () => {
    // The worse half of the same problem: a button read as a digit at twice
    // the height of anything on the screen puts *every* real value under the
    // half-height line, and the photo fails for having no values on it.
    const withTallNoise = [
      ...screen(['4559', 'm'], ['2:44.5', 'ave /500m']),
      line('8', 800, 0, 900, 400, 0.2),
    ]

    expect(succeeded(withTallNoise).distanceM).toBe(4559)
  })
})

describe('a field a value could not be', () => {
  it('leaves the field open rather than filling it with a value that cannot be one', () => {
    // What the previous model did to the close photo, exactly: the `s/m`
    // beside the stroke rate reads as a bare `m`, so the `:00` beside it
    // claims the distance. Filed first-come, that claim also *holds* the
    // field, and the 4559 two rows down never lands.
    const mislabelled = [
      line(':00', 100, 50, 400, 110),
      line('m', 400, 50, 500, 70),
      ...screen(['4559', 'm'], ['2:44.5', 'ave /500m']).map((read) => ({
        ...read,
        top: read.top + 200,
        bottom: read.bottom + 200,
      })),
    ]

    expect(succeeded(mislabelled).distanceM).toBe(4559)
  })

  it('holds it against a split that is no clock and a rate that is no rate', () => {
    // Same rule, other fields: neither reading is one the field could hold,
    // so neither is filed and the row falls back on what is left.
    expect(succeeded(photo({ distance: '2000', time: '7:00', avgSplit: '9:99' }))).toEqual({
      distanceM: 2000,
      durationMs: 420_000,
      consistent: true,
    })
  })
})
