import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'
import { LogWorkoutSheet } from './logWorkoutSheet'

/** Everything you have rowed (`LogView.vue`): month totals, filters, weeks. */
export class LogScreen extends AppScreen {
  static async open(): Promise<LogScreen> {
    const app = await renderApp('/log')
    return new LogScreen(app.container, app.cleanup)
  }

  static within(app: AppScreen): LogScreen {
    return new LogScreen(app.container, () => undefined)
  }

  readonly sheet = new LogWorkoutSheet()

  get heading(): Locator {
    return page.getByRole('heading', { name: 'Log', level: 1 })
  }

  /** The month totals card. */
  get totals(): Locator {
    return page.getByRole('definition')
  }

  /** One filter chip, by the word on it. */
  filter(label: string): Locator {
    return page.getByRole('button', { name: label, exact: true })
  }

  /** One week heading — "This week", "Last week", "Earlier". */
  bucket(label: string): Locator {
    return page.getByRole('heading', { name: label, level: 2 })
  }

  /** One logged row, by the sentence it is written as. */
  entry(title: string): Locator {
    return page.getByRole('article').filter({ hasText: title })
  }

  async chooseFilter(label: string): Promise<void> {
    await this.filter(label).click()
  }

  async logRow(): Promise<void> {
    await page.getByRole('button', { name: 'Log a row' }).click()
    await this.sheet.expectOpen('Log a row')
  }

  readonly expectReady = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.heading).toBeVisible()
  })

  readonly expectTotals = vi.defineHelper(async (...values: Array<string>): Promise<void> => {
    for (const value of values) await expect.element(page.getByText(value)).toBeVisible()
  })
}
