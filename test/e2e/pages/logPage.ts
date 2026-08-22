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

    await this.sheet.getByRole('textbox', { name: 'Distance in metres' }).fill(distance)
    await this.sheet.getByRole('textbox', { name: 'Time', exact: true }).fill(time)
    await this.sheet.getByRole('button', { name: 'Save' }).click()

    await expect(this.sheet).toBeHidden()
  }

  async expectLogged(title: string): Promise<void> {
    await expect(this.entry(title)).toBeVisible()
  }

  async expectTotal(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible()
  }
}
