import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { AppPage } from './appPage'
import type { NoteDraftInput } from './quickAddSheet'
import { QuickAddSheet } from './quickAddSheet'

/**
 * The notes home screen and the sheet it opens, against the production
 * build. See `appPage.ts` for what a page object owns here.
 */
export class NotesPage extends AppPage {
  readonly quickAdd: QuickAddSheet

  constructor(page: Page) {
    super(page)
    this.quickAdd = new QuickAddSheet(page)
  }

  /** A note, addressed the way a user finds it: by the title on its card. */
  note(title: string): Locator {
    return this.page.getByRole('heading', { name: title })
  }

  async openQuickAdd(): Promise<void> {
    await this.page.getByRole('button', { name: 'Add a note' }).click()
    // The sheet is lazy-loaded (App.vue) — off the startup chunk, so on a
    // cold e2e load this is a real network wait, not a tick.
    await expect(this.quickAdd.root).toBeVisible()
  }

  /** The whole capture journey: open the sheet, type the draft, save it. */
  async addNote(draft: NoteDraftInput): Promise<void> {
    await this.openQuickAdd()
    await this.quickAdd.fill(draft)
    await this.quickAdd.save()
    // The sheet closes itself only once the write has landed, so waiting for
    // it to go is what makes the next step safe to run.
    await this.quickAdd.expectClosed()
  }

  async expectNote(title: string): Promise<void> {
    await expect(this.note(title)).toBeVisible()
  }
}
