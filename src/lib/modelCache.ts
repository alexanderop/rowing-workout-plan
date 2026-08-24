/**
 * What the on-device models are taking up, and getting rid of one.
 *
 * Platform edge: plain async TypeScript, try/catch, no Effect, no domain
 * content (docs/functional-core.md). The weights behind the photo scan are
 * hundreds of megabytes, they arrive without anyone choosing to install
 * them, and they never leave on their own — so the one screen that says how
 * much of the device this app is using has to be able to say *this* too, and
 * to hand it back.
 *
 * Nothing here knows what any of it is *for*. It reads the cache
 * `@huggingface/transformers` writes, groups the files by where they came
 * from — a model repository, or the npm package the ONNX runtime is served
 * from — and deletes them on request. Saying which feature stops working
 * without one is the settings screen's job.
 *
 * Deliberately does not import the library to learn the cache's name: that
 * import is the megabytes the whole feature is lazy about, and pulling it
 * into the settings screen to read one constant would undo that. The name is
 * copied below instead, with the failure mode that implies.
 *
 * The store seam is this module's `MonitorPhotoBackends`: the injectable
 * slice a spec implements exactly, so the grouping and the totals are graded
 * without a Cache API.
 */

/**
 * `env.cacheKey` in `@huggingface/transformers` — the Cache API bucket every
 * weight file is written to in a browser.
 *
 * Copied rather than imported, for the reason above. If upstream renames it,
 * this screen lists nothing: it cannot show the wrong size or delete the
 * wrong file, it can only go blank, which is the failure worth having.
 */
const MODEL_CACHE_NAME = 'transformers-cache'

/** One cached file: the URL it was fetched from, and how much room it takes. */
export interface CachedFile {
  readonly url: string
  readonly bytes: number
}

/**
 * One thing the on-device AI has downloaded, as the settings screen lists
 * it. Usually a model; sometimes the runtime the models execute on, which
 * the library fetches into the same cache and which is just as much a few
 * megabytes nobody chose to store.
 */
export interface CachedDownload {
  /** Where it came from — a repository, `onnx-community/Florence-2-base-ft`,
   * or an npm package, `onnxruntime-web`. */
  readonly id: string
  /** How many of its files are cached; neither a model nor a runtime is one. */
  readonly files: number
  readonly bytes: number
}

/**
 * Where cached files come from. Exported so a spec can implement it exactly
 * rather than stub a browser global — the same argument as
 * `MonitorPhotoBackends` in `monitorPhotoModel.ts`.
 */
export interface ModelCacheStore {
  /** Every file in the cache. Empty when there is no cache to read. */
  files(): Promise<ReadonlyArray<CachedFile>>
  /** Drops these URLs. Resolves `true` when the cache took the request. */
  remove(urls: ReadonlyArray<string>): Promise<boolean>
}

/**
 * The repository a Hugging Face file URL belongs to: the two path segments
 * before `/resolve/`, which is the shape `env.remotePathTemplate` builds.
 */
const MODEL_FILE_URL = /^https?:\/\/[^/]+\/(?<id>[^/]+\/[^/]+)\/resolve\//u

/**
 * The npm package a CDN file URL serves, scope included:
 * `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/ort.wasm` →
 * `onnxruntime-web`.
 *
 * Not a model, and not a mistake either — `env.backends.onnx.wasm.wasmPaths`
 * points at a CDN, so the ONNX runtime lands in the same cache as the
 * weights. Listing only the weights would show a smaller number than the
 * device is actually carrying, and removing only the weights would leave
 * megabytes behind that nothing else ever cleans up.
 */
const PACKAGE_FILE_URL = /^https?:\/\/[^/]+\/npm\/(?<id>@?[^@/]+(?:\/[^@/]+)?)@/u

function downloadIdFrom(url: string): string | undefined {
  return (MODEL_FILE_URL.exec(url) ?? PACKAGE_FILE_URL.exec(url))?.groups?.id
}

/**
 * The cached files as downloads, biggest first — the order they would be
 * removed in.
 *
 * A file whose URL reads as neither is left out rather than filed under an
 * invented name. Nothing writes such an entry today; if something starts to,
 * an unexplained row in a list of things to delete is worse than a missing
 * one.
 */
function downloadsFrom(files: ReadonlyArray<CachedFile>): ReadonlyArray<CachedDownload> {
  const totals = new Map<string, { files: number; bytes: number }>()

  for (const file of files) {
    const id = downloadIdFrom(file.url)
    if (id === undefined) continue

    const running = totals.get(id) ?? { files: 0, bytes: 0 }
    totals.set(id, { files: running.files + 1, bytes: running.bytes + file.bytes })
  }

  return [...totals]
    .map(([id, running]) => ({ id, files: running.files, bytes: running.bytes }))
    .sort((first, second) => second.bytes - first.bytes)
}

/** The bucket itself, or `undefined` where the browser has no Cache API — an
 * old Safari, or any non-secure context. */
async function openModelCache(): Promise<Cache | undefined> {
  if (!('caches' in globalThis)) return undefined

  try {
    return await globalThis.caches.open(MODEL_CACHE_NAME)
  } catch (error) {
    console.debug('modelCache: the model cache could not be opened', error)
    return undefined
  }
}

/**
 * How much room one entry takes. `content-length` is set by the library on
 * every response it writes, so the body is only ever read when something
 * else put the entry there — worth the memory once, since a model shown as
 * taking no space is a model nobody will think to remove.
 */
async function bytesOf(cache: Cache, request: Request): Promise<number> {
  const response = await cache.match(request)
  if (response === undefined) return 0

  const declared = Number(response.headers.get('content-length'))
  return Number.isFinite(declared) && declared > 0 ? declared : (await response.blob()).size
}

const browserStore: ModelCacheStore = {
  async files() {
    const cache = await openModelCache()
    if (cache === undefined) return []

    const requests = await cache.keys()
    return Promise.all(
      requests.map(async (request) => ({ url: request.url, bytes: await bytesOf(cache, request) })),
    )
  },

  async remove(urls) {
    const cache = await openModelCache()
    if (cache === undefined) return false

    await Promise.all(urls.map((url) => cache.delete(url)))
    return true
  },
}

/**
 * Everything the on-device AI has put on this device, biggest first. Never
 * throws: a browser with no Cache API and a browser with an empty one are
 * the same empty list to a screen that has to render either way.
 */
export async function listCachedDownloads(
  store: ModelCacheStore = browserStore,
): Promise<ReadonlyArray<CachedDownload>> {
  try {
    return downloadsFrom(await store.files())
  } catch (error) {
    console.debug('modelCache: the cached downloads could not be listed', error)
    return []
  }
}

/**
 * Deletes every file of one download. `false` when nothing could be removed
 * — no cache, no such download, or the delete itself failed — which is the
 * one distinction the screen makes: it either says the space is back or says
 * it could not do it.
 *
 * Removing one is not data loss and asks for no confirmation. The next scan
 * downloads it again; what the user gets back is disk, and what it costs
 * them is one more wait they have already been shown the length of.
 */
export async function removeCachedDownload(
  id: string,
  store: ModelCacheStore = browserStore,
): Promise<boolean> {
  try {
    const urls = (await store.files())
      .filter((file) => downloadIdFrom(file.url) === id)
      .map((file) => file.url)

    return urls.length > 0 && (await store.remove(urls))
  } catch (error) {
    console.debug('modelCache: the download could not be removed', error)
    return false
  }
}
