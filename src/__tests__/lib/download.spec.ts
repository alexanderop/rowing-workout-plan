import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob } from '@/lib/download'

/**
 * The anchor click is the boundary where the browser takes over, so it is
 * stubbed — a real click in the test runner would start a real download.
 * Everything asserted below is what the browser sees at that moment.
 */
const clicks: Array<{ href: string; download: string; connected: boolean }> = []

describe('downloadBlob', () => {
  beforeEach(() => {
    clicks.length = 0
    vi.useFakeTimers()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download, connected: this.isConnected })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers the blob under the given filename, from a node in the document', () => {
    downloadBlob(new Blob(['{}'], { type: 'application/json' }), 'backup-2026-08-07.json')

    expect(clicks).toHaveLength(1)
    expect(clicks[0]?.download).toBe('backup-2026-08-07.json')
    // Firefox ignores a synthetic click on a detached anchor.
    expect(clicks[0]?.connected).toBe(true)
  })

  it('keeps the blob readable after the click, so the download can still fetch it', async () => {
    downloadBlob(new Blob(['backup contents'], { type: 'application/json' }), 'backup.json')

    const response = await fetch(clicks[0]?.href ?? '')

    expect(await response.text()).toBe('backup contents')
  })

  it('releases the blob once the browser has had time to read it', async () => {
    downloadBlob(new Blob(['backup contents'], { type: 'application/json' }), 'backup.json')
    const { href } = clicks[0] ?? { href: '' }

    vi.advanceTimersByTime(60_000)

    await expect(fetch(href)).rejects.toThrow()
  })

  it('leaves no anchor behind in the document', () => {
    downloadBlob(new Blob(['{}']), 'backup.json')

    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })
})
