/**
 * Ask the browser to keep IndexedDB around.
 *
 * There is no server copy of anything in this app, so eviction is data loss.
 * By default an origin's storage is "best effort": Safari clears it after
 * seven days without a visit, Chrome and Firefox clear it when the disk gets
 * tight. `navigator.storage.persist()` promotes the origin to "persistent",
 * which is exempt from both — see docs/local-first.md.
 *
 * The request is best-effort itself: browsers grant it silently based on
 * engagement heuristics (installed PWA, bookmarked, frequently used), deny it,
 * or don't implement the API at all. A denial isn't actionable for the user,
 * so the outcome is logged and never surfaced or thrown.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = globalThis.navigator?.storage

  if (!storage?.persist) {
    console.debug('[storage] persistence API unavailable — data is evictable')
    return false
  }

  try {
    // Already granted on an earlier visit: re-asking is a no-op, but skipping
    // it keeps boot off the permission machinery entirely.
    if (await storage.persisted?.()) {
      return true
    }

    const granted = await storage.persist()
    console.debug(
      granted
        ? '[storage] persistent — data is exempt from eviction'
        : '[storage] best-effort — the browser may evict data under pressure',
    )
    return granted
  } catch (error) {
    console.debug('[storage] persistence request failed', error)
    return false
  }
}
