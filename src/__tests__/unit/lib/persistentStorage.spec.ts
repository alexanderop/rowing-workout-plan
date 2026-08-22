import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from '@/lib/persistentStorage'

function stubStorage(storage: Partial<StorageManager> | undefined): void {
  vi.stubGlobal('navigator', storage ? { storage } : {})
}

describe('requestPersistentStorage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('returns false when the API is unavailable', async () => {
    stubStorage(undefined)

    await expect(requestPersistentStorage()).resolves.toBe(false)
  })

  it('skips the request when persistence was already granted', async () => {
    const persist = vi.fn()
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist })

    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('requests persistence when not yet granted', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist })

    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('reports a denial without throwing', async () => {
    stubStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    })

    await expect(requestPersistentStorage()).resolves.toBe(false)
  })

  it('swallows a rejected request', async () => {
    stubStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockRejectedValue(new Error('nope')),
    })

    await expect(requestPersistentStorage()).resolves.toBe(false)
  })
})
