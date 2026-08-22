import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { LOCALE_STORAGE_KEY, useLocale } from '@/composables/useLocale'
import { COLOR_SCHEME_STORAGE_KEY, useTheme } from '@/composables/useTheme'
import { i18n } from '@/i18n'
import { resetAppState } from './reset'

function themeColorMeta(): string | undefined {
  return document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content
}

/**
 * The guarantee docs/testing-strategy.md calls non-negotiable: whatever a test
 * did to the shared preferences, the next test starts from defaults.
 *
 * `localStorage.clear()` cannot deliver that on its own — a same-document write
 * fires no storage event, so the module-scoped VueUse refs behind useLocale and
 * useTheme would keep the old values while storage looked clean.
 */
describe('resetAppState', () => {
  beforeEach(resetAppState)

  it('returns locale and theme to their defaults after the UI changed them', async () => {
    const { locale, setLocale } = useLocale()
    const { isDark, toggleDark } = useTheme()

    // The default color scheme is 'auto', so "default dark" is whatever the OS
    // reports — hardcoding light here would be a lie on a dark-mode machine.
    const defaultDark = isDark.value
    const defaultThemeColor = themeColorMeta()

    setLocale('de')
    toggleDark()
    await nextTick()

    expect(locale.value).toBe('de')
    expect(i18n.global.locale.value).toBe('de')
    expect(document.documentElement.lang).toBe('de')
    expect(isDark.value).toBe(!defaultDark)
    expect(document.documentElement.classList.contains('dark')).toBe(!defaultDark)
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de')
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe(defaultDark ? 'light' : 'dark')

    await resetAppState()

    // The refs themselves, not just the storage they were read from.
    expect(locale.value).toBe('en')
    expect(isDark.value).toBe(defaultDark)
    // Everything the two watchers own has to follow the refs back.
    expect(i18n.global.locale.value).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.classList.contains('dark')).toBe(defaultDark)
    expect(themeColorMeta()).toBe(defaultThemeColor)
    // 'auto' is the real default — follow the OS, not a hardcoded 'light'.
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('auto')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  // The next two tests are a pair: the first dirties the shared state and
  // deliberately does not clean up, the second passes only if the beforeEach
  // hook undid it. Without the composable resets, the second one fails.
  it('tolerates a test that dirties locale and theme without cleaning up', async () => {
    const { isDark, toggleDark } = useTheme()
    const wasDark = isDark.value

    useLocale().setLocale('de')
    toggleDark()
    await nextTick()

    expect(document.documentElement.lang).toBe('de')
    expect(isDark.value).toBe(!wasDark)
  })

  it('starts from the defaults regardless of what ran before it', () => {
    const { isDark } = useTheme()

    expect(useLocale().locale.value).toBe('en')
    expect(i18n.global.locale.value).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.classList.contains('dark')).toBe(isDark.value)
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('auto')
  })
})
