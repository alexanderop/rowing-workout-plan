import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MonitorPhotoBackends,
  MonitorPhotoDownload,
  MonitorPhotoEngine,
  MonitorPhotoProgress,
} from '@/lib/monitorPhotoModel'
import type { OcrLine } from '@/lib/ocr'

/**
 * The platform edge, and one of the places where a unit spec is allowed a
 * test double (docs/functional-core.md): the model runtime cannot run in a
 * test runner, and downloading a couple of hundred megabytes of weights to
 * grade a wrapper would grade the network. The double implements
 * `MonitorPhotoBackends` exactly — the same seam-not-mock argument as
 * `ergBluetooth.spec.ts`.
 *
 * What is graded here is the *plumbing*: WebGPU chosen when the browser has
 * it, the WASM fallback when that load fails, one engine per session with a
 * failed load retried rather than replayed, every failure ending as `null`
 * instead of an escaping rejection, and the progress the two waits report.
 * Nothing here parses, because the module does not — and nothing here proves
 * the models can read a monitor, which is `monitorPhoto.spec.ts` against
 * captured readings of a real one. The arithmetic between the two, which
 * turns pixels into tensors and logits into words, is `ocr.spec.ts`.
 *
 * The progress arithmetic is the half worth reading twice. Several weight
 * files download at once and only their totals add up to one bar, the total
 * is not known until each file answers, and the reading half counts batches
 * of boxes on a photo whose box count is not known until the detector has
 * run. Every one of those is a way to draw a bar that lies.
 */

/**
 * A backends whose engine reports what it was shown, so the test can see the
 * photo arrive intact, and whose load and reading can be driven a step at a
 * time.
 */
class FakeBackends implements MonitorPhotoBackends {
  webGpu = false
  readonly failing = new Set<string>()

  /** Files this load reports before it resolves. */
  downloads: ReadonlyArray<MonitorPhotoDownload> = []
  /** Batches of boxes the engine reports recognising. */
  batches = 0

  readonly engine: MonitorPhotoEngine = vi.fn(
    async (photo: Blob, onStep): Promise<ReadonlyArray<OcrLine>> => {
      // The engine opens the phase before the first batch, so the done count
      // starts at zero and runs one behind the calls.
      for (let call = 0; call <= this.batches; call += 1) onStep?.(call, this.batches)

      return [{ text: await photo.text(), left: 0, top: 0, right: 1, bottom: 1, confidence: 1 }]
    },
  )

  readonly load = vi.fn(
    async (
      device: 'webgpu' | 'wasm',
      onDownload: (file: MonitorPhotoDownload) => void,
    ): Promise<MonitorPhotoEngine> => {
      if (this.failing.has(device)) throw new Error(`${device} unavailable`)
      for (const file of this.downloads) onDownload(file)

      return this.engine
    },
  )

  hasWebGpu(): boolean {
    return this.webGpu
  }

  devices(): ReadonlyArray<string> {
    return this.load.mock.calls.map(([device]) => device)
  }
}

/** A fresh module per test: the engine singleton is the state under test. */
async function readPhoto(
  backends: MonitorPhotoBackends,
  onProgress?: (progress: MonitorPhotoProgress) => void,
): Promise<ReadonlyArray<OcrLine> | null> {
  const { readMonitorPhoto } = await import('@/lib/monitorPhotoModel')

  return readMonitorPhoto(new Blob(['photo']), onProgress, backends)
}

/** What the fake engine returns for the photo every test here scans. */
const readOf = (photo: string) => [
  { text: photo, left: 0, top: 0, right: 1, bottom: 1, confidence: 1 },
]

/** Every update one scan reported, in order. */
async function progressOf(backends: FakeBackends): Promise<ReadonlyArray<MonitorPhotoProgress>> {
  const updates: MonitorPhotoProgress[] = []
  await readPhoto(backends, (update) => updates.push(update))

  return updates
}

const downloading = (updates: ReadonlyArray<MonitorPhotoProgress>) =>
  updates.filter((update) => update.phase === 'loadingModel')

const reading = (updates: ReadonlyArray<MonitorPhotoProgress>) =>
  updates.filter((update) => update.phase === 'reading')

beforeEach(() => {
  vi.resetModules()
})

