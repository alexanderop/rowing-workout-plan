import { describe } from 'vitest'
import { it } from '../fixtures'
import { assertNoViolations, assertNoPageLevelViolations } from '../helpers/a11y'
import { stubInstallPromptAvailable } from '../helpers/installEvent'
import { stubUpdateAvailable } from '../helpers/pwaUpdate'
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

  it(`${SWEEPS.notesHome} has no violations`, async ({ notes, theme }) => {
    await applyTheme(theme)

    await assertNoViolations(notes.container)
  })

  it(`${SWEEPS.notesHomeWithNote} has no violations`, async ({ notes, theme }) => {
    await applyTheme(theme)
    // The empty state is what the plain notes-home sweep grades, so a note has
    // to be created for NoteCard to be on screen at all. Pinned, because that
    // is the card's other half: a "Pinned" marker and an Unpin control.
    await notes.addNote({ title: 'Quarterly plan', body: 'Ship the offline sync.' })
    await notes.pinNote('Quarterly plan')
    await notes.expectPinned('Quarterly plan')

    await assertNoViolations(notes.container)
  })

  it(`${SWEEPS.toast} has no violations`, async ({ notes, theme }) => {
    await applyTheme(theme)
    // A toast is only ever on screen for a moment, which is exactly why it is
    // swept: it is the one piece of UI a reviewer never sits and looks at.
    await notes.addNote({ title: 'Groceries' })
    await notes.deleteNote('Groceries')
    await notes.expectToast('Note deleted')

    await assertNoViolations(notes.container)
  })

  it(`${SWEEPS.settings} has no violations`, async ({ settings, theme }) => {
    await applyTheme(theme)

    await assertNoViolations(settings.container)
  })

  it(`${SWEEPS.quickAdd} has no violations`, async ({ notes, theme }) => {
    await applyTheme(theme)
    // openQuickAdd waits for the lazy-loaded sheet, so axe gets it mounted.
    await notes.openQuickAdd()

    await assertNoViolations(notes.quickAdd.root.element())
  })

  it(`${SWEEPS.installBanner} has no violations`, async ({ notes, theme }) => {
    await applyTheme(theme)
    stubInstallPromptAvailable()
    await notes.install.expectVisible()

    await assertNoViolations(notes.container)
  })

  it(`${SWEEPS.installDialog} has no violations`, async ({ notes, theme }) => {
    await applyTheme(theme)
    stubInstallPromptAvailable()
    await notes.install.expectVisible()
    // openDialog waits for the lazy-loaded dialog, so axe gets it mounted.
    await notes.install.openDialog()

    await assertNoViolations(notes.install.dialog.element())
  })

  it(`${SWEEPS.updateBanner} has no violations`, async ({ notes, theme }) => {
    await applyTheme(theme)
    stubUpdateAvailable()
    await notes.update.expectVisible()

    await assertNoViolations(notes.container)
  })
})

// Container-scoped sweeps skip every rule axe classifies as page-level —
// landmark structure, heading-one, region. These run against the document
// so they actually execute; see the helper for what is and isn't included.
describe('page structure', () => {
  it('notes home has a sound page structure', async ({ notes }) => {
    await assertNoPageLevelViolations(notes)
  })

  it('settings has a sound page structure', async ({ settings }) => {
    await assertNoPageLevelViolations(settings)
  })
})
