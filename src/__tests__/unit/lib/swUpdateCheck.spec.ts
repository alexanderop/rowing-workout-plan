import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdatableRegistration } from '@/lib/swUpdateCheck'
import { startPeriodicUpdateCheck } from '@/lib/swUpdateCheck'

const SW_URL = '/sw.js'

function fakeRegistration(
  installing: ServiceWorker | null = null,
): UpdatableRegistration & { update: ReturnType<typeof vi.fn> } {
  return { installing, update: vi.fn().mockResolvedValue(undefined) }
}

/** Advance past one interval and let the async check settle. */
async function tick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1000)
}

describe('startPeriodicUpdateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { onLine: true })
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates the registration when the worker script is served', async () => {
    const registration = fakeRegistration()
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    startPeriodicUpdateCheck(SW_URL, registration, 1000)
    await tick()

    expect(fetchMock).toHaveBeenCalledWith(SW_URL, expect.objectContaining({ cache: 'no-store' }))
    expect(registration.update).toHaveBeenCalledOnce()
  })

  it('does not update when the script is missing', async () => {
    const registration = fakeRegistration()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }))

    startPeriodicUpdateCheck(SW_URL, registration, 1000)
    await tick()

    expect(registration.update).not.toHaveBeenCalled()
  })

  it('skips the poll while offline', async () => {
    const registration = fakeRegistration()
    const fetchMock = vi.fn()
    vi.stubGlobal('navigator', { onLine: false })
    vi.stubGlobal('fetch', fetchMock)

    startPeriodicUpdateCheck(SW_URL, registration, 1000)
    await tick()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips the poll while an install is in flight', async () => {
    // SAFETY: `installing` is only read for truthiness — checkForUpdate bails
    // on any non-null value without touching a member of it.
    const registration = fakeRegistration({} as ServiceWorker)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    startPeriodicUpdateCheck(SW_URL, registration, 1000)
    await tick()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('survives a failed fetch and keeps polling', async () => {
    const registration = fakeRegistration()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    startPeriodicUpdateCheck(SW_URL, registration, 1000)
    await tick()
    await tick()

    expect(registration.update).toHaveBeenCalledOnce()
  })

  it('stops polling once disposed', async () => {
    const registration = fakeRegistration()
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const stop = startPeriodicUpdateCheck(SW_URL, registration, 1000)
    stop()
    await tick()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
