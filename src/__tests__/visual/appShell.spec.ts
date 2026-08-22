import { describe, expect } from 'vitest'
import { it } from '../fixtures'

/**
 * Screenshot baselines live in __screenshots__/ next to this file and are
 * platform-specific. Regenerate deliberately with `pnpm test:visual:update`
 * after intentional UI changes — see docs/testing-strategy.md.
 */
describe('visual regression', () => {
  it('app shell, light', async ({ notes }) => {
    await notes.expectNoNotes()

    await expect(notes.root).toMatchScreenshot('app-shell-light')
  })

  it('app shell, dark', async ({ notes, theme }) => {
    await notes.expectNoNotes()

    await theme.dark()

    await expect(notes.root).toMatchScreenshot('app-shell-dark')
  })

  /**
   * The sheet has its own baseline because it had none, and that is exactly
   * how every bottom sheet in the app shipped with zero bottom padding: the
   * two baselines above are the notes screen with the sheet closed, so a
   * visually obvious bug had nothing looking at it. One screenshot covers the
   * whole class of sheet-geometry regressions.
   *
   * Framed on the sheet rather than on `notes.root`: DialogContent mounts its
   * own portal, so the sheet is not inside the app subtree — and the sheet's
   * own box is what carries the geometry, since it is `fixed` to the bottom
   * edge and its bottom padding is inside it.
   */
  it('quick-add sheet, open', async ({ notes }) => {
    await notes.openQuickAdd()

    await expect(notes.quickAdd.root).toMatchScreenshot('quick-add-sheet-open')
  })
})
