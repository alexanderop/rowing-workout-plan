import type { BasicColorSchema } from '@vueuse/core'
import { useDark, useStorage, useToggle } from '@vueuse/core'
import type { WritableComputedRef } from 'vue'
import { watch } from 'vue'
import { applyThemeColor } from '@/lib/themeColor'

/**
 * VueUse's own defaults for `useDark`, spelled out here because the reset
 * below has to restore the *true* default — `'auto'` (follow the OS), not a
 * hardcoded `'light'`.
 */
export const COLOR_SCHEME_STORAGE_KEY = 'vueuse-color-scheme'
const DEFAULT_COLOR_SCHEME: BasicColorSchema = 'auto'

// Module-scoped, mirroring useLocale: one source of truth for every consumer,
// one storage listener, and the persisted choice applied exactly once on first
// import. Owning the backing storage ref (instead of letting useDark create it
// from `storageKey`) is what makes `resetThemeState()` able to write 'auto' —
// the `isDark` writable computed can only ever express 'light' or 'dark'.
const colorScheme = useStorage<BasicColorSchema>(COLOR_SCHEME_STORAGE_KEY, DEFAULT_COLOR_SCHEME)
const isDark = useDark({ storageRef: colorScheme })
const toggleDark = useToggle(isDark)

// A manual override diverges from `prefers-color-scheme`, which is all the
// static <meta name="theme-color"> tags in index.html can see — keep the
// installed app's status bar on the theme actually rendered.
watch(isDark, applyThemeColor, { immediate: true })

interface UseThemeReturn {
  /** Writable: assigning picks a mode, which is what the Settings switch binds. */
  isDark: WritableComputedRef<boolean>
  /** Flip it, or pass a value to set it. */
  toggleDark: (value?: boolean) => boolean
}

/**
 * Dark mode via VueUse: persists the choice in localStorage, applies the
 * `.dark` class on <html> (which the Tailwind `dark:` variant and the token
 * block in style.css react to), and falls back to the OS preference.
 */
export function useTheme(): UseThemeReturn {
  return { isDark, toggleDark }
}

/**
 * Restore the theme to its default (`'auto'` — follow the OS preference).
 *
 * The store convention for global state is `$reset()`; composables backed by
 * module-scoped refs need the same escape hatch, because `localStorage.clear()`
 * fires no storage event in the same document and so never reaches these refs.
 * Test-only — see `src/__tests__/helpers/reset.ts`.
 *
 * The `.dark` class follows on the next tick (useColorMode watches with
 * `flush: 'post'`); the theme-color meta is refreshed synchronously so the
 * reset leaves both watcher-owned side effects consistent either way.
 */
export function resetThemeState(): void {
  colorScheme.value = DEFAULT_COLOR_SCHEME
  applyThemeColor(isDark.value)
}
