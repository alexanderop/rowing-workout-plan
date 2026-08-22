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
