import { nextTick } from 'vue'
import { resetInstallPromptState } from '@/composables/useInstallPrompt'
import { resetLocaleState } from '@/composables/useLocale'
import { resetPwaUpdateState } from '@/composables/usePwaUpdate'
import { resetThemeState } from '@/composables/useTheme'
import { resetDatabase } from '@/db'

/**
 * Full app-state reset for browser-tier tests: database, persisted
 * preferences, and theme class. Use as `beforeEach(resetAppState)`.
 *
 * Atom-held state (toasts, and every read atom a screen subscribes to) needs no reset here:
 * renderApp provides a fresh atom registry per mount, so it never outlives a
 * test. What does leak between tests lives outside the registry —
 * IndexedDB, and the module-scoped VueUse refs behind useLocale, useTheme
 * and useInstallPrompt. `localStorage.clear()` alone is not enough for those
 * refs: writes made in the same document fire no storage event, so the
 * in-memory values would survive into every later test in the file. Each
 * composable therefore exposes its own reset, and those are the source of
 * truth here.
 *
 * useInstallPrompt also holds the deferred `beforeinstallprompt` event, which
 * a spec dispatches by hand — that is module state with no storage behind it
 * at all, and it would otherwise leak a stale prompt into the next test. Same
 * for usePwaUpdate's `needRefresh`: a spec that raises the update banner would
 * leave it raised over every later test in the file.
 */
export async function resetAppState(): Promise<void> {
  await resetDatabase()
  localStorage.clear()
  resetLocaleState()
  resetThemeState()
  resetInstallPromptState()
  resetPwaUpdateState()
  // useColorMode applies the `.dark` class from a `flush: 'post'` watcher.
  await nextTick()
}
