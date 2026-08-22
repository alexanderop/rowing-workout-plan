import { describe, expect } from 'vitest'
import { it } from '../fixtures'

/**
 * ARIA snapshots (Vitest 4.1, experimental): the accessibility tree of a
 * region, as text, compared against a committed baseline in `__snapshots__/`.
 *
 * The sibling `a11y.spec.ts` sweeps for *violations* — rules axe can name. It
 * passes just as happily when a `<nav>` quietly becomes a `<div>`, a heading
 * drops a level, or a dialog loses its accessible name: nothing is wrong, the
 * structure is simply gone. That regression is what these catch, and they
 * catch it in the terms a screen reader uses rather than in pixels, so the
 * diff is readable and there are no per-platform baselines to maintain.
 *
 * Keep them scoped to a region whose semantics are a promise — navigation and
 * dialogs. A snapshot of the whole app root would be re-recorded on every
 * copy change, and a baseline nobody reads is a baseline nobody trusts.
 * Rebaseline deliberately with `pnpm test:a11y -- --update`.
 */
describe('accessibility tree', () => {
  it('the tab bar names both destinations', async ({ notes }) => {
    await expect.element(notes.tabBar).toMatchAriaSnapshot()
  })

  it('the quick-add sheet is a labelled dialog with a labelled form', async ({ notes }) => {
    await notes.openQuickAdd()

    await expect.element(notes.quickAdd.root).toMatchAriaSnapshot()
  })
})