describe('readMonitorPhoto', () => {
  it('reads the photo on wasm where the browser has no WebGPU', async () => {
    const backends = new FakeBackends()

    await expect(readPhoto(backends)).resolves.toEqual(readOf('photo'))
    expect(backends.devices()).toEqual(['wasm'])
  })

  it('prefers WebGPU where the browser offers it', async () => {
    const backends = new FakeBackends()
    backends.webGpu = true

    await expect(readPhoto(backends)).resolves.toEqual(readOf('photo'))
    expect(backends.devices()).toEqual(['webgpu'])
  })

  it('falls back to wasm when the WebGPU load fails', async () => {
    const backends = new FakeBackends()
    backends.webGpu = true
    backends.failing.add('webgpu')

    await expect(readPhoto(backends)).resolves.toEqual(readOf('photo'))
    expect(backends.devices()).toEqual(['webgpu', 'wasm'])
  })

  it('returns null rather than throwing when no backend loads', async () => {
    const backends = new FakeBackends()
    backends.failing.add('wasm')

    await expect(readPhoto(backends)).resolves.toBeNull()
  })

  it('returns null when the engine itself fails on a photo', async () => {
    const backends = new FakeBackends()
    backends.load.mockResolvedValueOnce(
      vi.fn(
        async (): Promise<ReadonlyArray<OcrLine>> => Promise.reject(new Error('out of memory')),
      ),
    )

    await expect(readPhoto(backends)).resolves.toBeNull()
  })

  it('loads the engine once across scans', async () => {
    const backends = new FakeBackends()

    await readPhoto(backends)
    await readPhoto(backends)

    expect(backends.devices()).toEqual(['wasm'])
  })

  it('retries a failed load on the next scan instead of replaying it', async () => {
    const backends = new FakeBackends()

    backends.failing.add('wasm')
    await expect(readPhoto(backends)).resolves.toBeNull()

    backends.failing.clear()
    await expect(readPhoto(backends)).resolves.toEqual(readOf('photo'))
    expect(backends.devices()).toEqual(['wasm', 'wasm'])
  })
})

describe('the download half of the bar', () => {
  it('adds the files up into one bar rather than reporting each', async () => {
    const backends = new FakeBackends()
    backends.downloads = [
      { file: 'inference.onnx', loaded: 30, total: 90 },
      { file: 'inference.yml', loaded: 10, total: 60 },
    ]

    // 30 of 90, then 40 of 150 — the second file joining is the total
    // *growing*, which is what a real load does and why the ratio can dip.
    expect(downloading(await progressOf(backends))).toEqual([
      { phase: 'loadingModel', loadedBytes: 30, totalBytes: 90, ratio: 1 / 3 },
      { phase: 'loadingModel', loadedBytes: 40, totalBytes: 150, ratio: 40 / 150 },
    ])
  })

  it('counts a file the runtime reports twice once', async () => {
    const backends = new FakeBackends()
    backends.downloads = [
      { file: 'inference.onnx', loaded: 30, total: 90 },
      { file: 'inference.onnx', loaded: 90, total: 90 },
    ]

    // Not 120 of 180: the second report is the same file further along.
    expect(downloading(await progressOf(backends)).at(-1)).toEqual({
      phase: 'loadingModel',
      loadedBytes: 90,
      totalBytes: 90,
      ratio: 1,
    })
  })

  it('goes indeterminate for a file that has not said how big it is', async () => {
    const backends = new FakeBackends()
    backends.downloads = [{ file: 'inference.yml', loaded: 0, total: 0 }]

    // A null ratio rather than a zero: the bar is indeterminate here, and
    // "0%" is a claim about a total nobody knows yet.
    expect(downloading(await progressOf(backends))).toEqual([
      { phase: 'loadingModel', loadedBytes: 0, totalBytes: 0, ratio: null },
    ])
  })

  it('says nothing at all when every file came from the cache', async () => {
    const backends = new FakeBackends()

    expect(downloading(await progressOf(backends))).toEqual([])
  })

  it('reports nothing once the load has failed', async () => {
    const backends = new FakeBackends()
    backends.failing.add('wasm')
    backends.downloads = [{ file: 'inference.onnx', loaded: 30, total: 90 }]

    // The files it managed before giving up are not a bar anyone should see
    // filling: `load` throws before reporting, and the scan ends as a
    // failure rather than a half-finished download.
    expect(await progressOf(backends)).toEqual([])
  })
})

describe('the reading half of the bar', () => {
  it('opens the phase at zero, which is the only ready signal there is', async () => {
    const backends = new FakeBackends()
    // A photo the detector found no text on: nothing to recognise, and no
    // batch count to divide by.
    backends.batches = 0

    expect(reading(await progressOf(backends))).toEqual([
      { phase: 'reading', ratio: 0 },
      // A bar over no work at all is finished, not stuck — and not `NaN`,
      // which is what dividing the zero batches done by the zero there are
      // would paint.
      { phase: 'reading', ratio: 1 },
    ])
  })

  it('counts the batches of boxes this photo actually needs', async () => {
    const backends = new FakeBackends()
    backends.batches = 2

    expect(reading(await progressOf(backends)).map((update) => update.ratio)).toEqual([
      0,
      0,
      1 / 2,
      1,
    ])
  })

  it('never paints past the end of the bar', async () => {
    const backends = new FakeBackends()
    backends.load.mockResolvedValueOnce(
      vi.fn(async (_photo: Blob, onStep): Promise<ReadonlyArray<OcrLine>> => {
        onStep?.(5, 4)

        return []
      }),
    )

    expect(reading(await progressOf(backends)).at(-1)).toEqual({ phase: 'reading', ratio: 1 })
  })

  it('follows the download rather than interleaving with it', async () => {
    const backends = new FakeBackends()
    backends.downloads = [{ file: 'inference.onnx', loaded: 90, total: 90 }]
    backends.batches = 1

    // One phase change, one way: a bar that went back to downloading would
    // have to run backwards to do it.
    expect((await progressOf(backends)).map((update) => update.phase)).toEqual([
      'loadingModel',
      'reading',
      'reading',
      'reading',
    ])
  })
})
