import { describe, expect, it, vi } from 'vitest'
import type { CachedFile, ModelCacheStore } from '@/lib/modelCache'
import { listCachedDownloads, removeCachedDownload } from '@/lib/modelCache'

/**
 * The platform edge, and one of the places where a unit spec is allowed a
 * test double (docs/functional-core.md): there is no Cache API in a Node
 * runner, and a fake `caches` global asserted into place would grade the
 * fake. The double implements `ModelCacheStore` exactly — the same
 * seam-not-mock argument as `monitorPhotoModel.spec.ts`.
 *
 * What is graded is the reading: many files becoming one row per repository,
 * the totals under it, the order they are offered for deletion in, and which
 * URLs a removal actually names. Getting that last one wrong deletes another
 * model's weights, which is the failure this file exists for.
 */

/** The shape `@huggingface/transformers` writes: one entry per file, keyed by
 * the URL it was fetched from. */
const file = (id: string, name: string, bytes: number): CachedFile => ({
  url: `https://huggingface.co/${id}/resolve/main/${name}`,
  bytes,
})

/** The other shape in the same cache: the ONNX runtime, served off a CDN by
 * version, which `env.backends.onnx.wasm.wasmPaths` points at. */
const runtimeFile = (name: string, bytes: number): CachedFile => ({
  url: `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/${name}`,
  bytes,
})

const FLORENCE = 'onnx-community/Florence-2-base-ft'
const SMOL = 'HuggingFaceTB/SmolVLM-500M-Instruct'
const RUNTIME = 'onnxruntime-web'

/** A store holding exactly these files, remembering what it was asked to
 * drop. */
class FakeStore implements ModelCacheStore {
  removed: ReadonlyArray<string> = []

  constructor(private cached: ReadonlyArray<CachedFile> = []) {}

  readonly files = vi.fn(async (): Promise<ReadonlyArray<CachedFile>> => this.cached)

  readonly remove = vi.fn(async (urls: ReadonlyArray<string>): Promise<boolean> => {
    this.removed = urls
    this.cached = this.cached.filter((entry) => !urls.includes(entry.url))

    return true
  })
}

