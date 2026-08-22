import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'
import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'
import type { NoteDraftInput } from './quickAddSheet'
import { QuickAddSheet } from './quickAddSheet'

/**
 * The notes home screen (`NotesView.vue`) plus the quick-add sheet it opens.
 * See `appScreen.ts` for what a screen object is and is not.
 */
export class NotesScreen extends AppScreen {
  readonly quickAdd = new QuickAddSheet()

  static async open(): Promise<NotesScreen> {
    const app = await renderApp('/')
    return new NotesScreen(app.container, app.cleanup)
  }

  /** A note, addressed the way a user finds it: by the title on its card. */
  note(title: string): Locator {
    return page.getByRole('heading', { name: title })
  }

  /** The route's own h1. Chrome, and nothing local suppresses selection on it. */
  get heading(): Locator {
    return page.getByRole('heading', { name: 'Notes', level: 1 })
  }

  /**
   * The prose a user wrote on a card — the one thing on this screen that is
   * not chrome, and so the one thing that stays selectable.
   */
  noteBody(body: string): Locator {
    return page.getByText(body)
  }

  get emptyState(): Locator {
    return page.getByText('No notes yet')
  }

  /**
   * The center FAB. Exposed rather than inlined into `openQuickAdd` because
   * it is also the *target* of a contract: a modal has to hand focus back to
   * whatever opened it, so a spec needs to name the trigger to assert that.
   */
  get addButton(): Locator {
    return page.getByRole('button', { name: 'Add a note' })
  }

  async openQuickAdd(): Promise<void> {
    await this.addButton.click()
    // The sheet is lazy-loaded (App.vue), so it is not on screen the moment
    // the button is clicked — every caller would otherwise wait for it.
    await this.quickAdd.expectReady()
  }

  /** The whole capture journey: open the sheet, type the draft, save it. */
  async addNote(draft: NoteDraftInput): Promise<void> {
    await this.openQuickAdd()
    await this.quickAdd.fill(draft)
    await this.quickAdd.save()
    // The sheet closes itself only once the write has landed, so waiting for
    // it to go is what makes a second addNote() safe to call straight after.
    await this.quickAdd.expectClosed()
  }

  async deleteNote(title: string): Promise<void> {
    await page.getByRole('button', { name: `Delete note ${title}` }).click()
  }

  async pinNote(title: string): Promise<void> {
    await page.getByRole('button', { name: `Pin note ${title}` }).click()
  }

  readonly expectNote = vi.defineHelper(async (title: string): Promise<void> => {
    await expect.element(this.note(title)).toBeVisible()
  })

  readonly expectNoNotes = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.emptyState).toBeVisible()
  })

  /** A pinned note offers to be unpinned — that is the state, visibly. */
  readonly expectPinned = vi.defineHelper(async (title: string): Promise<void> => {
    await expect.element(page.getByRole('button', { name: `Unpin note ${title}` })).toBeVisible()
  })

  /** The list top to bottom. Pinning is about order, so assert the order. */
  readonly expectOrder = vi.defineHelper(async (titles: ReadonlyArray<string>): Promise<void> => {
    // Scoped to the list rather than matching every level-2 heading on the
    // page: a card's title is an h2 (it sits under the view's h1), and so are
    // the empty state's and every settings section's.
    const headings = page.getByRole('list').getByRole('heading', { level: 2 })
    await expect
      .poll(async () =>
        (await headings.all()).map((heading) => heading.element().textContent?.trim()),
      )
      .toEqual(titles)
  })
}
