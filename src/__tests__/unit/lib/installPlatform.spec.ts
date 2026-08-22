import { describe, expect, it } from 'vitest'
import { detectInstallPlatform } from '@/lib/installPlatform'

/**
 * Real user-agent strings, not sketches: every case below is a browser whose
 * install flow differs, and the point of the function is to tell them apart.
 * A shortened UA would pass a test the actual device fails.
 */
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

describe('detectInstallPlatform', () => {
  it('sends every iOS browser down the Safari path', () => {
    // CriOS is Chrome's skin over WebKit — it installs the same way Safari
    // does, so treating it as anything else would show it a button that does
    // nothing.
    expect(detectInstallPlatform({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 })).toBe('ios')
    expect(detectInstallPlatform({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 })).toBe('ios')
  })

  it('recognises Android', () => {
    expect(detectInstallPlatform({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 })).toBe('android')
  })

  /**
   * The case the whole `maxTouchPoints` parameter exists for. iPadOS 13+
   * requests desktop sites by default, so its UA is byte-for-byte a Mac's —
   * the two constants above are identical on purpose. Touch points are the
   * only thing that separates them, and getting it wrong shows an iPad user
   * instructions for a browser menu Safari does not have.
   */
  it('tells an iPad on a desktop UA apart from a Mac, by touch alone', () => {
    expect(detectInstallPlatform({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 })).toBe('ios')
    expect(detectInstallPlatform({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe('other')
  })

  it('needs more than one touch point before calling a Macintosh an iPad', () => {
    // A single touch point is a stylus or a trackpad gesture surface, not a
    // touchscreen. Reading `> 0` here would misfile real Macs as iPads.
    expect(detectInstallPlatform({ userAgent: MAC_SAFARI, maxTouchPoints: 1 })).toBe('other')
  })

  it('falls back to the generic instructions for desktop browsers', () => {
    expect(detectInstallPlatform({ userAgent: WINDOWS_CHROME, maxTouchPoints: 0 })).toBe('other')
  })

  it('does not let a touchscreen Windows laptop pass for an iPad', () => {
    // The Macintosh guard has to be anchored to that token, not to touch.
    expect(detectInstallPlatform({ userAgent: WINDOWS_CHROME, maxTouchPoints: 10 })).toBe('other')
  })

  it('treats an empty user agent as unknown rather than guessing', () => {
    expect(detectInstallPlatform({ userAgent: '', maxTouchPoints: 0 })).toBe('other')
  })
})
