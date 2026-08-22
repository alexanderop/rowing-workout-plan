import { expect, vi } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'

/**
 * The settings screen (`SettingsView.vue`).
 */
export class SettingsScreen extends AppScreen {
  static async open(): Promise<SettingsScreen> {
    const app = await renderApp('/settings')
    return new SettingsScreen(app.container, app.cleanup)
  }

  /**
   * The install instructions, reached from settings rather than the banner —
   * the way back in after "Not now" has persisted the dismissal.
   */
  async openInstallDialog(): Promise<void> {
    await page.getByRole('button', { name: 'How to install' }).click()
    await this.install.expectDialogOpen()
  }

  /** On screen and laid out — what a sweep over the rendered page needs. */
  readonly expectReady = vi.defineHelper(async (): Promise<void> => {
    await expect.element(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  })
}
