import { describe, expect, it } from '@effect/vitest'
import {
  type Pixels,
  alphabetFrom,
  boxesFrom,
  decodeLine,
  detectionInput,
  detectionSize,
  recognitionDimensions,
  recognitionInput,
} from '@/lib/ocr'

/**
 * The arithmetic between the photo and the reading. Core, so no doubles and
 * no browser (docs/functional-core.md): every function here is given its
 * pixels and its numbers and asked what it makes of them.
 *
 * Four things go wrong quietly enough to need pinning, and every one of them
 * has already been got wrong once building this:
 *
 * - **The off-by-one under CTC.** Class 0 is the blank, so class `n` is the
 *   `n - 1`th character. Off by one and every letter shifts.
 * - **YAML quoting in the alphabet.** Every digit in the shipped file is
 *   single-quoted. Read the line as written and `'4'` enters the alphabet as
 *   three characters, and a distance of 4559 reads back as `'4''5''5''9'`.
 * - **The stride the detector is shown at.** Not a multiple of 32 and the
 *   network will not take the tensor at all.
 * - **Which pixels end up where in a planar tensor.** A channel swap or a
 *   row/column transposition still produces a tensor of the right shape,
 *   which the runtime accepts and reads nothing from.
 */

/** A tiny image of flat colour, as a canvas hands one over: RGBA, row major. */
function flat(width: number, height: number, rgb: readonly [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let at = 0; at < width * height; at += 1) {
    data[at * 4] = rgb[0]
    data[at * 4 + 1] = rgb[1]
    data[at * 4 + 2] = rgb[2]
    data[at * 4 + 3] = 255
  }

  return { data, width, height }
}

/** A probability map with one rectangle of text in it. */
function map(width: number, height: number, box: Box, probability = 0.9): Float32Array {
  const values = new Float32Array(width * height)
  for (let y = box.top; y < box.bottom; y += 1)
    for (let x = box.left; x < box.right; x += 1) values[y * width + x] = probability

  return values
}

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

describe('detectionSize', () => {
  it('caps the longest side and lands both on the network’s stride', () => {
    expect(detectionSize(4032, 3024)).toEqual({ width: 960, height: 736 })
    expect(detectionSize(3024, 4032)).toEqual({ width: 736, height: 960 })
  })

  it('leaves a photo already under the cap alone, bar the rounding', () => {
    expect(detectionSize(640, 480)).toEqual({ width: 640, height: 480 })
    expect(detectionSize(700, 500)).toEqual({ width: 704, height: 512 })
  })

  it('never rounds a side away to nothing', () => {
    // A 4-pixel edge rounds to zero on the stride, and a zero-width tensor
    // is a runtime error rather than an empty reading.
    expect(detectionSize(4000, 4)).toEqual({ width: 960, height: 32 })
  })
})

describe('detectionInput', () => {
  it('writes one plane per channel, normalised the way the detector was trained', () => {
    const planes = detectionInput(flat(2, 1, [255, 0, 0]))

    // (1 - 0.485) / 0.229 red, (0 - 0.456) / 0.224 green, (0 - 0.406) / 0.225 blue.
    expect([...planes].map((value) => Number(value.toFixed(3)))).toEqual([
      2.249, 2.249, -2.036, -2.036, -1.804, -1.804,
    ])
  })

  it('drops the alpha a canvas always hands over', () => {
    expect(detectionInput(flat(3, 2, [10, 20, 30])).length).toBe(3 * 3 * 2)
  })
})

describe('boxesFrom', () => {
  it('finds a region and grows it back out of the shrink it was trained on', () => {
    // DBNet learns shrunk polygons, so a 20×10 region is drawn tighter than
    // the text it covers and has to be pushed back out.
    const boxes = boxesFrom(map(40, 20, { left: 10, top: 5, right: 30, bottom: 15 }), 40, 20, 1, 1)

    expect(boxes).toHaveLength(1)
    expect(boxes[0].left).toBeLessThan(10)
    expect(boxes[0].right).toBeGreaterThan(29)
  })

  it('scales the box into the photo’s own pixels', () => {
    // The detector is shown a photo shrunk to 960; the crops are cut from a
    // bigger one, so every box comes back multiplied by the ratio between
    // them. Rounded *after* the multiply, so the box lands on the photo's
    // pixel grid rather than on a multiple of the detector's — which is why
    // this is 7 and not four times the 2 the same region gives at scale 1.
    const region = { left: 10, top: 5, right: 30, bottom: 15 }
    const [box] = boxesFrom(map(40, 20, region), 40, 20, 4, 4)

    expect(boxesFrom(map(40, 20, region), 40, 20, 1, 1)[0].left).toBe(2)
    expect(box.left).toBe(7)
    expect(box.bottom).toBe(89)
  })

  it('keeps two regions apart when they touch only at a corner', () => {
    // Four neighbours, not eight. A PM5's digits nearly touch, and one box
    // around two of them is one number where there were two.
    const values = map(10, 10, { left: 0, top: 0, right: 3, bottom: 3 })
    for (let y = 3; y < 6; y += 1) for (let x = 3; x < 6; x += 1) values[y * 10 + x] = 0.9

    expect(boxesFrom(values, 10, 10, 1, 1)).toHaveLength(2)
  })

  it('drops a region the detector barely lit up', () => {
    // Above the pixel threshold, below the region one: enough to be an edge,
    // not enough to be a word.
    expect(
      boxesFrom(map(40, 20, { left: 10, top: 5, right: 30, bottom: 15 }, 0.4), 40, 20, 1, 1),
    ).toEqual([])
  })

  it('drops a region too thin in either direction to be a word', () => {
    expect(
      boxesFrom(map(40, 20, { left: 10, top: 5, right: 30, bottom: 7 }), 40, 20, 1, 1),
    ).toEqual([])
  })

  it('finds nothing on a photo with no text on it', () => {
    expect(boxesFrom(new Float32Array(400), 40, 10, 1, 1)).toEqual([])
  })
})

