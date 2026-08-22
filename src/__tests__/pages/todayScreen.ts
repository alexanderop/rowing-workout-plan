import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'

/**
 * The home screen (`TodayView.vue`): what to row next, and the week it sits in.
 *
 * "Today" is the next unfinished session, not a date — which is why every
 * assertion here is about the session's own name rather than about a day.
 */
export class TodayScreen extends AppScreen {
  static async open(): Promise<TodayScreen> {
    const app = await renderApp('/')
    return new TodayScreen(app.container, app.cleanup)
  }

  /** The same screen, reached by navigating an app that is already mounted. */
  static within(app: AppScreen): TodayScreen {
    return new TodayScreen(app.container, () => undefined)
  }

  get heading(): Locator {
    return page.getByRole('heading', { name: 'Today', level: 1 })
  }

  /** The card naming the next session, by the link label that says what it opens. */
  session(title: string): Locator {
    return page.getByRole('link', { name: `Open ${title}` })
  }

  async openSession(title: string): Promise<void> {
    await this.session(title).click()
  }

  /** Where the plan says you are. */
  get position(): Locator {
    return page.getByText(/^Week \d+ of \d+ · Session \d+ of \d+$/)
  }

  readonly expectReady = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.heading).toBeVisible()
  })

  /** The session Today is offering — the one assertion the whole screen is for. */
  readonly expectNextSession = vi.defineHelper(async (title: string): Promise<void> => {
    await expect.element(this.session(title)).toBeVisible()
  })

  readonly expectPosition = vi.defineHelper(async (text: string): Promise<void> => {
    await expect.element(this.position).toHaveTextContent(text)
  })
}
