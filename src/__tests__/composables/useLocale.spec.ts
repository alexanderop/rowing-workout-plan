import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useLocale } from '@/composables/useLocale'
import { i18n } from '@/i18n'
import { resetAppState } from '../helpers/reset'

describe('useLocale', () => {
  beforeEach(resetAppState)

  it('keeps the document language in sync with the chosen locale', async () => {
    const { setLocale } = useLocale()

    setLocale('de')
    await nextTick()

    expect(i18n.global.locale.value).toBe('de')
    expect(document.documentElement.lang).toBe('de')

    setLocale('en')
    await nextTick()

    expect(document.documentElement.lang).toBe('en')
  })
})
