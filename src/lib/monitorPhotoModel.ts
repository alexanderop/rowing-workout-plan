/**
 * The text recogniser that reads a monitor photo — and nothing above it.
 *
 * Platform edge: plain async TypeScript, try/catch, no Effect, no domain
 * content (docs/functional-core.md). What the reading *means* is decided in
 * `features/training/monitorPhoto.ts`; the arithmetic that turns a photo
 * into tensors and tensors into words is `lib/ocr.ts`. This module owns the
 * three things neither of those may touch: the network the weights come off,
 * the cache they land in, and the ONNX sessions that run them. Everything
 * happens on the device, so the photo never leaves it — the same local-first
 * line the rest of the app holds. The one network cost is the weights
 * themselves, once.
 *
 * The import is dynamic and this module is only ever loaded lazily: the
 * runtime is megabytes (the `ai` chunk in vite.config.ts) and a rower who
 * types their numbers in should never pay for it.
 *
 * The backends seam is this module's `BluetoothLike`: the injectable slice a
 * spec implements exactly, so the singleton, the WebGPU→WASM fallback and
 * the never-throws contract are graded without a GPU. Failures of any kind
 * end as `null` rather than a thrown error, because the UI's only move is
 * the same either way: "that photo did not read, type it in".
 */
import {
  type Box,
  LINE_FLOATS,
  type OcrLine,
  type Pixels,
  alphabetFrom,
  boxesFrom,
  decodeLine,
  detectionInput,
  detectionSize,
  recognitionDimensions,
  recognitionInput,
} from './ocr'

/**
 * Two small convolutional models rather than one vision-language model:
 * PP-OCRv5 mobile's DBNet finds the text, its CRNN reads each box. Neither
 * generates tokens, which is why the pair answers in about a fifth of a
 * second on WebGPU and a third on the WASM fallback, against the 1.4 s and
 * 9.5 s Florence-2-base-ft cost here — off 21 MB of weights rather than 361.
 *
 * It also reads the split distance correctly. Florence rendered the `874` on
 * both capture photos as `87A`, on every backend and at every quantisation
 * tried, base and large alike.
 *
 * Exported because the settings screen lists what this app has downloaded
 * and has to say which rows are these. Repository ids copied over there
 * would be a second copy that can go stale into a *wrong* label — naming a
 * model the device no longer holds.
 */
const DETECTION_MODEL = 'PaddlePaddle/PP-OCRv5_mobile_det_onnx'
const RECOGNITION_MODEL = 'PaddlePaddle/PP-OCRv5_mobile_rec_onnx'

export const MONITOR_PHOTO_MODELS: ReadonlyArray<string> = [DETECTION_MODEL, RECOGNITION_MODEL]

/** Both repositories ship one graph under the same name, beside the
 * `inference.yml` that holds the recogniser's alphabet. */
const weightsUrl = (model: string): string =>
  `https://huggingface.co/${model}/resolve/main/inference.onnx`

const alphabetUrl = `https://huggingface.co/${RECOGNITION_MODEL}/resolve/main/inference.yml`

/**
 * Where the weights are kept between visits.
 *
 * Our own bucket, read by `lib/modelCache.ts` so the settings screen can
 * show what is stored and hand it back. The name is duplicated there rather
 * than imported, so that screen never pulls this module — and with it the
 * runtime — into the app shell. If one copy is renamed without the other,
 * the screen lists nothing: it cannot show the wrong size or delete the
 * wrong file, it can only go blank, which is the failure worth having.
 */
const CACHE_NAME = 'monitor-photo-models'

/**
 * The longest side the photo is kept at while boxes are cropped out of it.
 *
 * A phone camera hands over twelve megapixels, and holding those as RGBA is
 * fifty megabytes for the length of a scan. The recogniser sees 48-pixel
 * strips whatever it is given, so anything past this is memory spent on
 * detail that is thrown away in the resample — and the detector never sees
 * more than `DETECTION_LIMIT` in the first place.
 */
const SOURCE_LIMIT = 1600

/** How many line crops are recognised in one call. Eight is what the model's
 * own `trt_dynamic_shapes` names as its optimum batch, and on the capture
 * photos it takes the recognition half from 320 ms to 110 ms. */
const BATCH_SIZE = 8

