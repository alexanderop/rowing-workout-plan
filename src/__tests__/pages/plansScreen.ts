import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'
import { BenchmarkSheet } from './benchmarkSheet'

/**
 * The plans screen (`PlansView.vue`) — where the app opens.
 *
 * It has two shapes and the tests need both: without a 2k it is a single
 * prompt for one, and with a 2k it is the active plan plus the browse list.
 * Which one is on screen is a *seeding* question, not a navigation one, so
 * the fixture that opens this takes the seed rather than the screen exposing
 * a "set up" method that mounts twice.
 */
export class PlansScreen extends AppScreen {
  static async open(): Promise<PlansScreen> {
    const app = await renderApp('/plans')
    return new PlansScreen(app.container, app.cleanup)
  }

  /** The sheet the two entry points below both open. */
  readonly benchmark = new BenchmarkSheet()

  /** The route's own h1, rendered by the page layout. */
  get heading(): Locator {
    return page.getByRole('heading', { name: 'Plans', level: 1 })
  }

  /** The prompt that stands in for the whole screen until a 2k exists. */
  get benchmarkPrompt(): Locator {
    return page.getByRole('heading', { name: 'Start with a 2k', level: 2 })
  }

  /**
   * The card naming the plan you are on, which is also the way into it.
   * Located by the link's own label rather than by its text: the card is one
   * control, so what a screen reader announces is what a test should ask for.
   */
  activePlan(week: number, name: string): Locator {
    return page.getByRole('link', { name: `Open week ${week} of ${name}` })
  }

  /** Follow the active card into the week it points at. */
  async openActivePlan(week: number, name: string): Promise<void> {
    await this.activePlan(week, name).click()
  }

  /** What stands in for the active card before you have enrolled. */
  get noPlanYet(): Locator {
    return page.getByText('No plan yet')
  }

  /** How far into the plan the active card claims you are. */
  get progress(): Locator {
    return page.getByRole('progressbar')
  }

  /** One browse card, by the accessible name that says what tapping it does. */
  planCard(name: string): Locator {
    return page.getByRole('button', { name: `Start ${name}` })
  }

  /** Enrol in a plan the way a user does: tap its card. */
  async enrol(name: string): Promise<void> {
    await this.planCard(name).click()
  }

  /** Open the sheet from the empty state — the onboarding entry point. */
  async enterBenchmark(): Promise<void> {
    await page.getByRole('button', { name: 'Enter your 2k' }).click()
    await this.benchmark.expectOpen()
  }

  /** Open the same sheet from the footer row, once a 2k already exists. */
  async changeBenchmark(): Promise<void> {
    await page.getByRole('button', { name: 'Change' }).click()
    await this.benchmark.expectOpen()
  }

  /** On screen and laid out — what a sweep over the rendered page needs. */
  readonly expectReady = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.heading).toBeVisible()
  })

  /** The screen in its onboarding shape: nothing but the ask for a 2k. */
  readonly expectAsksForBenchmark = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.benchmarkPrompt).toBeVisible()
  })

  /** The line that says which 2k every target on the screen came from. */
  readonly expectPacedFrom = vi.defineHelper(async (time: string): Promise<void> => {
    await expect.element(page.getByText(`Paced from your 2k of ${time}`)).toBeVisible()
  })

  readonly expectProgress = vi.defineHelper(async (summary: string): Promise<void> => {
    await expect.element(page.getByText(summary)).toBeVisible()
  })
}
