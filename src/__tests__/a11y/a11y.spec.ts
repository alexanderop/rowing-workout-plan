import { describe } from 'vitest'
import { it } from '../fixtures'
import { assertNoViolations, assertNoPageLevelViolations } from '../helpers/a11y'
import { stubInstallPromptAvailable } from '../helpers/installEvent'
import { stubUpdateAvailable } from '../helpers/pwaUpdate'
import { EMPTY_BACKUP } from '../helpers/backup'
import { SWEEPS } from './coverage'

/**
 * Every sweep runs in both themes.
 *
 * Contrast is the reason. `color-contrast` is the rule this tier reports most
 * often and the only one whose result depends on which palette is live, so a
 * single-theme sweep grades half the app: a token pair that fails only in dark
 * mode passes a light-only run, and dark mode is the one nobody screenshots by
 * accident. It doubles the tier's runtime, which for a handful of sweeps is
 * worth it. Structure sweeps are not repeated — landmarks do not change colour.
 */
const THEMES = ['light', 'dark'] as const

describe.each(THEMES)('accessibility, %s theme', (mode) => {
  /** The fixture puts the class back afterwards, so nothing here has to. */
  async function applyTheme(theme: { dark: () => Promise<void> }): Promise<void> {
    if (mode === 'dark') await theme.dark()
  }

  it(`${SWEEPS.settings} has no violations`, async ({ settings, theme }) => {
    await applyTheme(theme)
    await settings.expectReady()

    await assertNoViolations(settings.container)
  })

  it(`${SWEEPS.toast} has no violations`, async ({ settings, theme }) => {
    await applyTheme(theme)
    // A toast is only ever on screen for a moment, which is exactly why it is
    // swept: it is the one piece of UI a reviewer never sits and looks at.
    await settings.importBackup(EMPTY_BACKUP)
    await settings.expectToast('Data imported')

    await assertNoViolations(settings.container)
  })

  it(`${SWEEPS.installBanner} has no violations`, async ({ settings, theme }) => {
    await applyTheme(theme)
    stubInstallPromptAvailable()
    await settings.install.expectVisible()

    await assertNoViolations(settings.container)
  })

  it(`${SWEEPS.installDialog} has no violations`, async ({ settings, theme }) => {
    await applyTheme(theme)
    stubInstallPromptAvailable()
    await settings.install.expectVisible()
    // openDialog waits for the lazy-loaded dialog, so axe gets it mounted.
    await settings.install.openDialog()

    await assertNoViolations(settings.install.dialog.element())
  })

  it(`${SWEEPS.updateBanner} has no violations`, async ({ settings, theme }) => {
    await applyTheme(theme)
    stubUpdateAvailable()
    await settings.update.expectVisible()

    await assertNoViolations(settings.container)
  })
})

// Container-scoped sweeps skip every rule axe classifies as page-level —
// landmark structure, heading-one, region. These run against the document
// so they actually execute; see the helper for what is and isn't included.
describe('page structure', () => {
  it('settings has a sound page structure', async ({ settings }) => {
    await assertNoPageLevelViolations(settings)
  })
})