/**
 * How far along a scan is, as a bar can draw it.
 *
 * Two phases rather than one, because they are different quantities that
 * happen to share a bar: bytes off the network, then boxes through the
 * recogniser. A union rather than a bag of optionals, so the download's byte
 * counts exist exactly where they mean something.
 *
 * `ratio` is 0–1, or `null` for an indeterminate bar — the download's state
 * until the first file answers with its size, which is a real thing to be
 * and not a rounding of zero. Spelled `null` rather than left off, so a
 * consumer reads one field and draws it, and the choice between a fraction
 * and a shrug is made here where it can be graded rather than in a template.
 */
export type MonitorPhotoProgress =
  | {
      readonly phase: 'loadingModel'
      readonly ratio: number | null
      readonly loadedBytes: number
      readonly totalBytes: number
    }
  | { readonly phase: 'reading'; readonly ratio: number }

/** One file of the models, as far as the runtime has fetched it. Bytes rather
 * than a percentage: several files download at once and only the totals add
 * up to one bar. */
export interface MonitorPhotoDownload {
  readonly file: string
  readonly loaded: number
  readonly total: number
}

/**
 * A loaded engine: one photo in, every line of text on it out. `onStep`
 * fires once per batch of boxes recognised, against the number of batches
 * this photo needs, so a caller can draw the reading half of the bar.
 */
export type MonitorPhotoEngine = (
  photo: Blob,
  onStep?: (done: number, batches: number) => void,
) => Promise<ReadonlyArray<OcrLine>>

/**
 * Where engines come from. Exported so a spec can implement it exactly
 * rather than assert a stand-in into place — the same argument as
 * `ErgCharacteristic` in `ergBluetooth.ts`.
 */
export interface MonitorPhotoBackends {
  /** Whether this browser offers WebGPU at all. False on older Safari. */
  hasWebGpu(): boolean
  /** Loads both models on one backend; rejects when that backend cannot.
   * `onDownload` fires as each file arrives. */
  load(
    device: 'webgpu' | 'wasm',
    onDownload: (file: MonitorPhotoDownload) => void,
  ): Promise<MonitorPhotoEngine>
}

/** The bucket, or `undefined` where the browser has no Cache API — an old
 * Safari, or any non-secure context. A scan still works there; it just pays
 * for the weights every time. */
async function openCache(): Promise<Cache | undefined> {
  if (!('caches' in globalThis)) return undefined

  try {
    return await globalThis.caches.open(CACHE_NAME)
  } catch (error) {
    console.debug('monitorPhotoModel: the model cache could not be opened', error)
    return undefined
  }
}

/**
 * One file, from the cache if it is there and off the network if it is not,
 * reporting bytes as they arrive.
 *
 * Read through a stream rather than `response.arrayBuffer()` because the
 * point of the bar is the sixteen megabyte file: a promise that resolves at
 * the end can only report nothing and then everything. A file served *from*
 * the cache reports nothing at all — correctly, since there is nothing to
 * wait for.
 *
 * `content-length` is stored with the copy, because that is what the
 * settings screen reads to say how much room it takes.
 */
async function fetchFile(
  url: string,
  onDownload: (file: MonitorPhotoDownload) => void,
): Promise<Uint8Array> {
  const cache = await openCache()
  const cached = await cache?.match(url)
  if (cached !== undefined) return new Uint8Array(await cached.arrayBuffer())

  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)

  const file = url.slice(url.lastIndexOf('/') + 1)
  // Absent on a chunked response, which reads as an indeterminate bar rather
  // than a total of zero the loaded bytes would then run past.
  const total = Number(response.headers.get('content-length') ?? 0)
  const reader = response.body?.getReader()
  if (reader === undefined) throw new Error(`${url} answered with no body`)

  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    loaded += value.length
    onDownload({ file, loaded, total })
  }

  const bytes = new Uint8Array(loaded)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }

  await cache?.put(
    url,
    new Response(bytes, { headers: { 'content-length': String(bytes.length) } }),
  )

  return bytes
}

/** The photo as pixels, at both the sizes a scan needs: what the detector is
 * shown, and what the crops are cut from. */
async function pixelsOf(photo: Blob): Promise<{ detection: Pixels; source: Pixels }> {
  const bitmap = await createImageBitmap(photo)
  try {
    return {
      detection: draw(bitmap, detectionSize(bitmap.width, bitmap.height)),
      source: draw(bitmap, detectionSize(bitmap.width, bitmap.height, SOURCE_LIMIT)),
    }
  } finally {
    // Held by the decoder until it is closed, and a phone photo is not small.
    bitmap.close()
  }
}

