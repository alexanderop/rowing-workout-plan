/**
 * Which set of "add to home screen" instructions a browser needs.
 *
 * This exists because installing a PWA is not one flow. Chromium fires
 * `beforeinstallprompt` and hands you a real dialog to trigger; Safari never
 * has and never will, so the only honest thing to show an iOS user is where
 * the Share button is. `'other'` is the residual — a browser that neither
 * offered us a prompt nor is known to hide the control somewhere specific.
 *
 * Kept as a pure function over the two signals it reads, rather than a
 * composable poking at `navigator`, so the awkward cases below are pinned by
 * unit tests instead of discovered on a device.
 */
export type InstallPlatform = 'ios' | 'android' | 'other'

export interface PlatformSignals {
  userAgent: string
  /**
   * `navigator.maxTouchPoints`. Load-bearing only for iPadOS — see below.
   */
  maxTouchPoints: number
}

/** Chrome, Firefox and Opera on iOS are all Safari underneath, so the iPhone/iPad
 * tokens stay reliable there; it is the iPad *desktop-class* UA that lies. */
const IOS_DEVICE = /iphone|ipod|ipad/i
const ANDROID = /android/i
const MACINTOSH = /macintosh/i

export function detectInstallPlatform({
  userAgent,
  maxTouchPoints,
}: PlatformSignals): InstallPlatform {
  // Android before iOS: an Android UA carries "Linux", never an iOS token, so
  // the order is not strictly required — but checking the unambiguous signal
  // first keeps the iPadOS special case below from ever seeing an Android UA.
  if (ANDROID.test(userAgent)) return 'android'

  if (IOS_DEVICE.test(userAgent)) return 'ios'

  // iPadOS 13+ requests desktop sites by default and reports itself as
  // "Macintosh; Intel Mac OS X" — no iPad token anywhere. Touch points are
  // what separates it from a real Mac, which reports 0: Apple ships no
  // touchscreen Mac, so a touch-capable "Macintosh" is an iPad. Without this
  // an iPad user gets desktop instructions for a menu Safari does not have.
  if (MACINTOSH.test(userAgent) && maxTouchPoints > 1) return 'ios'

  return 'other'
}
