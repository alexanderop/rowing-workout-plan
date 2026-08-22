import { useMediaQuery, useStorage } from '@vueuse/core'
import type { ComputedRef, ShallowRef } from 'vue'
import { computed, shallowRef, watch } from 'vue'
import type { InstallPlatform } from '@/lib/installPlatform'
import { detectInstallPlatform } from '@/lib/installPlatform'

export const INSTALL_HINT_STORAGE_KEY = 'vue-pwa-starter.install-hint-dismissed'

/**
 * Long enough that the hint does not land on top of the first paint, short
 * enough to still read as part of arriving rather than an interruption.
 */
const HINT_DELAY_MS = 2000

/**
 * The "add this to your home screen" flow.
 *
 * Chromium fires `beforeinstallprompt` and lets you keep the event to trigger
 * the real install dialog later. We call `preventDefault()` on it, which
 * suppresses the browser's own mini-infobar, and re-issue it behind our own
 * UI — that is what buys a consistent moment to ask, a dismissal that sticks,
 * and, on iOS, any prompt at all: Safari fires no such event, so the share-
 * sheet instructions in PwaInstallDialog.vue are the only path there.
 *
 * Module-scoped for the same reason as usePwaUpdate: the event fires **once**,
 * on `window`, when the browser decides the app is installable — typically
 * after the manifest and service worker have been validated, which may be
 * before or after any given component mounts. A listener registered in
 * `onMounted` is a coin flip; one registered at import time is not, and this
 * module is in App.vue's import graph. It also means one timer and one source
 * of truth no matter how many components consume the flow.
 */
// Reading `navigator` is this module's job, not installPlatform.ts's: keeping
// that file free of environment access is what lets the mutation tier grade
// it as pure logic (see the `mutate` list in stryker.config.mjs).
const platform: InstallPlatform = detectInstallPlatform({
  userAgent: globalThis.navigator?.userAgent ?? '',
  maxTouchPoints: globalThis.navigator?.maxTouchPoints ?? 0,
})

// shallowRef, not ref: `prompt()` and `userChoice` must be called on the real
// event instance. A reactive proxy around it would break both.
const deferredPrompt = shallowRef<BeforeInstallPromptEvent | null>(null)

// Same category as the color scheme and the locale — a UI preference, not
// domain data — so it lives in localStorage next to them rather than earning
// a Dexie table, a converter and a migration. See docs/local-first.md for
// where that line sits.
const hintDismissed = useStorage(INSTALL_HINT_STORAGE_KEY, false)

// The standard "already installed" check. Reactive because a browser tab can
// become a standalone window without a reload.
const displayModeStandalone = useMediaQuery('(display-mode: standalone)')

// iOS Safari predates `display-mode` and never matches it. This flag cannot
// change within a document — launching from the home screen is a new one —
// so it is read once.
const launchedFromHomeScreen = globalThis.navigator?.standalone === true

const isInstalled = computed(() => displayModeStandalone.value || launchedFromHomeScreen)

/**
 * Whether an install is reachable at all from here.
 *
 * Deliberately narrower than "is this a phone": a deferred prompt means the
 * browser has already told us it can install, and iOS means it can, silently.
 * Anything else — desktop Firefox, an in-app webview — offers no install path
 * we could describe, and hinting there would be a dead end.
 */
const canInstall = computed(() => deferredPrompt.value !== null || platform === 'ios')

const isEligibleForHint = computed(
  () => canInstall.value && !isInstalled.value && !hintDismissed.value,
)

const hintVisible = shallowRef(false)
let hintTimer: ReturnType<typeof setTimeout> | undefined

// `flush: 'sync'` because this schedules a timer rather than touching the DOM,
// and a synchronous callback is what makes resetInstallPromptState below
// deterministic instead of racing the pre-flush queue.
watch(
  isEligibleForHint,
  (eligible) => {
    clearTimeout(hintTimer)
    if (!eligible) {
      hintVisible.value = false
      return
    }
    hintTimer = setTimeout(() => {
      hintVisible.value = true
    }, HINT_DELAY_MS)
  },
  { immediate: true, flush: 'sync' },
)

window.addEventListener('beforeinstallprompt', (event) => {
  // Suppresses Chromium's own infobar. Everything below is the replacement.
  event.preventDefault()
  deferredPrompt.value = event
})

window.addEventListener('appinstalled', () => {
  deferredPrompt.value = null
  hintDismissed.value = true
})

interface UseInstallPromptReturn {
  /** The install path exists on this browser (prompt available, or iOS). */
  canInstall: ComputedRef<boolean>
  /** A prompt is in hand, so the dialog can offer a button instead of steps. */
  canPromptDirectly: ComputedRef<boolean>
  /** Running as an installed app already. */
  isInstalled: ComputedRef<boolean>
  /**
   * Which instructions to show when there is no prompt to issue. A plain
   * value, not a ref: a document cannot change platforms mid-life.
   */
  platform: InstallPlatform
  /** The banner should be on screen: eligible, and past the settling delay. */
  hintVisible: ShallowRef<boolean>
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>
  dismissHint: () => void
}

export function useInstallPrompt(): UseInstallPromptReturn {
  /**
   * Trigger the browser's install dialog. Resolves to the user's choice, or
   * `null` when there is no prompt to issue — on iOS that is always, which is
   * why the dialog shows instructions there instead of a button.
   */
  async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
    const event = deferredPrompt.value
    if (!event) return null

    // Cleared *before* awaiting, not after: the event is single-use, and a
    // second `prompt()` on it rejects. Clearing first makes a double-tap on
    // the button a no-op rather than an unhandled rejection.
    deferredPrompt.value = null

    await event.prompt()
    const { outcome } = await event.userChoice

    // `appinstalled` also fires on acceptance, but only once the install has
    // actually completed — and not at all if the user accepted in a way the
    // browser handles out of band. Recording it here keeps the hint from
    // reappearing in the gap.
    if (outcome === 'accepted') hintDismissed.value = true

    return outcome
  }

  /** "Later" — persisted, so the hint does not return on the next launch. */
  function dismissHint(): void {
    hintDismissed.value = true
  }

  return {
    canInstall,
    canPromptDirectly: computed(() => deferredPrompt.value !== null),
    isInstalled,
    platform,
    hintVisible,
    promptInstall,
    dismissHint,
  }
}

/**
 * Drop the deferred prompt and un-dismiss the hint.
 *
 * The store convention for global state is `$reset()`; composables backed by
 * module-scoped refs need the same escape hatch, because `localStorage.clear()`
 * fires no storage event in the same document and so never reaches this ref.
 * The pending timer is left to the watcher, which runs synchronously on both
 * writes below and cancels or reschedules to match the new state.
 * Test-only — see `src/__tests__/helpers/reset.ts`.
 */
export function resetInstallPromptState(): void {
  deferredPrompt.value = null
  hintDismissed.value = false
  hintVisible.value = false
}