function draw(bitmap: ImageBitmap, size: { width: number; height: number }): Pixels {
  const canvas = new OffscreenCanvas(size.width, size.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) throw new Error('this browser has no 2d canvas')

  context.drawImage(bitmap, 0, 0, size.width, size.height)

  return context.getImageData(0, 0, size.width, size.height)
}

type Ort = typeof import('onnxruntime-web/webgpu')

/**
 * The runtime, and its WebAssembly with it.
 *
 * `env.wasm.wasmPaths` is deliberately left alone. The bundle build asks for
 * its binary through `new URL('….wasm', import.meta.url)`, which the
 * bundler rewrites to a hashed asset of our own — so it is already served
 * from this origin, already versioned, and already caught by the service
 * worker's `.wasm` rule, with no CDN to trust or to be offline without.
 *
 * Pointing that setting at a binary picked by hand is how this broke once:
 * the WebAssembly and the JavaScript glue that calls into it are built as a
 * pair, and the `webgpu` bundle carries the *asyncify* glue. Handed the
 * `jsep` binary instead, it loads, links, and fails on the first inference
 * with a missing export — a runtime error a build cannot catch.
 */
async function runtime(): Promise<Ort> {
  return import('onnxruntime-web/webgpu')
}

async function loadOnnx(
  device: 'webgpu' | 'wasm',
  onDownload: (file: MonitorPhotoDownload) => void,
): Promise<MonitorPhotoEngine> {
  const ort = await runtime()
  const options = { executionProviders: [device], graphOptimizationLevel: 'all' } as const

  const [detection, recognition, alphabet] = await Promise.all([
    fetchFile(weightsUrl(DETECTION_MODEL), onDownload).then((bytes) =>
      ort.InferenceSession.create(bytes, options),
    ),
    fetchFile(weightsUrl(RECOGNITION_MODEL), onDownload).then((bytes) =>
      ort.InferenceSession.create(bytes, options),
    ),
    fetchFile(alphabetUrl, onDownload).then((bytes) =>
      alphabetFrom(new TextDecoder().decode(bytes)),
    ),
  ])

  if (alphabet.length === 0) throw new Error('the recogniser shipped no alphabet')

  return async (photo, onStep) => {
    const { detection: shown, source } = await pixelsOf(photo)

    const map = await detection.run({
      [detection.inputNames[0]]: new ort.Tensor('float32', detectionInput(shown), [
        1,
        3,
        shown.height,
        shown.width,
      ]),
    })
    // SAFETY: the detector's one output is its probability map, declared
    // `float32` in the graph. `Tensor#data` is typed as the union of every
    // element type ONNX can carry, which no runtime check can narrow — a
    // model that answered anything else here would not be this model.
    const probabilities = map[detection.outputNames[0]].data as Float32Array

    const boxes = boxesFrom(
      probabilities,
      shown.width,
      shown.height,
      source.width / shown.width,
      source.height / shown.height,
    )

    return readBoxes(ort, recognition, alphabet, source, boxes, onStep)
  }
}

/** Every box, a batch at a time, as the lines they read. */
async function readBoxes(
  ort: Ort,
  recognition: import('onnxruntime-web/webgpu').InferenceSession,
  alphabet: ReadonlyArray<string>,
  source: Pixels,
  boxes: ReadonlyArray<Box>,
  onStep?: (done: number, batches: number) => void,
): Promise<ReadonlyArray<OcrLine>> {
  const batches = Math.ceil(boxes.length / BATCH_SIZE)
  const lines: OcrLine[] = []
  onStep?.(0, batches)

  for (let at = 0; at < boxes.length; at += BATCH_SIZE) {
    const batch = boxes.slice(at, at + BATCH_SIZE)
    const strips = new Float32Array(LINE_FLOATS * batch.length)
    batch.forEach((box, index) => strips.set(recognitionInput(source, box), index * LINE_FLOATS))

    const output = await recognition.run({
      [recognition.inputNames[0]]: new ort.Tensor(
        'float32',
        strips,
        recognitionDimensions(batch.length),
      ),
    })
    const logits = output[recognition.outputNames[0]]
    const [, steps, classes] = logits.dims
    // SAFETY: as above — the recogniser's one output is `float32` logits.
    const scores = logits.data as Float32Array

    batch.forEach((box, index) => {
      const from = index * steps * classes
      const { text, confidence } = decodeLine(
        scores.subarray(from, from + steps * classes),
        steps,
        classes,
        alphabet,
      )
      // A box the recogniser read nothing in is not a line. It carries no
      // digits, so nothing downstream would read it anyway, and an empty
      // string in a list of what the photo says is a lie about the photo.
      if (text !== '') lines.push({ ...box, text, confidence })
    })

    onStep?.(at / BATCH_SIZE + 1, batches)
  }

  return lines
}

