import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'

/**
 * One week of a plan (`PlanWeekView.vue`) — the densest screen in the app:
 * a week strip, the rotation explainer, and six sessions each carrying a
 * derived target.
 *
 * Reachable two ways, and both are worth driving: `open()` deep-links the way
 * a bookmark does, and the plans screen's active card navigates the way a
 * thumb does.
 */
export class PlanWeekScreen extends AppScreen {
  static async open(planId: string, week: number): Promise<PlanWeekScreen> {
    const app = await renderApp(`/plans/${planId}/weeks/${week}`)
    return new PlanWeekScreen(app.container, app.cleanup)
  }

  /**
   * The same screen, reached by navigating an app that is already mounted.
   *
   * A journey through three routes is one mount, not three: the router is
   * what is under test, so remounting at each step would skip the part that
   * can break. Closing is the opening screen's job, which is why this one
   * hands back a no-op teardown.
   */
  static within(app: AppScreen): PlanWeekScreen {
    return new PlanWeekScreen(app.container, () => undefined)
  }

  /** The route's own h1 — "Week 3". */
  heading(week: number): Locator {
    return page.getByRole('heading', { name: `Week ${week}`, level: 1 })
  }

  /** The strip of every week in the plan. */
  get weekStrip(): Locator {
    return page.getByRole('list', { name: /^Weeks of / })
  }

  /** One chip in the strip. */
  weekChip(week: number): Locator {
    return this.weekStrip.getByRole('link', { name: `Week ${week}` })
  }

  /** The line that says where this week sits in the three-week cycle. */
  get rotationNote(): Locator {
    return page.getByText(/rotation|Last week of the plan/)
  }

  /** The week summary, which doubles as the session list's heading. */
  get summary(): Locator {
    return page.getByRole('heading', { level: 2 })
  }

  /** One session row, by the sentence it is written as. */
  sessionRow(title: string): Locator {
    return page.getByRole('link').filter({ hasText: title })
  }

  async openSession(title: string): Promise<void> {
    await this.sessionRow(title).first().click()
  }

  async openWeek(week: number): Promise<void> {
    await this.weekChip(week).click()
  }

  readonly expectReady = vi.defineHelper(async (week: number): Promise<void> => {
    await expect.element(this.heading(week)).toBeVisible()
  })

  /** The target the row prints — a split, or a band for a steady row. */
  readonly expectTarget = vi.defineHelper(async (title: string, target: string): Promise<void> => {
    await expect.element(this.sessionRow(title).first()).toHaveTextContent(target)
  })
}
