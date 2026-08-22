import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'

/**
 * The install banner (`PwaInstallPrompt.vue`) and the dialog it opens.
 *
 * Owned by `AppScreen` rather than a single screen: both are mounted in
 * App.vue, so they are reachable from wherever the user happens to be.
 *
 * The banner and the dialog deliberately share their wording — the dialog is
 * a continuation of the banner, not a new subject — which means "Install this
 * app" and the `Install` button both match twice while the dialog is open.
 * Every banner locator is therefore scoped to the app root and every dialog
 * locator to the dialog: the dialog is portalled to the end of `<body>`,
 * outside `data-testid="app"`, so the two scopes are disjoint. Matching on
 * document order instead would quietly turn "the banner is gone" into "the
 * dialog title is still here".
 */
export class InstallPrompt {
  private get appRoot(): Locator {
    return page.getByTestId('app')
  }

  get banner(): Locator {
    return this.appRoot.getByText('Install this app')
  }

  /** The banner's action — opens the instructions. */
  get installButton(): Locator {
    return this.appRoot.getByRole('button', { name: 'Install' })
  }

  get laterButton(): Locator {
    return this.appRoot.getByRole('button', { name: 'Not now' })
  }

  get dialog(): Locator {
    return page.getByRole('dialog')
  }

  /** The dialog's action — the one that actually reaches `prompt()`. */
  get confirmButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Install' })
  }

  async openDialog(): Promise<void> {
    await this.installButton.click()
    // The dialog is lazy-loaded, so it is not on screen the moment the button
    // is clicked — every caller would otherwise wait for it.
    await this.expectDialogOpen()
  }

  /** Accept the install, from inside the dialog. */
  async confirmInstall(): Promise<void> {
    await this.confirmButton.click()
  }

  async dismiss(): Promise<void> {
    await this.laterButton.click()
    await this.expectHidden()
  }

  /**
   * The banner is deliberately delayed (HINT_DELAY_MS, 2s) so it does not
   * land on first paint, which outlasts the 1s default `expect.element`
   * poll — hence the explicit timeout. It is the delay being waited on, not
   * a slow app, so this is a real wait rather than a papered-over flake.
   */
  readonly expectVisible = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.banner, { timeout: 4000 }).toBeVisible()
  })

  readonly expectHidden = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.banner).not.toBeInTheDocument()
  })

  /**
   * Still absent after the delay has comfortably passed. A plain "not
   * visible" would pass instantly and prove nothing about a banner that is
   * merely two seconds away.
   */
  readonly expectNeverAppears = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.banner).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 2500))
    await expect.element(this.banner).not.toBeInTheDocument()
  })

  readonly expectDialogOpen = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.dialog).toBeVisible()
  })

  readonly expectDialogClosed = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.dialog).not.toBeInTheDocument()
  })
}
