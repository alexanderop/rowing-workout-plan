import { createI18n } from 'vue-i18n'
import de from './messages/de'
import en from './messages/en'
import type { MessageSchema, SupportedLocale } from './types'
// Import types.ts for its `declare module 'vue-i18n'` augmentation.
import './types'

export { SUPPORTED_LOCALES, type SupportedLocale } from './types'

/**
 * Both locales ship in the entry bundle because they are tiny. If your
 * message catalog grows, switch to lazy per-locale loading: keep only the
 * fallback locale here and `import()` the rest on demand.
 */
export const i18n = createI18n<[MessageSchema], SupportedLocale, false>({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, de },
  missingWarn: import.meta.env.MODE !== 'test',
  fallbackWarn: import.meta.env.MODE !== 'test',
})
