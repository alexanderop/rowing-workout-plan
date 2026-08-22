import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'
import { InstallPrompt } from './installPrompt'
import { UpdatePrompt } from './updatePrompt'

/**
 * Screen objects: the browser tiers' page-object DSL.
 *
 * A spec says what the user did (`importBackup`, `openInstallDialog`); the
 * screen object holds the only copy of *how* — which role, which accessible
 * name, which lazy-loaded part has to be on screen first. Renaming a label
 * or reshaping a component is then one edit here rather than a grep across
 * four tiers, and a spec reads as the journey it is proving.
 *
 * Two rules keep them from turning into a second app:
 *
 * - **Locators are still roles and accessible names.** The DSL names the
 *   query, it does not replace it with a test id — a screen object that
 *   reaches for `[data-testid]` has stopped testing what a user can find.
 * - **They stop at the UI.** Assertions about IndexedDB stay in the spec:
 *   that a row survived to disk is the point of the test, not a detail of
 *   the page.
 *
 * One class per screen, mirroring `src/views/`; nested parts (a bottom sheet
 * a screen opens) get their own object, mirroring the component that renders
 * them. `AppScreen` holds what every screen shares. Subclasses own the
 * mounting — `SettingsScreen.open()` is the entry point, `close()` the
 * teardown. Specs get both through the fixtures in
 * `src/__tests__/fixtures.ts` rather than calling them by hand.
 *
 * Every `expect*` method is a field wrapped in `vi.defineHelper`, not a plain
 * method: the wrapper strips this file's frames from the stack, so a failure
 * reports at the line in the spec that asked for it rather than somewhere in
 * here.
 *
 * It is applied uniformly, but it is not uniformly load-bearing. A locator
 * assertion (`expect.element`) is already attributed to its call site by the
 * browser runner, so wrapping one changes nothing today. A plain `expect` or
 * an `expect.poll` is not, and its failures would point in here. The rule is
 * uniform so that adding an assertion never requires knowing which of the two
 * kinds you just wrote.
 */
export abstract class AppScreen {
  /**
   * The install banner and dialog, mounted app-wide in App.vue rather than by
   * any one view — so they hang off the base class, not off one screen.
   */
  readonly install = new InstallPrompt()

  /** The "update available" banner, mounted app-wide in App.vue as well. */
  readonly update = new UpdatePrompt()

  protected constructor(
    /** The mounted subtree — what the a11y sweep and screenshots are scoped to. */
    readonly container: HTMLElement,
    private readonly unmount: () => void,
  ) {}

  /** Unmount the app. Every spec calls this from `afterEach`. */
  close(): void {
    this.unmount()
  }

  /** The app root (`data-testid="app"` in App.vue) — the visual tier's frame. */
  get root(): Locator {
    return page.getByTestId('app')
  }

  /** The tab bar. Every screen has one unless the route sets `meta.hideNav`. */
  get tabBar(): Locator {
    return page.getByRole('navigation')
  }

  /** One tab, by the label a user reads on it. */
  tab(label: string): Locator {
    return this.tabBar.getByRole('button', { name: label })
  }

  /**
   * The screen's own failure state — a load that did not come back, a route
   * naming something the catalogue does not have. Every screen renders one
   * the same way (`role="alert"`), so it belongs here rather than being
   * re-declared per screen.
   */
  get error(): Locator {
    return page.getByRole('alert')
  }

  /**
   * Toasts render in a viewport outside the screen's own markup, so they are
   * queried from the page rather than from `container`.
   */
  readonly expectToast = vi.defineHelper(async (message: string): Promise<void> => {
    await expect.element(page.getByText(message)).toBeVisible()
  })
}
