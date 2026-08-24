/**
 * Reading text off a photograph, as arithmetic.
 *
 * Core, not edge: every function here takes its pixels and its numbers as
 * arguments and answers the same way forever (docs/functional-core.md). The
 * canvas that decodes a photo, the sessions that run the two models and the
 * cache the weights land in are all one layer out, in
 * `lib/monitorPhotoModel.ts`. What is left — how a photo becomes a tensor,
 * how a probability map becomes boxes, how a row of logits becomes a word —
 * is ordinary maths that a spec can walk without a GPU.
 *
 * The models are PP-OCRv5 mobile: a DBNet detector that says *where* the
 * text is, and a CRNN recogniser that says *what each box reads*. Neither
 * generates tokens, which is the whole reason the pair is fast — the
 * Florence-2 vision-language model this replaced spent about 150 of its 190
 * decoder steps writing the corner coordinates a detector emits in one
 * convolution, and cost 1.4 s a photo on WebGPU and 9.5 s on the WASM
 * fallback against this pair's 0.2 s and 0.3 s.
 *
 * Everything below is PaddleOCR's own pre- and post-processing, written out
 * in TypeScript. Where a constant comes from the models' `inference.yml`
 * rather than from this app, the comment says so.
 */

/** One line of text the recogniser read, and the box it sat in — pixels of
 * the original photo, so nothing downstream has to know what the models were
 * shown. */
export interface OcrLine {
  readonly text: string
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  /** Mean per-character probability, 0–1. Worth less than it looks on a
   * photograph of a machine: the erg's own buttons come back as confidently
   * as its screen does. `features/training/monitorPhoto.ts` says what it is
   * and is not used for there. */
  readonly confidence: number
}

/** A decoded image as a canvas hands it over: RGBA, row major. */
export interface Pixels {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

/** An axis-aligned box in some image's pixels. */
export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** RGBA, which is what a canvas gives back whether or not the source had an
 * alpha channel. */
const CHANNELS = 4

/**
 * The longest side the detector is shown. PaddleOCR's `DetResizeForTest`
 * uses `resize_long: 960`; both sides are then rounded to a multiple of 32,
 * which is the network's downsampling factor.
 */
const DETECTION_LIMIT = 960
const STRIDE = 32

/** ImageNet normalisation, from the detector's `NormalizeImage` transform. */
const DETECTION_MEAN = [0.485, 0.456, 0.406]
const DETECTION_STD = [0.229, 0.224, 0.225]

/** `DBPostProcess` thresholds: a pixel is text above `PROBABILITY`, a region
 * is kept if it averages above `REGION`. */
const PROBABILITY_THRESHOLD = 0.3
const REGION_THRESHOLD = 0.6

/** A region thinner than this in either direction is noise, not a word. */
const MIN_BOX_SIDE = 3

/**
 * How far a detected region is grown before it is cropped.
 *
 * DBNet is trained on *shrunk* polygons, so every box comes back tight and
 * has to be pushed back out; PaddleOCR's default is 1.5. This is 2.5 because
 * the difference is measurable on a PM5 and only in one direction: at 1.5 and
 * 2.0 the recogniser reads the `ave` beside the average split as `aye`, which
 * loses the split and with it the whole workout, and at 2.5 it reads `ave` on
 * both capture photos. Nothing is lost to the larger crop — the labels sit in
 * open space on an LCD, not in dense text where a neighbour would be pulled in.
 */
const UNCLIP_RATIO = 2.5

/** The recogniser's input is a fixed 48×320 strip; `RecResizeImg` scales each
 * crop to the height and pads the width. */
const LINE_HEIGHT = 48
const LINE_WIDTH = 320

/** Four neighbours, not eight: two glyphs touching at a corner are two
 * glyphs, and on a PM5 the digits nearly touch. */
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * What the detector is shown, given a photo's size: the longest side capped,
 * both sides on the network's stride.
 */
export function detectionSize(width: number, height: number, limit: number = DETECTION_LIMIT) {
  const scale = Math.min(1, limit / Math.max(width, height))
  const onStride = (side: number): number =>
    Math.max(STRIDE, Math.round((side * scale) / STRIDE) * STRIDE)

  return { width: onStride(width), height: onStride(height) }
}

/**
 * The detector's input tensor: planar RGB, normalised. The caller has
 * already drawn the photo at `detectionSize`, because resampling is the
 * canvas's job and it does it in hardware.
 */
export function detectionInput(pixels: Pixels): Float32Array {
  const area = pixels.width * pixels.height
  const planes = new Float32Array(3 * area)

  for (let at = 0; at < area; at += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      planes[channel * area + at] =
        (pixels.data[at * CHANNELS + channel] / 255 - DETECTION_MEAN[channel]) /
        DETECTION_STD[channel]
    }
  }

