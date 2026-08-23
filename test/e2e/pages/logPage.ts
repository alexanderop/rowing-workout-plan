import type { Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { AppPage } from './appPage'

/**
 * The log, in the shipped build (`LogView.vue` plus the sheet it opens).
 *
 * The e2e tier exists for the journeys the browser tier cannot prove, and
 * this is the one: a workout typed in, a real page reload, and the row still
 * there — which is IndexedDB, the service worker and the app boot all at once.
 */
export class LogPage extends AppPage {
  async open(path = '/log'): Promise<void> {
    await super.open(path)
    await expect(this.heading).toBeVisible()
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Log', level: 1 })
  }

  get sheet(): Locator {
    return this.page.getByRole('dialog', { name: 'Log a row' })
  }

  entry(title: string): Locator {
    return this.page.getByRole('article').filter({ hasText: title })
  }

  async logRow(distance: string, time: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Log a row' }).click()
    await expect(this.sheet).toBeVisible()

    await this.enter('Distance in metres', 'Distance', distance)
    await this.enter('Time', 'Time', time)
    await this.sheet.getByRole('button', { name: 'Save' }).click()

    await expect(this.sheet).toBeHidden()
  }

  /**
   * Every field is a trigger that opens a keypad, so a value goes in the only
   * way a user can put it in: digits pressed on the pad, then confirmed. The
   * mask owns the separators, which is why the digits are enough for a time.
   * Mirrors `src/__tests__/pages/logWorkoutSheet.ts`, the browser-tier object
   * for the same sheet.
   */
  private async enter(label: string, padTitle: string, value: string): Promise<void> {
    // The trigger's accessible name is the label plus its current value.
    await this.sheet.getByRole('button', { name: new RegExp(`^${label}`) }).click()
    const pad = this.page.getByRole('dialog', { name: padTitle })
    await expect(pad).toBeVisible()

    // `exact` matters: a bare '2' would also match the '2000 m' preset.
    for (const key of value.replaceAll(/\D/g, '')) {
      await pad.getByRole('button', { name: key, exact: true }).click()
    }
    await pad.getByRole('button', { name: 'Confirm value' }).click()
    await expect(pad).toBeHidden()
  }

  async expectLogged(title: string): Promise<void> {
    await expect(this.entry(title)).toBeVisible()
  }

  async expectTotal(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible()
  }
}
