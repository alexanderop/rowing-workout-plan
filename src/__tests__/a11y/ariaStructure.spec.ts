import { describe, expect } from 'vitest'
import { it } from '../fixtures'
import { stubInstallPromptAvailable } from '../helpers/installEvent'

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
  it('the tab bar names every destination', async ({ settings }) => {
    await settings.expectReady()

    await expect.element(settings.tabBar).toMatchAriaSnapshot()
  })

  it('the delete-everything confirmation names both ways out', async ({ settings }) => {
    // The one dialog in the app where the *shape* is the safety: a named
    // dialog, the warning as its description, and two buttons that say which
    // is which. A confirm that loses its description, or whose cancel stops
    // being a button, is still a dialog axe has nothing to say about.
    await settings.openDeleteDialog()

    await expect.element(settings.deleteDialog).toMatchAriaSnapshot()
  })

  it('the install dialog is a labelled dialog with described steps', async ({ settings }) => {
    stubInstallPromptAvailable()
    await settings.install.expectVisible()
    await settings.install.openDialog()

    await expect.element(settings.install.dialog).toMatchAriaSnapshot()
  })
})
