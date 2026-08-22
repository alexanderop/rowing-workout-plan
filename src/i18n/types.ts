import type en from './messages/en'

export type MessageSchema = typeof en

export const SUPPORTED_LOCALES = ['en', 'de'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

declare module 'vue-i18n' {
  // Typed message keys: `t('nav.notes')` compiles, `t('nav.typo')` does not.

  export interface DefineLocaleMessage extends MessageSchema {}
}
