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
 * The smallest SmolVLM that still reads LCD digits usefully. A bigger model
 * transcribes better but multiplies a download every phone has to make; if
 * scans misread in practice, `SmolVLM-Instruct` (2.2B) is the next step up
 * and this constant is the whole change.
 */
const MODEL_ID = 'HuggingFaceTB/SmolVLM-500M-Instruct'

/** Plenty for one JSON object; a model that rambles past this was not going
 * to say anything parseable anyway. */
const MAX_NEW_TOKENS = 160

/** A loaded engine: one photo and one prompt in, the model's reply out. */
export type MonitorPhotoEngine = (photo: Blob, prompt: string) => Promise<string>

/**
 * Where engines come from. Exported so a spec can implement it exactly
 * rather than assert a stand-in into place — the same argument as
 * `ErgCharacteristic` in `ergBluetooth.ts`.
 */
export interface MonitorPhotoBackends {
  /** Whether this browser offers WebGPU at all. False on older Safari. */
  hasWebGpu(): boolean
  /** Loads the model on one backend; rejects when that backend cannot. */
  load(device: 'webgpu' | 'wasm'): Promise<MonitorPhotoEngine>
}

async function loadTransformers(device: 'webgpu' | 'wasm'): Promise<MonitorPhotoEngine> {
  const transformers = await import('@huggingface/transformers')
  const processor = await transformers.AutoProcessor.from_pretrained(MODEL_ID)
  // Half precision on the GPU to halve the download; 8-bit weights on WASM,
  // where fp16 has no hardware to be fast on.
  const model = await transformers.AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
    device,
    dtype: device === 'webgpu' ? 'fp16' : 'q8',
  })

  return async (photo, prompt) => {
    const messages = [
      { role: 'user', content: [{ type: 'image' }, { type: 'text', text: prompt }] },
    ]
    const text = processor.apply_chat_template(messages, { add_generation_prompt: true })
    const image = await transformers.RawImage.fromBlob(photo)
    const inputs = await processor(text, [image])

    const output = await model.generate({
      ...inputs,
      max_new_tokens: MAX_NEW_TOKENS,
      do_sample: false,
    })
    // `generate` only returns the dict shape when asked to via
    // `return_dict_in_generate`; this call does not ask, so anything else
    // arriving is a library change worth surfacing as a failed scan.
    if (!(output instanceof transformers.Tensor)) throw new Error('generate returned no tensor')

    // Everything before the reply is the prompt echoed back; slice it off so
    // the parser only ever sees what the model added.
    const promptLength = inputs.input_ids.dims.at(-1)
    const decoded = processor.batch_decode(output.slice(null, [promptLength, null]), {
      skip_special_tokens: true,
    })

    return decoded[0] ?? ''
  }
}

const browserBackends: MonitorPhotoBackends = {
  hasWebGpu: () => 'gpu' in navigator,
  load: loadTransformers,
}

let enginePromise: Promise<MonitorPhotoEngine> | null = null

async function loadEngine(backends: MonitorPhotoBackends): Promise<MonitorPhotoEngine> {
  if (backends.hasWebGpu()) {
    try {
      return await backends.load('webgpu')
    } catch (error) {
      console.debug('monitorPhotoModel: webgpu load failed, falling back to wasm', error)
    }
  }

  return backends.load('wasm')
}

/** One engine per session. A failed load clears the slot so the next scan
 * retries instead of replaying the same rejection forever. */
async function engineFor(backends: MonitorPhotoBackends): Promise<MonitorPhotoEngine> {
  try {
    enginePromise ??= loadEngine(backends)
    return await enginePromise
  } catch (error) {
    enginePromise = null
    throw error
  }
}

/**
 * Shows the photo to the model with the given prompt and returns the reply
 * text, or `null` when anything on the way failed. `onModelReady` fires once
 * the engine is loaded and the photo is about to be read, so a caller can
 * tell "downloading the model" (first use, minutes on a slow line) apart
 * from "reading the photo" (seconds).
 */
export async function readMonitorPhoto(
  photo: Blob,
  prompt: string,
  onModelReady?: () => void,
  backends: MonitorPhotoBackends = browserBackends,
): Promise<string | null> {
  try {
    const engine = await engineFor(backends)
    onModelReady?.()

    return await engine(photo, prompt)
  } catch (error) {
    console.debug('monitorPhotoModel: reading the photo failed', error)
    return null
  }
}
