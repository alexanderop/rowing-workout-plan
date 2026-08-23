interface AppVersionInfo {
  readonly version: string
  readonly tag: string | null
  readonly commit: string
  readonly buildTime: string
}

/** Immutable provenance injected by the Vite build. */
export const appVersion: AppVersionInfo = Object.freeze({
  version: import.meta.env.APP_VERSION,
  tag: import.meta.env.APP_TAG,
  commit: import.meta.env.APP_COMMIT,
  buildTime: import.meta.env.APP_BUILD_TIME,
})

/** Formats the UTC build instant in the language selected for the app. */
export function formatBuildTime(buildTime: string, locale: string): string {
  const date = new Date(buildTime)
  if (Number.isNaN(date.getTime())) return buildTime

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date)
}
