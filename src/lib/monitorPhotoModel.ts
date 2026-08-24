/**
 * The vision model that reads a monitor photo — and nothing above it.
 *
 * Platform edge: plain async TypeScript, try/catch, no Effect, no domain
 * content (docs/functional-core.md). What the reply *means* is decided in
 * `features/training/monitorPhoto.ts`; this module only loads the model,
 * shows it the photo, and hands back what it said, word for word. The model
 * runs entirely in the browser via `@huggingface/transformers` (ONNX
 * Runtime), so the photo never leaves the device — the same local-first line
 * the rest of the app holds. The one network cost is the model download
 * itself, on first use, cached by the library in the browser's Cache API.
 *
 * The import is dynamic and this module is only ever loaded lazily: the
 * runtime is megabytes (the `ai` chunk in vite.config.ts) and a rower who
 * types their numbers in should never pay for it.
 *
 * The backends seam is this module's `BluetoothLike`: the injectable slice a
 * spec implements exactly, so the singleton, the WebGPU→WASM fallback and
 * the never-throws contract are graded without half a gigabyte of weights.
 * Failures of any kind end as `null` rather than a thrown error, because the
 * UI's only move is the same either way: "that photo did not read, type it
 * in".
 */

/**
 * An OCR model, not a chat model — the whole reason the feature works.
 * Florence-2 is asked for a *task token* (`<OCR_WITH_REGION>`) and answers
 * with every line it can read and the box it sat in; it has no instruction
 * following to get wrong. Its predecessor here, `SmolVLM-500M-Instruct`,
 * was asked to fill in a JSON template and answered by copying the template
 * back verbatim on every photo tried.
 *
 * It is also the faster model: about a second a photo against seven. The
 * download is ~215 MB on the WASM path and ~360 MB on WebGPU, where half
 * precision costs bytes to buy speed — against SmolVLM's ~500 MB for a
 * reading that never once came out right.
 *
 * Exported because the settings screen lists what this app has downloaded
 * and has to say which row is this one. A repository id copied over there
 * would be a second copy that can go stale into a *wrong* label — naming a
 * model the device no longer holds.
 */
export const MODEL_ID = 'onnx-community/Florence-2-base-ft'

/**
 * Per-submodel weights, from the transformers.js Florence-2 demo. The
 * encoder and decoder quantise to 4-bit without costing a digit; the vision
 * tower is where the reading actually happens, so it keeps 8-bit (WASM) or
 * half precision (WebGPU, where fp16 has hardware to be fast on).
 */
const DTYPES = {
  webgpu: {
    embed_tokens: 'fp16',
    vision_encoder: 'fp16',
    encoder_model: 'q4',
    decoder_model_merged: 'q4',
  },
  wasm: {
    embed_tokens: 'q8',
    vision_encoder: 'q8',
    encoder_model: 'q4',
    decoder_model_merged: 'q4',
  },
} as const

/** A PM5 screen holds a few dozen short lines, each carrying four boxed
 * corners; a reply longer than this was not a monitor. */
const MAX_NEW_TOKENS = 400

/**
 * How far along a scan is, as a bar can draw it.
 *
 * Two phases rather than one, because they are different quantities that
 * happen to share a bar: bytes off the network, then tokens out of the
 * model. A union rather than a bag of optionals, so the download's byte
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

/** One file of the model, as far as the runtime has fetched it. Bytes rather
 * than a percentage: several files download at once and only the totals add
 * up to one bar. */
export interface MonitorPhotoDownload {
  readonly file: string
  readonly loaded: number
  readonly total: number
}

/**
 * A loaded engine: one photo and one task token in, the model's reply out.
 * `onStep` fires once per generated token with the budget it is counting
 * against, so a caller can draw the reading half of the bar.
 */
export type MonitorPhotoEngine = (
  photo: Blob,
  task: string,
  onStep?: (produced: number, budget: number) => void,
) => Promise<string>

/**
 * Where engines come from. Exported so a spec can implement it exactly
 * rather than assert a stand-in into place — the same argument as
 * `ErgCharacteristic` in `ergBluetooth.ts`.
 */
export interface MonitorPhotoBackends {
  /** Whether this browser offers WebGPU at all. False on older Safari. */
  hasWebGpu(): boolean
  /** Loads the model on one backend; rejects when that backend cannot.
   * `onDownload` fires as each file of the model arrives. */
  load(
    device: 'webgpu' | 'wasm',
    onDownload: (file: MonitorPhotoDownload) => void,
  ): Promise<MonitorPhotoEngine>
}