  return planes
}

/**
 * How far out to push a tight box, in pixels. Clipper offsets a polygon by
 * `area × ratio / perimeter`; for a rectangle that is one number in both
 * directions, which is why no polygon library is needed here.
 */
function unclipOffset(width: number, height: number): number {
  return (width * height * UNCLIP_RATIO) / (2 * (width + height))
}

/**
 * The text regions in a probability map, as boxes in the original photo's
 * pixels.
 *
 * PaddleOCR fits a *rotated* rectangle to each region's contour. A PM5 is
 * photographed square-on and the only questions ever asked of these boxes
 * are "is this one right of that one" and "how tall is it", so an
 * axis-aligned box is the same answer without the geometry — and a
 * flood fill over the thresholded map is the whole of it.
 */
export function boxesFrom(
  probabilities: ArrayLike<number>,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
): ReadonlyArray<Box> {
  const area = width * height
  const seen = new Uint8Array(area)
  // An explicit stack rather than recursion: a region of a few thousand
  // pixels would be a few thousand frames deep.
  const pending = new Int32Array(area)
  const boxes: Box[] = []

  for (let start = 0; start < area; start += 1) {
    if (seen[start] === 1 || probabilities[start] < PROBABILITY_THRESHOLD) continue

    seen[start] = 1
    pending[0] = start
    let depth = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let total = 0
    let count = 0

    while (depth > 0) {
      depth -= 1
      const at = pending[depth]
      const x = at % width
      const y = (at - x) / width
      total += probabilities[at]
      count += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      for (const [dx, dy] of NEIGHBOURS) {
        const nextX = x + dx
        const nextY = y + dy
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue

        const next = nextY * width + nextX
        if (seen[next] === 1 || probabilities[next] < PROBABILITY_THRESHOLD) continue

        seen[next] = 1
        pending[depth] = next
        depth += 1
      }
    }

    if (total / count < REGION_THRESHOLD) continue

    const boxWidth = maxX - minX + 1
    const boxHeight = maxY - minY + 1
    if (Math.min(boxWidth, boxHeight) < MIN_BOX_SIDE) continue

    const offset = unclipOffset(boxWidth, boxHeight)
    boxes.push({
      left: Math.max(0, Math.round((minX - offset) * scaleX)),
      top: Math.max(0, Math.round((minY - offset) * scaleY)),
      right: Math.round((maxX + offset) * scaleX),
      bottom: Math.round((maxY + offset) * scaleY),
    })
  }

  return boxes
}

/** A box clamped to the photo it came from, and never empty. */
function within(box: Box, pixels: Pixels): Box {
  const left = Math.max(0, Math.min(box.left, pixels.width - 1))
  const top = Math.max(0, Math.min(box.top, pixels.height - 1))

  return {
    left,
    top,
    right: left + Math.max(1, Math.min(box.right - left, pixels.width - left)),
    bottom: top + Math.max(1, Math.min(box.bottom - top, pixels.height - top)),
  }
}

/**
 * One box as the recogniser's 48×320 strip: planar RGB scaled to ±1, the
 * crop stretched to the full height and the rest of the width left at zero.
 *
 * Sampled point by point out of the photo's own pixels rather than through a
 * second canvas draw per box. Twenty-odd boxes a photo is twenty-odd draws,
 * and on the capture photos that cost more than both models put together.
 */