const browserBackends: MonitorPhotoBackends = {
  hasWebGpu: () => 'gpu' in navigator,
  load: loadOnnx,
}

let enginePromise: Promise<MonitorPhotoEngine> | null = null

async function loadEngine(
  backends: MonitorPhotoBackends,
  onDownload: (file: MonitorPhotoDownload) => void,
): Promise<MonitorPhotoEngine> {
  if (backends.hasWebGpu()) {
    try {
      return await backends.load('webgpu', onDownload)
    } catch (error) {
      console.debug('monitorPhotoModel: webgpu load failed, falling back to wasm', error)
    }
  }

  return backends.load('wasm', onDownload)
}

/**
 * One engine per session. A failed load clears the slot so the next scan
 * retries instead of replaying the same rejection forever.
 *
 * Only the scan that *starts* a load hears its download: the slot holds a
 * promise, not a listener list, so a second scan arriving mid-load waits on
 * a bar it cannot see fill. That is a state the UI does not have — the scan
 * button is disabled for the length of a scan — and a listener registry to
 * cover it would be state kept for nobody.
 */
async function engineFor(
  backends: MonitorPhotoBackends,
  onDownload: (file: MonitorPhotoDownload) => void,
): Promise<MonitorPhotoEngine> {
  try {
    enginePromise ??= loadEngine(backends, onDownload)
    return await enginePromise
  } catch (error) {
    enginePromise = null
    throw error
  }
}

/**
 * Every file the load has started, as one bar. The total *grows* as files
 * announce their size, so a ratio taken early can fall as a bigger file
 * joins — the honest shape of a download whose size is not known until it
 * starts, and over in the first second or so, since the three files are
 * fetched together.
 */
function downloadProgress(files: Iterable<MonitorPhotoDownload>): MonitorPhotoProgress {
  let loadedBytes = 0
  let totalBytes = 0
  for (const file of files) {
    loadedBytes += file.loaded
    totalBytes += file.total
  }

  // Indeterminate until something has a size, rather than `0` — zero would
  // be a claim about a total nobody knows yet.
  if (totalBytes === 0) return { phase: 'loadingModel', loadedBytes, totalBytes, ratio: null }

  return {
    phase: 'loadingModel',
    loadedBytes,
    totalBytes,
    ratio: Math.min(loadedBytes / totalBytes, 1),
  }
}

/**
 * Every line of text on the photo, or `null` when anything on the way
 * failed.
 *
 * `onProgress` narrates both halves of the wait, which differ by orders of
 * magnitude: the first-use download of twenty-odd megabytes, then the read
 * itself. The phase on each update is what tells them apart — there is no
 * separate "ready" signal, because the first `reading` update is one.
 */
export async function readMonitorPhoto(
  photo: Blob,
  onProgress?: (progress: MonitorPhotoProgress) => void,
  backends: MonitorPhotoBackends = browserBackends,
): Promise<ReadonlyArray<OcrLine> | null> {
  try {
    // Keyed by file, so a file the runtime restarts or reports twice counts
    // once rather than inflating the total.
    const downloads = new Map<string, MonitorPhotoDownload>()
    const engine = await engineFor(backends, (file) => {
      downloads.set(file.file, file)
      onProgress?.(downloadProgress(downloads.values()))
    })
    onProgress?.({ phase: 'reading', ratio: 0 })

    return await engine(photo, (done, batches) => {
      // A photo the detector found no text on has no batches to count. The
      // bar is finished rather than dividing by zero.
      onProgress?.({ phase: 'reading', ratio: batches === 0 ? 1 : Math.min(done / batches, 1) })
    })
  } catch (error) {
    console.debug('monitorPhotoModel: reading the photo failed', error)
    return null
  }
}
