import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** What the quick-add form can be filled with — the body is optional. */
export interface NoteDraftInput {
  title: string
  body?: string
}

/**
 * The quick-add sheet (`QuickAddNoteSheet.vue`), owned by `NotesPage`. It is
 * dialog-portalled to the end of the body, so it is queried from the page
 * rather than from anything the notes screen renders.
 */
export class QuickAddSheet {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByRole('dialog')
  }

  get title(): Locator {
    return this.page.getByLabel('Title', { exact: true })
  }

  get body(): Locator {
    return this.page.getByLabel('Note', { exact: true })
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save' })
  }

  async fill(draft: Partial<NoteDraftInput>): Promise<void> {
    if (draft.title !== undefined) await this.title.fill(draft.title)
    if (draft.body !== undefined) await this.body.fill(draft.body)
  }

  async save(): Promise<void> {
    await this.saveButton.click()
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toBeHidden()
  }
}