describe('recognitionInput', () => {
  it('fills the strip’s width only as far as the crop’s own aspect reaches', () => {
    // A square crop is 48 wide in a 320-wide strip; the rest stays at zero,
    // which is the padding the recogniser was trained with.
    const strip = recognitionInput(flat(20, 20, [255, 255, 255]), {
      left: 0,
      top: 0,
      right: 20,
      bottom: 20,
    })

    expect(strip[0]).toBe(1)
    expect(strip[47]).toBe(1)
    expect(strip[48]).toBe(0)
  })

  it('scales to ±1 rather than 0–1', () => {
    const strip = recognitionInput(flat(4, 4, [0, 0, 0]), { left: 0, top: 0, right: 4, bottom: 4 })

    expect(strip[0]).toBe(-1)
  })

  it('clamps a box the detector grew past the edge of the photo', () => {
    // Every box is unclipped outwards, so the ones against the frame come
    // back describing pixels that are not there.
    expect(() =>
      recognitionInput(flat(8, 8, [128, 128, 128]), {
        left: -20,
        top: -20,
        right: 40,
        bottom: 40,
      }),
    ).not.toThrow()
  })
})

describe('recognitionDimensions', () => {
  it('describes a batch of strips the recogniser’s own way round', () => {
    expect(recognitionDimensions(8)).toEqual([8, 3, 48, 320])
  })
})

describe('decodeLine', () => {
  /** Logits for one step, likeliest at `best`. */
  const step = (classes: number, best: number): ReadonlyArray<number> =>
    Array.from({ length: classes }, (_, index) => (index === best ? 5 : 0))

  const decode = (bests: ReadonlyArray<number>, alphabet: ReadonlyArray<string>) =>
    decodeLine(
      bests.flatMap((best) => step(alphabet.length + 1, best)),
      bests.length,
      alphabet.length + 1,
      alphabet,
    )

  it('reads class n as the n minus first character, because class 0 is the blank', () => {
    expect(decode([1, 2, 3], ['a', 'b', 'c']).text).toBe('abc')
  })

  it('drops the blank', () => {
    expect(decode([1, 0, 2], ['a', 'b']).text).toBe('ab')
  })

  it('collapses a class repeated across steps, and keeps one split by a blank', () => {
    // The whole point of CTC: `aa` is one long `a`, `a·a` is two.
    expect(decode([1, 1, 1], ['a']).text).toBe('a')
    expect(decode([1, 0, 1], ['a']).text).toBe('aa')
  })

  it('reads nothing at no confidence rather than dividing by no characters', () => {
    expect(decode([0, 0], ['a'])).toEqual({ text: '', confidence: 0 })
  })

  it('averages its confidence over the characters it kept', () => {
    expect(decode([1, 2], ['a', 'b']).confidence).toBe(5)
  })

  it('leaves a class the alphabet is too short for out rather than writing undefined', () => {
    expect(decode([9], ['a']).text).toBe('')
  })
})

describe('alphabetFrom', () => {
  /** The shape the recogniser's own `inference.yml` has, quoting and all. */
  const document = [
    'Global:',
    '  model_name: PP-OCRv5_mobile_rec',
    'PostProcess:',
    '  name: CTCLabelDecode',
    '  character_dict:',
    '  - 一',
    "  - '0'",
    "  - '''",
    '  - "m"',
    '  - :',
    '  use_space_char: true',
  ].join('\n')

  it('reads the list in the order the model’s output layer emits it', () => {
    expect(alphabetFrom(document)).toEqual(['一', '0', "'", 'm', ':'])
  })

  it('stops at the end of the list rather than reading the rest of the file', () => {
    expect(alphabetFrom(document)).not.toContain('use_space_char: true')
  })

  it('is empty for a document with no alphabet in it, rather than guessing', () => {
    // An empty alphabet fails the load loudly one layer up. Every class
    // reading as an empty string would fail it silently, one blank photo at
    // a time.
    expect(alphabetFrom('Global:\n  model_name: something-else\n')).toEqual([])
  })
})
