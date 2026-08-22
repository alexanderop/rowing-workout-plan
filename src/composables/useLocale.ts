import type { RemovableRef } from '@vueuse/core'
import { useLocalStorage } from '@vueuse/core'
import { watch } from 'vue'
import type { SupportedLocale } from '@/i18n'
import { i18n, SUPPORTED_LOCALES } from '@/i18n'

export const LOCALE_STORAGE_KEY = 'vue-pwa-starter.locale'
const DEFAULT_LOCALE: SupportedLocale = 'en'

function isSupportedLocale(value: string): value is SupportedLocale {
  // SAFETY: widening a `ReadonlyArray<SupportedLocale>` to
  // `ReadonlyArray<string>` so `includes` accepts an arbitrary string. Every
  // element still has its original type; only the parameter is loosened.
  return (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(value)
}

// Module-scoped so every consumer shares one source of truth, and the
// persisted choice is applied exactly once, immediately on first import.
const storedLocale = useLocalStorage<SupportedLocale>(LOCALE_STORAGE_KEY, DEFAULT_LOCALE)

function applyLocale(value: string): void {
  // Guard against hand-edited or stale localStorage values ("fr" from a
  // build that still shipped French). Normalizing the ref too — not just
  // what i18n gets — keeps the Settings select in sync with the UI.
  const effective = isSupportedLocale(value) ? value : DEFAULT_LOCALE

  i18n.global.locale.value = effective
  // index.html can only hardcode one lang; screen readers pick their voice
  // from this attribute, so it has to follow the effective locale.
  document.documentElement.lang = effective

  if (effective !== value) storedLocale.value = effective
}

watch(storedLocale, applyLocale, { immediate: true })

interface UseLocaleReturn {
  /** The persisted choice. Writable, so the Settings select can v-model it. */
  locale: RemovableRef<SupportedLocale>
  setLocale: (next: SupportedLocale) => void
  supportedLocales: typeof SUPPORTED_LOCALES
}

export function useLocale(): UseLocaleReturn {
  function setLocale(next: SupportedLocale): void {
    storedLocale.value = next
  }

  return {
    locale: storedLocale,
    setLocale,
    supportedLocales: SUPPORTED_LOCALES,
  }
}

/**
 * Restore the locale to its default and re-run the side effects the watcher
 * owns (i18n's active locale, `<html lang>`).
 *
 * The store convention for global state is `$reset()`; composables backed by
 * module-scoped refs need the same escape hatch, because `localStorage.clear()`
 * fires no storage event in the same document and so never reaches this ref.
 * `applyLocale` is called directly rather than left to the watcher so the reset
 * is synchronous and idempotent — the watcher would not fire at all when the
 * ref is already `'en'` but the document was left in another language.
 * Test-only — see `src/__tests__/helpers/reset.ts`.
 */
export function resetLocaleState(): void {
  storedLocale.value = DEFAULT_LOCALE
  applyLocale(DEFAULT_LOCALE)
}
