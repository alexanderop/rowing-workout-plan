import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page, userEvent } from 'vitest/browser'
import type { BackupFixture } from '../helpers/backup'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'

interface ExpectedVersion {
  readonly version: string
  readonly commit: string
  readonly buildTime: string
}

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

  /**
   * The confirmation in front of "Delete everything". Portalled outside the
   * screen's subtree, like every dialog in this app, so it is queried from
   * the page rather than from `container`.
   */
  get deleteDialog(): Locator {
    return page.getByRole('dialog', { name: 'Delete everything?' })
  }

  /** Opens the confirmation and waits for it to actually be on screen. */
  async openDeleteDialog(): Promise<void> {
    await page.getByRole('button', { name: 'Delete everything' }).click()
    await expect.element(this.deleteDialog).toBeVisible()
  }

  /**
   * The whole destructive path: open, confirm, wait for the dialog to go.
   *
   * The wait is the point of putting it here — the dialog closes only once
   * the wipe has landed, so a spec that asserts against IndexedDB straight
   * after this one is asserting about a finished write rather than racing it.
   */
  async deleteEverything(): Promise<void> {
    await this.openDeleteDialog()
    await this.deleteDialog.getByRole('button', { name: 'Yes, delete everything' }).click()
    await this.expectDeleteDialogClosed()
  }

  /** Backs out of the confirmation the way a user who changed their mind does. */
  async cancelDelete(): Promise<void> {
    await this.deleteDialog.getByRole('button', { name: 'Cancel' }).click()
    await this.expectDeleteDialogClosed()
  }

  readonly expectDeleteDialogClosed = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.deleteDialog).not.toBeInTheDocument()
  })

  /** The immutable build provenance shown at the bottom of Settings. */
  readonly expectVersion = vi.defineHelper(async (expected: ExpectedVersion): Promise<void> => {
    await expect.element(page.getByRole('heading', { name: 'About', level: 2 })).toBeVisible()
    await expect.element(page.getByText(expected.version, { exact: false })).toBeVisible()
    await expect.element(page.getByText(expected.commit, { exact: true })).toBeVisible()

    const built = this.container.querySelector('time')
    if (!(built instanceof HTMLTimeElement)) throw new Error('no build time on the settings page')
    expect(built.dateTime).toBe(expected.buildTime)
  })

  /** On screen and laid out — what a sweep over the rendered page needs. */
  readonly expectReady = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.heading).toBeVisible()
  })
}