async function loadTransformers(
  device: 'webgpu' | 'wasm',
  onDownload: (file: MonitorPhotoDownload) => void,
): Promise<MonitorPhotoEngine> {
  const transformers = await import('@huggingface/transformers')
  // Only `progress` carries bytes. The surrounding `initiate` / `done` /
  // `ready` events say which file and when, which the aggregate above
  // already infers from the numbers themselves. A file served from the
  // browser's cache reports nothing at all — correctly, since there is
  // nothing to wait for.
  const progress_callback = (info: import('@huggingface/transformers').ProgressInfo): void => {
    if (info.status === 'progress')
      onDownload({ file: info.file, loaded: info.loaded, total: info.total })
  }

  const [model, processor] = await Promise.all([
    transformers.Florence2ForConditionalGeneration.from_pretrained(MODEL_ID, {
      device,
      dtype: DTYPES[device],
      progress_callback,
    }),
    // Named rather than `AutoProcessor`, because `construct_prompts` is
    // Florence-2's own.
    // SAFETY: `from_pretrained` is a static inherited from the base
    // `Processor` and declared as returning one, so the subclass named on
    // this very line is missing from its return type. The value is whatever
    // `Florence2Processor` constructs; only the library's typing of the
    // static is wrong.
    transformers.Florence2Processor.from_pretrained(MODEL_ID, { progress_callback }) as Promise<
      InstanceType<typeof transformers.Florence2Processor>
    >,
  ])

  // The processor's own tokenizer, not a second `AutoTokenizer.from_pretrained`
  // of the same repo. Two loads would fetch and parse the same 2 MB twice —
  // and, worse for the bar, report `progress` for the same *filenames* from
  // two interleaved streams, so the aggregate would see one file's bytes
  // overwrite the other's and run backwards for a reason nothing explains.
  // Declared optional because `Processor` has components a Florence-2 one
  // always has; a build without it is a library change, not a bad photo.
  const { tokenizer } = processor
  if (tokenizer === undefined) throw new Error('processor carries no tokenizer')

  return async (photo, task, onStep) => {
    const image = await transformers.RawImage.fromBlob(photo)
    // `construct_prompts` expands the bare task token into the sentence the
    // weights were trained on; the processor turns the photo into the vision
    // features the same call expects alongside it.
    const inputs = {
      ...tokenizer(processor.construct_prompts(task)),
      ...(await processor(image)),
    }

    // `generate` hands the streamer the prompt once and then one token per
    // step, so the tokens produced run one behind the calls. Counting steps
    // is the only progress a generation can honestly report: the budget is a
    // ceiling the reply usually stops well short of, so the bar reaches the
    // end by finishing rather than by filling.
    let calls = 0
    const streamer = new (class extends transformers.BaseStreamer {
      override put(): void {
        calls += 1
        onStep?.(calls - 1, MAX_NEW_TOKENS)
      }

      // `BaseStreamer` is abstract by throwing: every method it declares
      // raises `Not implemented` until a subclass replaces it, `end` very
      // much included — `generate` calls it once the reply is complete, so
      // leaving it would fail every scan at the finish line.
      override end(): void {}
    })()

    const output = await model.generate({
      ...inputs,
      max_new_tokens: MAX_NEW_TOKENS,
      do_sample: false,
      streamer,
    })
    // `generate` only returns the dict shape when asked to via
    // `return_dict_in_generate`; this call does not ask, so anything else
    // arriving is a library change worth surfacing as a failed scan.
    if (!(output instanceof transformers.Tensor)) throw new Error('generate returned no tensor')

    // Decoded *with* the special tokens: the `<loc_…>` corners that say where
    // each line sat are special tokens, and the parser cannot tell a metre
    // count from a `/500m` label without them.
    return tokenizer.batch_decode(output, { skip_special_tokens: false })[0] ?? ''
  }
}

const browserBackends: MonitorPhotoBackends = {
  hasWebGpu: () => 'gpu' in navigator,
  load: loadTransformers,
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
 * starts, and over in the first second or so, since the four weight files
 * are fetched together.
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
 * Shows the photo to the model under the given task and returns the reply
 * text, or `null` when anything on the way failed.
 *
 * `onProgress` narrates both halves of the wait, which differ by orders of
 * magnitude: the first-use download of a couple of hundred megabytes, then
 * the read itself. The phase on each update is what tells them apart — there
 * is no separate "ready" signal, because the first `reading` update is one.
 */
export async function readMonitorPhoto(
  photo: Blob,
  task: string,
  onProgress?: (progress: MonitorPhotoProgress) => void,
  backends: MonitorPhotoBackends = browserBackends,
): Promise<string | null> {
  try {
    // Keyed by file, so a file the runtime restarts or reports twice counts
    // once rather than inflating the total.
    const downloads = new Map<string, MonitorPhotoDownload>()
    const engine = await engineFor(backends, (file) => {
      downloads.set(file.file, file)
      onProgress?.(downloadProgress(downloads.values()))
    })
    onProgress?.({ phase: 'reading', ratio: 0 })

    return await engine(photo, task, (produced, budget) => {
      onProgress?.({ phase: 'reading', ratio: Math.min(produced / budget, 1) })
    })
  } catch (error) {
    console.debug('monitorPhotoModel: reading the photo failed', error)
    return null
  }
}
