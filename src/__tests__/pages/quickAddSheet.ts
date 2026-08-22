import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page, userEvent } from 'vitest/browser'

/** An element named the way a reader can find it back in the source. */
function describeElement(element: Element | null): string {
  if (!element) return 'nothing'
  const name = element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 40) ?? ''
  return `<${element.tagName.toLowerCase()}>${name ? ` "${name}"` : ''}`
}

/** What the quick-add form can be filled with — the body is optional. */
export interface NoteDraftInput {
  title: string
  body?: string
}

/**
 * The quick-add sheet (`QuickAddNoteSheet.vue`), as a test drives it.
 *
 * Owned by `NotesScreen` rather than opened directly: it is a part of that
 * screen, and it is dialog-portalled outside the mounted container, which is
 * why every locator here is queried from `page`.
 */
export class QuickAddSheet {
  get root(): Locator {
    return page.getByRole('dialog')
  }

  // Both labels are short enough that a future field would collide under
  // substring matching — "Note" is a prefix of "Notes", "Title" of anything.
  // `browser.locators.exact` in vitest.config.ts is what makes them safe, so
  // no call site here spells it out.
  get title(): Locator {
    return page.getByLabelText('Title')
  }

  get body(): Locator {
    return page.getByLabelText('Note')
  }

  get saveButton(): Locator {
    return page.getByRole('button', { name: 'Save' })
  }

  async fill(draft: Partial<NoteDraftInput>): Promise<void> {
    if (draft.title !== undefined) await this.title.fill(draft.title)
    if (draft.body !== undefined) await this.body.fill(draft.body)
  }

  async save(): Promise<void> {
    await this.saveButton.click()
  }

  /**
   * Press Save without waiting for it to become enabled — the tap a user can
   * make on a greyed-out button, and the only way to find out whether the
   * platform really refuses it. `force` skips the actionability wait, not the
   * gesture: Chromium delivers `pointerdown` and then declines to follow it
   * with a click. Without `force`, `click()` would wait out `actionTimeout`
   * and fail on "element is not enabled" — which asserts nothing.
   */
  async pressSaveIgnoringDisabled(): Promise<void> {
    await this.saveButton.click({ force: true })
  }

  /**
   * Two submits in the same tick — the double-tap a user can actually
   * produce, before the first write has resolved. Two awaited clicks cannot
   * express it: they serialise, and the second one lands after the sheet has
   * already closed. Hence the form element.
   */
  submitTwiceInOneTick(): void {
    const form = this.saveButton.element().closest('form')
    if (!(form instanceof HTMLFormElement)) throw new Error('quick-add form not found')
    form.requestSubmit()
    form.requestSubmit()
  }

  /** Escape stands in for the accidental tap on the overlay. */
  async dismiss(): Promise<void> {
    await userEvent.keyboard('{Escape}')
    await this.expectClosed()
  }

  /**
   * Open *and usable*, which is the only state a caller can act on.
   *
   * `toBeVisible` alone would pass for a sheet whose Save button sits below
   * the fold — visible in the CSS sense, unreachable on the device. On a
   * keyboard-shrunk viewport that is the actual failure mode, so the wait
   * that gates every interaction asserts the primary action is really on
   * screen (`toBeInViewport`, Vitest 4.0).
   */
  readonly expectReady = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.root).toBeVisible()
    await expect.element(this.saveButton).toBeInViewport()
  })

  readonly expectClosed = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.root).not.toBeInTheDocument()
  })

  /**
   * Focus is somewhere inside the sheet — the focus trap's contract.
   *
   * The one assertion here that cannot be a locator matcher: `toHaveFocus`
   * asks about a single element, and a trap is a claim about a subtree. The
   * read is synchronous on purpose, because the preceding `userEvent.tab()`
   * has already resolved and "focus is here *now*" is the contract — a
   * retrying matcher would widen it to "focus arrives here eventually",
   * which a leaking dialog also satisfies on its way past.
   *
   * The failure message names what stole focus, since `expected false to be
   * true` is useless for this and the answer is always the interesting part.
   */
  readonly expectHoldsFocus = vi.defineHelper((): void => {
    expect(
      this.root.element().contains(document.activeElement),
      `focus escaped the sheet — it is on ${describeElement(document.activeElement)}`,
    ).toBe(true)
  })

  /** What the form is holding — the draft survives a dismissal on purpose. */
  readonly expectDraft = vi.defineHelper(async (draft: NoteDraftInput): Promise<void> => {
    await expect.element(this.title).toHaveValue(draft.title)
    if (draft.body !== undefined) await expect.element(this.body).toHaveValue(draft.body)
  })
}
