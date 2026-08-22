import { describe, expect } from 'vitest'
import { it } from '../fixtures'

/**
 * What the quick-add sheet does with focus on a phone — which is the
 * opposite of what it does everywhere else, on purpose.
 *
 * `MoleculeDialogContent` intercepts reka-ui's `openAutoFocus` and cancels it
 * when the pointer is coarse. Autofocusing the first field would pop the
 * on-screen keyboard while the sheet is still animating in, and the keyboard
 * is what `useKeyboardInset` is busy measuring — so the sheet would be
 * sizing itself against a viewport that is changing underneath it. Focus goes
 * to the sheet itself instead, and the keyboard opens when the user taps a
 * field, which is the moment they asked for it.
 *
 * That branch is only reachable here. Every other browser project launches a
 * stock desktop Chromium where `(pointer: coarse)` is false, so the desktop
 * half of this contract (`features/notes/quickAddFocus.spec.ts`) exercises
 * the `if` and nothing exercised the `else` until this file.
 */
describe('quick-add sheet focus under a coarse pointer', () => {
  it('leaves focus on the sheet rather than opening the keyboard', async ({ notes }) => {
    // The tier assertion first, as every spec here does: without it this file
    // is a second desktop run that passes while grading the wrong branch.
    expect(matchMedia('(pointer: coarse)').matches).toBe(true)

    await notes.openQuickAdd()

    // Not the title field — that is the whole point of the branch.
    await expect.element(notes.quickAdd.title).not.toHaveFocus()
    // The sheet itself, so the keyboard has somewhere to go and the trap is
    // still armed. `document.body` would satisfy "not the title" too, and it
    // would be the bug: focus on the body means the next Tab starts from
    // outside the dialog.
    await expect.element(notes.quickAdd.root).toHaveFocus()
  })
})
