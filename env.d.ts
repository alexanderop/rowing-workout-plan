/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />
/// <reference types="vite-plugin-pwa/info" />

interface ImportMetaEnv {
  /** Package version and Git provenance injected by versionPlugin. */
  readonly APP_VERSION: string
  readonly APP_TAG: string | null
  readonly APP_COMMIT: string
  readonly APP_BUILD_TIME: string

  /**
   * OTLP base URL for development telemetry export — see
   * `src/lib/observability.ts` and `.env.example`. Unset means no export.
   * Declared rather than left to Vite's index signature so a typo is a
   * compile error instead of silently-undefined telemetry.
   */
  readonly VITE_OTLP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * The install-prompt surface, which no `lib.dom` ships: `beforeinstallprompt`
 * is a Chromium extension to the platform, and `navigator.standalone` is a
 * pre-standard iOS Safari flag. Declared globally rather than cast at the
 * listener so `useInstallPrompt` registers a typed handler and reads a typed
 * flag — see src/composables/useInstallPrompt.ts.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  /** Single-use: a second call on the same event rejects. */
  prompt(): Promise<void>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
}

interface Navigator {
  /** iOS Safari only: true when the page was launched from the home screen. */
  readonly standalone?: boolean
}
