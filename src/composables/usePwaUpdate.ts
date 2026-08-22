import { useRegisterSW } from 'virtual:pwa-register/vue'
import type { Ref } from 'vue'
import { startPeriodicUpdateCheck } from '@/lib/swUpdateCheck'

/**
 * Service-worker update flow for `registerType: 'prompt'` (vite.config.ts).
 * When a new version is deployed, `needRefresh` flips to true and
 * MoleculePwaUpdatePrompt.vue offers a reload instead of silently swapping the app
 * out from under the user mid-interaction.
 *
 * Registration alone only checks for a new worker once. An installed PWA
 * resumed from the app switcher never navigates, so the periodic check in
 * `startPeriodicUpdateCheck` is what keeps long-lived sessions from sitting
 * on a stale build forever.
 *
 * Module-scoped, mirroring useLocale and useTheme: there is one service
 * worker per page no matter how many components consume the update flow, so
 * there must be one registration and one hourly check — a per-call
 * `useRegisterSW` would start a new page-lifetime interval per consumer.
 */
const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      startPeriodicUpdateCheck(swUrl, registration)
    }
  },
})

interface UsePwaUpdateReturn {
  /** A new service worker is waiting. Writable — the test helper raises it. */
  needRefresh: Ref<boolean>
  /** Activate the waiting worker and reload into the new build. */
  reload: () => void
  /** Hide the banner for this session; the worker keeps waiting. */
  dismiss: () => void
}

export function usePwaUpdate(): UsePwaUpdateReturn {
  function reload(): void {
    void updateServiceWorker(true)
  }

  function dismiss(): void {
    needRefresh.value = false
  }

  return { needRefresh, reload, dismiss }
}

/**
 * Test seam, mirroring `resetLocaleState` and `resetThemeState`: the flag
 * above is module state with no storage behind it, so a test that raises the
 * banner would otherwise leave it raised for every later test in the file.
 * Called by `resetAppState` — see src/__tests__/helpers/reset.ts.
 */
export function resetPwaUpdateState(): void {
  needRefresh.value = false
}
