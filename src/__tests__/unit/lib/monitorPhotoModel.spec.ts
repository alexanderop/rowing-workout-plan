import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonitorPhotoBackends, MonitorPhotoEngine } from '@/lib/monitorPhotoModel'

/**
 * The platform edge, and one of the places where a unit spec is allowed a
 * test double (docs/functional-core.md): the model runtime cannot run in a
 * test runner, and downloading half a gigabyte of weights to grade a wrapper
 * would grade the network. The double implements `MonitorPhotoBackends`
 * exactly — the same seam-not-mock argument as `ergBluetooth.spec.ts`.
 *
 * What is graded here is the *plumbing*: WebGPU chosen when the browser has
 * it, the WASM fallback when that load fails, one engine per session with a
 * failed load retried rather than replayed, and every failure ending as
 * `null` instead of an escaping rejection. Nothing here parses, because the
 * module does not.
 */

/** A backends whose engine parrots what it was shown, so the test can see
 * the photo and the prompt arrive intact. */
class FakeBackends implements MonitorPhotoBackends {
  webGpu = false
  readonly failing = new Set<string>()
  readonly engine: MonitorPhotoEngine = vi.fn(
    async (photo: Blob, prompt: string): Promise<string> => `read ${await photo.text()}: ${prompt}`,
  )
  readonly load = vi.fn(async (device: 'webgpu' | 'wasm'): Promise<MonitorPhotoEngine> => {
    if (this.failing.has(device)) throw new Error(`${device} unavailable`)
    return this.engine
  })

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
  onModelReady?: () => void,
): Promise<string | null> {
  const { readMonitorPhoto } = await import('@/lib/monitorPhotoModel')

  return readMonitorPhoto(new Blob(['photo']), 'the prompt', onModelReady, backends)
}

beforeEach(() => {
  vi.resetModules()
})

describe('readMonitorPhoto', () => {
  it('reads the photo on wasm where the browser has no WebGPU', async () => {
    const backends = new FakeBackends()
    const onModelReady = vi.fn()

    await expect(readPhoto(backends, onModelReady)).resolves.toBe('read photo: the prompt')
    expect(backends.devices()).toEqual(['wasm'])
    expect(onModelReady).toHaveBeenCalledTimes(1)
  })

  it('prefers WebGPU where the browser offers it', async () => {
    const backends = new FakeBackends()
    backends.webGpu = true

    await expect(readPhoto(backends)).resolves.toBe('read photo: the prompt')
    expect(backends.devices()).toEqual(['webgpu'])
  })

  it('falls back to wasm when the WebGPU load fails', async () => {
    const backends = new FakeBackends()
    backends.webGpu = true
    backends.failing.add('webgpu')

    await expect(readPhoto(backends)).resolves.toBe('read photo: the prompt')
    expect(backends.devices()).toEqual(['webgpu', 'wasm'])
  })

  it('returns null rather than throwing when no backend loads', async () => {
    const backends = new FakeBackends()
    backends.failing.add('wasm')
    const onModelReady = vi.fn()

    await expect(readPhoto(backends, onModelReady)).resolves.toBeNull()
    expect(onModelReady).not.toHaveBeenCalled()
  })

  it('returns null when the engine itself fails on a photo', async () => {
    const backends = new FakeBackends()
    backends.load.mockResolvedValueOnce(
      vi.fn(async (): Promise<string> => Promise.reject(new Error('out of memory'))),
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
    await expect(readPhoto(backends)).resolves.toBe('read photo: the prompt')
    expect(backends.devices()).toEqual(['wasm', 'wasm'])
  })
})
