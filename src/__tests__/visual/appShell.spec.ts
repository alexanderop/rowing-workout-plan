import { describe, expect } from 'vitest'
import { it } from '../fixtures'
import { stubInstallPromptAvailable } from '../helpers/installEvent'

/**
 * Screenshot baselines live in __screenshots__/ next to this file and are
 * platform-specific. Regenerate deliberately with `pnpm test:visual:update`
 * after intentional UI changes — see docs/testing-strategy.md.
 */
describe('visual regression', () => {
  it('app shell, light', async ({ settings }) => {
    await settings.expectReady()

    await expect(settings.root).toMatchScreenshot('app-shell-light')
  })

  it('app shell, dark', async ({ settings, theme }) => {
    await settings.expectReady()

    await theme.dark()

    await expect(settings.root).toMatchScreenshot('app-shell-dark')
  })

  /**
   * The home screen, and the one baseline that is about a *screen* rather than
   * the shell around it: cards, badges and a progress bar are geometry the
   * other two frames do not contain, and a card that loses its padding is
   * invisible to every other tier.
   *
   * Light only, deliberately. The two frames above run in both themes because
   * what they grade is partly colour; what this grades is layout, which does
   * not change with the palette — and the a11y tier already sweeps this screen
   * in both themes for contrast.
   */
  it('plans, light', async ({ plans }) => {
    const screen = await plans({ benchmark2kMs: 424_200, planId: 'pete5k' })
    await screen.expectReady()

    await expect(screen.root).toMatchScreenshot('plans-light')
  })

  /**
   * A dialog has its own baseline because it had none, and that is exactly
   * how every bottom sheet in the app shipped with zero bottom padding: the
   * two baselines above are a screen with nothing open over it, so a visually
   * obvious bug had nothing looking at it. One screenshot covers the whole
   * class of sheet-geometry regressions.
   *
   * Framed on the dialog rather than on `settings.root`: DialogContent mounts
   * its own portal, so the sheet is not inside the app subtree — and the
   * sheet's own box is what carries the geometry, since it is `fixed` to the
   * bottom edge and its bottom padding is inside it.
   */
  it('install dialog, open', async ({ settings }) => {
    stubInstallPromptAvailable()
    await settings.install.expectVisible()
    await settings.install.openDialog()

    await expect(settings.install.dialog).toMatchScreenshot('install-dialog-open')
  })
})
