import { describe, expect } from 'vitest'
import { userEvent } from 'vitest/browser'
import { it } from '../../fixtures'

/**
 * Where the keyboard goes when the quick-add sheet opens, while it is open,
 * and after it closes.
 *
 * This is the layer the rest of the suite does not have. The a11y tier asks
 * whether the markup breaks a rule (axe) and whether the accessibility tree
 * still says what it should (ARIA snapshots); neither can tell you whether a
 * keyboard user can actually operate the thing. A dialog with impeccable
 * ARIA that drops focus onto `<body>` and never gives it back passes both and
 * is unusable — and it is the regression portalled content produces, because
 * the DOM node the user came from is nowhere near the node they end up in.
 *
 * These are also the assertions a real browser exists for. jsdom has no
 * sequential focus navigation at all, so a Tab there moves nothing and the
 * only thing a test could assert was `event.defaultPrevented` — the
 * implementation detail that stood in for the contract. Here `userEvent.tab()`
 * is a real Tab and the question is simply where focus went.
 *
 * The contract is asserted through the notes feature rather than against a
 * bare `MoleculeDialog` harness because a trigger is half of it: "focus goes
 * back" needs somewhere to go back *to*, and the FAB is the real one.
 *
 * The desktop half of the contract lives here. Its touch half is the
 * opposite claim and lives in `touch/sheetFocus.spec.ts`, since only that
 * tier matches `(pointer: coarse)`.
 */
describe('quick-add sheet focus', () => {
  it('moves focus into the sheet when it opens', async ({ notes }) => {
    await notes.openQuickAdd()

    // With a fine pointer there is no on-screen keyboard to race, so the
    // sheet takes reka-ui's default autofocus and lands on the first field.
    await expect.element(notes.quickAdd.title).toHaveFocus()
  })

  it('keeps Tab inside the sheet', async ({ notes }) => {
    await notes.openQuickAdd()

    // Title → Note → Save → and round again. Twice round the sheet's own
    // stops, which is more than enough for a trap-less dialog to leak: focus
    // would walk out into the shell behind the overlay within three.
    for (let index = 0; index < 6; index += 1) await userEvent.tab()

    notes.quickAdd.expectHoldsFocus()
  })

  /**
   * The other half of "modal", and the half a focus test cannot see. Trapping
   * the keyboard is not enough on its own: a screen-reader user browsing by
   * role would still walk the tab bar and the note list behind the sheet, and
   * a dialog with a perfect trap can still leave all of it readable.
   *
   * Worth pinning because it is not code anybody here wrote — it is reka-ui
   * marking the app root `aria-hidden` while a modal is open, which is a
   * default that turning off `modal` or portalling differently would silently
   * take away. The assertion is a *count*: "the tab bar is gone from the
   * accessibility tree", which is what a role query answers and no attribute
   * probe on the nav itself would, since the attribute lands on an ancestor.
   */
  it('hides the rest of the app from assistive technology while it is open', async ({ notes }) => {
    await expect.element(notes.tabBar).toBeVisible()

    await notes.openQuickAdd()

    // Still on screen, still pixel-for-pixel there — and no longer reachable
    // by role, which is the only sense in which a modal "hides" its backdrop.
    expect(notes.tabBar.query()).toBeNull()

    await notes.quickAdd.dismiss()
    await expect.element(notes.tabBar).toBeVisible()
  })

  it('hands focus back to the button that opened it', async ({ notes }) => {
    await notes.openQuickAdd()
    await notes.quickAdd.dismiss()

    await expect.element(notes.addButton).toHaveFocus()
  })
})