describe('listCachedDownloads', () => {
  it('folds a repository’s files into one row', async () => {
    const store = new FakeStore([
      file(FLORENCE, 'onnx/vision_encoder_quantized.onnx', 89_000_000),
      file(FLORENCE, 'onnx/decoder_model_merged_q4.onnx', 61_000_000),
      file(FLORENCE, 'tokenizer.json', 2_300_000),
    ])

    // Three files, one thing a user recognises — and the total is what they
    // came to the screen for.
    await expect(listCachedDownloads(store)).resolves.toEqual([
      { id: FLORENCE, files: 3, bytes: 152_300_000 },
    ])
  })

  it('offers the biggest first, which is the one worth removing', async () => {
    const store = new FakeStore([
      file(SMOL, 'onnx/model_q8.onnx', 10),
      file(FLORENCE, 'onnx/vision_encoder_quantized.onnx', 90),
    ])

    expect((await listCachedDownloads(store)).map((model) => model.id)).toEqual([FLORENCE, SMOL])
  })

  it('keeps two repositories apart', async () => {
    const store = new FakeStore([file(FLORENCE, 'config.json', 5), file(SMOL, 'config.json', 5)])

    expect(await listCachedDownloads(store)).toHaveLength(2)
  })

  it('reads the repository out of the URL, not the revision or the path', async () => {
    const store = new FakeStore([
      {
        url: `https://huggingface.co/${FLORENCE}/resolve/refs%2Fpr%2F1/onnx/deep/file.onnx`,
        bytes: 7,
      },
    ])

    expect((await listCachedDownloads(store))[0]?.id).toBe(FLORENCE)
  })

  it('lists the runtime the models execute on, not only the weights', async () => {
    // It lands in the same cache, it is megabytes nobody chose to store, and
    // a screen that hides it reports a smaller device than the real one.
    const store = new FakeStore([
      file(FLORENCE, 'config.json', 5),
      runtimeFile('ort-wasm-simd-threaded.asyncify.wasm', 20_000_000),
      runtimeFile('ort-wasm-simd-threaded.asyncify.mjs', 500_000),
    ])

    await expect(listCachedDownloads(store)).resolves.toEqual([
      { id: RUNTIME, files: 2, bytes: 20_500_000 },
      { id: FLORENCE, files: 1, bytes: 5 },
    ])
  })

  it('keeps a scoped package whole', async () => {
    const store = new FakeStore([
      { url: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/x.mjs', bytes: 9 },
    ])

    expect((await listCachedDownloads(store))[0]?.id).toBe('@huggingface/transformers')
  })

  it('leaves out an entry that reads as neither', async () => {
    // Nothing writes one today. Filing it under an invented name would put a
    // row in a list of things to delete that nobody can account for.
    const store = new FakeStore([
      { url: 'https://example.com/not-a-model.bin', bytes: 10 },
      file(FLORENCE, 'config.json', 5),
    ])

    await expect(listCachedDownloads(store)).resolves.toEqual([
      { id: FLORENCE, files: 1, bytes: 5 },
    ])
  })

  it('is an empty list when nothing is cached', async () => {
    await expect(listCachedDownloads(new FakeStore())).resolves.toEqual([])
  })

  it('is an empty list rather than a throw when the cache cannot be read', async () => {
    // A browser with no Cache API and a browser with an empty one are the
    // same empty section to a screen that has to render either way.
    const store = new FakeStore()
    store.files.mockRejectedValueOnce(new Error('no storage'))

    await expect(listCachedDownloads(store)).resolves.toEqual([])
  })
})

describe('removeCachedDownload', () => {
  it('names every file of that model and nothing else', async () => {
    const store = new FakeStore([
      file(FLORENCE, 'onnx/vision_encoder_quantized.onnx', 89),
      file(FLORENCE, 'config.json', 5),
      file(SMOL, 'onnx/model_q8.onnx', 10),
    ])

    await expect(removeCachedDownload(FLORENCE, store)).resolves.toBe(true)
    expect(store.removed).toEqual([
      `https://huggingface.co/${FLORENCE}/resolve/main/onnx/vision_encoder_quantized.onnx`,
      `https://huggingface.co/${FLORENCE}/resolve/main/config.json`,
    ])
  })

  it('leaves the other model on the device', async () => {
    const store = new FakeStore([file(FLORENCE, 'config.json', 5), file(SMOL, 'config.json', 10)])

    await removeCachedDownload(FLORENCE, store)

    await expect(listCachedDownloads(store)).resolves.toEqual([{ id: SMOL, files: 1, bytes: 10 }])
  })

  it('says so when there was nothing of that model to remove', async () => {
    const store = new FakeStore([file(SMOL, 'config.json', 10)])

    await expect(removeCachedDownload(FLORENCE, store)).resolves.toBe(false)
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('says so when the cache refuses the delete', async () => {
    const store = new FakeStore([file(FLORENCE, 'config.json', 5)])
    store.remove.mockResolvedValueOnce(false)

    await expect(removeCachedDownload(FLORENCE, store)).resolves.toBe(false)
  })

  it('leaves the runtime behind when only a model is removed', async () => {
    // The runtime is shared: another model would use the same one, and
    // taking it out from under the row the user did not press is not what
    // "remove this model" says.
    const store = new FakeStore([
      file(FLORENCE, 'config.json', 5),
      runtimeFile('ort-wasm-simd-threaded.asyncify.wasm', 20),
    ])

    await removeCachedDownload(FLORENCE, store)

    await expect(listCachedDownloads(store)).resolves.toEqual([
      { id: RUNTIME, files: 1, bytes: 20 },
    ])
  })

  it('says so rather than throwing when reading the cache fails', async () => {
    const store = new FakeStore()
    store.files.mockRejectedValueOnce(new Error('no storage'))

    await expect(removeCachedDownload(FLORENCE, store)).resolves.toBe(false)
  })
})
