import { usePwaUpdate } from '@/composables/usePwaUpdate'

/**
 * Raises the "update available" banner.
 *
 * The real trigger is a new service worker reaching the browser, which a test
 * cannot arrange: `useRegisterSW` owns the registration, and there is no
 * second build for it to find. `needRefresh` is the flag the whole banner
 * hangs off, so setting it is the same state the user would be in — the
 * counterpart of `stubInstallPromptAvailable` for the update flow.
 *
 * `resetAppState` lowers it again, so no spec has to remember to.
 */
export function stubUpdateAvailable(): void {
  usePwaUpdate().needRefresh.value = true
}
