import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'
import { LogWorkoutSheet } from './logWorkoutSheet'

/** One session (`SessionView.vue`): its targets, its pieces, its coaching note. */
export class SessionScreen extends AppScreen {
  static async open(sessionId: string): Promise<SessionScreen> {
    const app = await renderApp(`/sessions/${sessionId}`)
    return new SessionScreen(app.container, app.cleanup)
  }

  /**
   * The same screen, reached by navigating an app that is already mounted.
   *
   * A journey through three routes is one mount, not three: the router is
   * what is under test, so remounting at each step would skip the part that
   * can break. Closing is the opening screen's job, which is why this one
   * hands back a no-op teardown.
   */
  static within(app: AppScreen): SessionScreen {
    return new SessionScreen(app.container, () => undefined)
  }

  /** The sheet this screen opens to write the session into the log. */
  readonly sheet = new LogWorkoutSheet()

  /** Log this session — the write that advances the plan. */
  async logSession(): Promise<void> {
    await page.getByRole('button', { name: 'Log this session' }).click()
    await this.sheet.expectOpen('Log this session')
  }

  /** The route's own h1 — the session written out, e.g. "6 × 1k / 1′ rest". */
  heading(title: string): Locator {
    return page.getByRole('heading', { name: title, level: 1 })
  }

  /**
   * The three-figure targets card, as the named region it is. Absent until a
   * 2k exists — which is the state the "no benchmark" assertions look for.
   */
  get targets(): Locator {
    return page.getByRole('region', { name: /^Targets from your 2k of / })
  }

  /**
   * One row of the per-rep list, by the ordinal only a screen reader gets —
   * the visible digit is `aria-hidden`, so the hidden label is the honest
   * handle. `.first()` because "Rep 1" would also be inside a "Rep 10" the
   * day a session has one; DOM order settles it either way.
   */
  rep(index: number): Locator {
    return page
      .getByRole('listitem')
      .filter({ hasText: `Rep ${index}` })
      .first()
  }

  readonly expectReady = vi.defineHelper(async (title: string): Promise<void> => {
    await expect.element(this.heading(title)).toBeVisible()
  })

  /**
   * One figure on the targets card. Scoped to the card because the same split
   * appears on every rep below it — six times for a 6 × 1k, which is the
   * point of the per-rep list and would make an unscoped query ambiguous.
   */
  readonly expectStat = vi.defineHelper(async (value: string): Promise<void> => {
    await expect.element(this.targets).toHaveTextContent(value)
  })

  /**
   * The rotation's coaching line. `exact: false` because the caller names the
   * half of the sentence that carries the meaning — vitest's `getByText`
   * matches the whole text node otherwise.
   */
  readonly expectCoachingNote = vi.defineHelper(async (text: string): Promise<void> => {
    await expect.element(page.getByText(text, { exact: false })).toBeVisible()
  })
}
