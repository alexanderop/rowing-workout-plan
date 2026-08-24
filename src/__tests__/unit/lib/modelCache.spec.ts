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

const DETECTOR = 'PaddlePaddle/PP-OCRv5_mobile_det_onnx'
const RECOGNISER = 'PaddlePaddle/PP-OCRv5_mobile_rec_onnx'

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
      file(DETECTOR, 'inference.onnx', 89_000_000),
      file(DETECTOR, 'inference.yml', 61_000_000),
      file(DETECTOR, 'README.md', 2_300_000),
    ])

    // Three files, one thing a user recognises — and the total is what they
    // came to the screen for.
    await expect(listCachedDownloads(store)).resolves.toEqual([
      { id: DETECTOR, files: 3, bytes: 152_300_000 },
    ])
  })

  it('offers the biggest first, which is the one worth removing', async () => {
    const store = new FakeStore([
      file(RECOGNISER, 'inference.onnx', 10),
      file(DETECTOR, 'inference.onnx', 90),
    ])

    expect((await listCachedDownloads(store)).map((model) => model.id)).toEqual([
      DETECTOR,
      RECOGNISER,
    ])
  })

  it('keeps two repositories apart', async () => {
    const store = new FakeStore([
      file(DETECTOR, 'inference.onnx', 5),
      file(RECOGNISER, 'inference.onnx', 5),
    ])

    expect(await listCachedDownloads(store)).toHaveLength(2)
  })

  it('reads the repository out of the URL, not the revision or the path', async () => {
    const store = new FakeStore([
      {
        url: `https://huggingface.co/${DETECTOR}/resolve/refs%2Fpr%2F1/onnx/deep/file.onnx`,
        bytes: 7,
      },
    ])

    expect((await listCachedDownloads(store))[0]?.id).toBe(DETECTOR)
  })

  it('leaves out the runtime, which is not a download anyone can reclaim', async () => {
    // It ships with the app and is served from its own origin, so it is in
    // the service worker's asset cache rather than this one. Listing it
    // would offer a rower a row whose Remove button breaks the app.
    const store = new FakeStore([
      file(DETECTOR, 'inference.onnx', 5),
      { url: 'https://rowing.example/assets/ort-wasm-simd-threaded.jsep.wasm', bytes: 20_000_000 },
    ])

    await expect(listCachedDownloads(store)).resolves.toEqual([
      { id: DETECTOR, files: 1, bytes: 5 },
    ])
  })

  it('leaves out an entry that reads as no repository', async () => {
    // Nothing writes one today. Filing it under an invented name would put a
    // row in a list of things to delete that nobody can account for.
    const store = new FakeStore([
      { url: 'https://example.com/not-a-model.bin', bytes: 10 },
      file(DETECTOR, 'inference.onnx', 5),
    ])

    await expect(listCachedDownloads(store)).resolves.toEqual([
      { id: DETECTOR, files: 1, bytes: 5 },
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
      file(DETECTOR, 'inference.onnx', 89),
      file(DETECTOR, 'inference.yml', 5),
      file(RECOGNISER, 'inference.onnx', 10),
    ])

    await expect(removeCachedDownload(DETECTOR, store)).resolves.toBe(true)
    expect(store.removed).toEqual([
      `https://huggingface.co/${DETECTOR}/resolve/main/inference.onnx`,
      `https://huggingface.co/${DETECTOR}/resolve/main/inference.yml`,
    ])
  })

  it('leaves the other model on the device', async () => {
    const store = new FakeStore([
      file(DETECTOR, 'inference.onnx', 5),
      file(RECOGNISER, 'inference.onnx', 10),
    ])

    await removeCachedDownload(DETECTOR, store)

    await expect(listCachedDownloads(store)).resolves.toEqual([
      { id: RECOGNISER, files: 1, bytes: 10 },
    ])
  })

  it('says so when there was nothing of that model to remove', async () => {
    const store = new FakeStore([file(RECOGNISER, 'inference.onnx', 10)])

    await expect(removeCachedDownload(DETECTOR, store)).resolves.toBe(false)
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('says so when the cache refuses the delete', async () => {
    const store = new FakeStore([file(DETECTOR, 'inference.onnx', 5)])
    store.remove.mockResolvedValueOnce(false)

    await expect(removeCachedDownload(DETECTOR, store)).resolves.toBe(false)
  })

  it('leaves the other model behind when one of the pair is removed', async () => {
    // The photo scan arrives as two repositories. Taking out the one the
    // user did not press is not what "remove this model" says — even though
    // neither is any use without the other, which is the settings screen's
    // sentence to write, not this module's.
    const store = new FakeStore([
      file(DETECTOR, 'inference.onnx', 5),
      file(RECOGNISER, 'inference.onnx', 20),
    ])

    await removeCachedDownload(DETECTOR, store)

    await expect(listCachedDownloads(store)).resolves.toEqual([
      { id: RECOGNISER, files: 1, bytes: 20 },
    ])
  })

  it('says so rather than throwing when reading the cache fails', async () => {
    const store = new FakeStore()
    store.files.mockRejectedValueOnce(new Error('no storage'))

    await expect(removeCachedDownload(DETECTOR, store)).resolves.toBe(false)
  })
})