export function recognitionInput(pixels: Pixels, box: Box): Float32Array {
  const crop = within(box, pixels)
  const cropWidth = crop.right - crop.left
  const cropHeight = crop.bottom - crop.top
  const scaled = Math.min(
    LINE_WIDTH,
    Math.max(1, Math.round((cropWidth / cropHeight) * LINE_HEIGHT)),
  )

  const area = LINE_HEIGHT * LINE_WIDTH
  const planes = new Float32Array(3 * area)

  for (let y = 0; y < LINE_HEIGHT; y += 1) {
    const sourceY = Math.min(
      pixels.height - 1,
      crop.top + Math.floor(((y + 0.5) * cropHeight) / LINE_HEIGHT),
    )
    for (let x = 0; x < scaled; x += 1) {
      const sourceX = Math.min(
        pixels.width - 1,
        crop.left + Math.floor(((x + 0.5) * cropWidth) / scaled),
      )
      const from = (sourceY * pixels.width + sourceX) * CHANNELS
      for (let channel = 0; channel < 3; channel += 1) {
        planes[channel * area + y * LINE_WIDTH + x] = pixels.data[from + channel] / 127.5 - 1
      }
    }
  }

  return planes
}

/** How many floats one strip takes, so a batch of them can be written into
 * one buffer. */
export const LINE_FLOATS = 3 * LINE_HEIGHT * LINE_WIDTH

/** The dimensions this many strips are handed to the recogniser in. */
export function recognitionDimensions(lines: number): ReadonlyArray<number> {
  return [lines, 3, LINE_HEIGHT, LINE_WIDTH]
}

/**
 * One strip's logits as a word, by greedy CTC: take the likeliest class at
 * each step, drop the blank, drop a repeat of the class before it.
 *
 * Class 0 is CTC's blank, so class `n` is `alphabet[n - 1]` — the off-by-one
 * is the blank, and getting it wrong shifts every character by one letter.
 */
export function decodeLine(
  logits: ArrayLike<number>,
  steps: number,
  classes: number,
  alphabet: ReadonlyArray<string>,
) {
  let text = ''
  let previous = -1
  let total = 0
  let count = 0

  for (let step = 0; step < steps; step += 1) {
    let best = 0
    let bestScore = -Infinity
    for (let index = 0; index < classes; index += 1) {
      const score = logits[step * classes + index]
      if (score > bestScore) {
        bestScore = score
        best = index
      }
    }

    if (best !== 0 && best !== previous) {
      text += alphabet[best - 1] ?? ''
      total += bestScore
      count += 1
    }
    previous = best
  }

  return { text: text.trim(), confidence: count === 0 ? 0 : total / count }
}

/**
 * The recogniser's alphabet, out of the `inference.yml` it ships beside its
 * weights.
 *
 * Read with a reader of its own rather than a YAML dependency, because the
 * shape being read is one flat list of one-character scalars and a parser for
 * the rest of YAML would be 40 kB in the app-shell budget for nothing. What
 * it does have to get right is quoting: every digit and every piece of
 * punctuation in that file is single-quoted, so a reader that takes the line
 * as written puts the three characters `'4'` in the alphabet where the model
 * meant one — and then reads a distance of 4559 as `'4''5''5''9'`.
 */
export function alphabetFrom(document: string): ReadonlyArray<string> {
  const lines = document.split('\n')
  const start = lines.findIndex((line) => line.trim().startsWith('character_dict:'))
  if (start === -1) return []

  const alphabet: string[] = []
  for (const line of lines.slice(start + 1)) {
    // The list ends at the first line that is not one of its items. A blank
    // line is not an item either: YAML allows one inside a block, but this
    // file has none, and treating one as a character would silently shift
    // every class after it.
    if (!line.startsWith('  - ')) break
    alphabet.push(unquote(line.slice(4)))
  }

  return alphabet
}

/**
 * One YAML scalar as the character it denotes. Single quotes escape by
 * doubling, double quotes by backslash; anything unquoted is itself. Only
 * the escapes this file actually uses are handled — a `\u` escape would come
 * back as `u`, which is why the spec pins what the shipped file contains.
 */
function unquote(scalar: string): string {
  if (scalar.startsWith("'") && scalar.endsWith("'") && scalar.length >= 2)
    return scalar.slice(1, -1).replaceAll("''", "'")

  if (scalar.startsWith('"') && scalar.endsWith('"') && scalar.length >= 2)
    return scalar.slice(1, -1).replaceAll(/\\(.)/gu, '$1')

  return scalar
}
