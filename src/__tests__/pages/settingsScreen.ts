import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page, userEvent } from 'vitest/browser'
import type { BackupFixture } from '../helpers/backup'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'

/**
 * The settings screen (`SettingsView.vue`) — and, until the training screens
 * land, the app's home: `/` redirects here.
 */
export class SettingsScreen extends AppScreen {
  static async open(): Promise<SettingsScreen> {
    const app = await renderApp('/settings')
    return new SettingsScreen(app.container, app.cleanup)
  }

  /** The route's own h1. Chrome, and nothing local suppresses selection on it. */
  get heading(): Locator {
    return page.getByRole('heading', { name: 'Settings', level: 1 })
  }

  /**
   * The install instructions, reached from settings rather than the banner —
   * the way back in after "Not now" has persisted the dismissal.
   */
  async openInstallDialog(): Promise<void> {
    await page.getByRole('button', { name: 'How to install' }).click()
    await this.install.expectDialogOpen()
  }

  async exportBackup(): Promise<void> {
    await page.getByRole('button', { name: 'Export data' }).click()
  }

  /**
   * Restore a backup, as a file the way a user picks one.
   *
   * The only locator here that is not a role and a name, and the exception
   * proves the rule: what a user operates is the OS file picker, which no
   * browser lets a test drive. The `<input type="file">` behind "Import data"
   * is `hidden` precisely because nobody is meant to find it, so there is no
   * accessible name to ask for — the CSS query is the honest spelling of
   * "hand the picker's result to the page".
   */
  async importBackup(payload: BackupFixture): Promise<void> {
    const input = this.container.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('no file input on the settings page')

    await userEvent.upload(
      input,
      new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' }),
    )
  }

  /** On screen and laid out — what a sweep over the rendered page needs. */
  readonly expectReady = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.heading).toBeVisible()
  })
}
