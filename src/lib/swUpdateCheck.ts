/** The part of a `ServiceWorkerRegistration` a periodic update check touches. */
export type UpdatableRegistration = Pick<ServiceWorkerRegistration, 'installing' | 'update'>

/** Hourly: often enough that a resumed app picks up a deploy, cheap enough to ignore. */
const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Poll for a new service worker on a timer.
 *
 * `useRegisterSW` only checks for an update on registration, and an installed
 * PWA resumed from the app switcher never navigates — without this, users sit
 * on a stale build indefinitely. This is the periodic-update pattern from the
 * vite-plugin-pwa docs: fetch the worker script past the HTTP cache and
 * only call `update()` when the server actually served it, so an offline
 * device or a 404 during a deploy doesn't churn the registration.
 *
 * Returns a stop function; the interval is otherwise page-lifetime.
 *
 * The registration is narrowed to the two members this module reads, so the
 * contract says what it needs and a spec can hand it a stand-in without
 * asserting one into existence.
 */
export function startPeriodicUpdateCheck(
  swUrl: string,
  registration: UpdatableRegistration,
  intervalMs: number = SW_UPDATE_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    void checkForUpdate(swUrl, registration)
  }, intervalMs)

  return () => {
    clearInterval(timer)
  }
}

async function checkForUpdate(swUrl: string, registration: UpdatableRegistration): Promise<void> {
  // An install is already in flight — let it finish.
  if (registration.installing) return

  // `onLine === false` is a reliable "definitely offline"; true is only a hint.
  if (globalThis.navigator?.onLine === false) return

  try {
    // `cache: 'no-store'` (the fetch option) bypasses the browser's HTTP
    // cache; the Cache-Control request header asks intermediaries not to
    // answer from theirs.
    const response = await fetch(swUrl, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    })

    if (response.status === 200) {
      await registration.update()
    }
  } catch (error) {
    // A failed poll is not worth surfacing: the next tick retries.
    console.debug('[pwa] update check failed', error)
  }
}
