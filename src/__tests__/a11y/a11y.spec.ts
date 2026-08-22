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

  /** The canvas's worked example, so the sweep grades real numbers. */
  const BENCHMARK_2K_MS = 424_200

  it(`${SWEEPS.plansWithoutBenchmark} has no violations`, async ({ plans, theme }) => {
    await applyTheme(theme)
    // The first screen a new user sees, and the only one with nothing on it
    // but a prompt — so it is the one most likely to be a heading with no
    // section around it.
    const screen = await plans()
    await screen.expectAsksForBenchmark()

    await assertNoViolations(screen.container)
  })

  it(`${SWEEPS.plans} has no violations`, async ({ plans, theme }) => {
    await applyTheme(theme)
    const screen = await plans({ benchmark2kMs: BENCHMARK_2K_MS, planId: 'pete5k' })
    await screen.expectReady()

    await assertNoViolations(screen.container)
  })

  it(`${SWEEPS.benchmarkSheet} has no violations`, async ({ plans, theme }) => {
    await applyTheme(theme)
    // Opened from the empty state rather than from the footer row: it is the
    // path a first-time user takes, and the one where the sheet is the only
    // thing on screen.
    const screen = await plans()
    await screen.enterBenchmark()

    // Framed on the dialog: it is portalled outside the screen's subtree.
    await assertNoViolations(screen.benchmark.dialog.element())
  })

  it(`${SWEEPS.today} has no violations`, async ({ today, theme }) => {
    await applyTheme(theme)
    const screen = await today({ benchmark2kMs: BENCHMARK_2K_MS, planId: 'pete5k' })
    await screen.expectReady()

    await assertNoViolations(screen.container)
  })

  it(`${SWEEPS.log} has no violations`, async ({ log, theme }) => {
    await applyTheme(theme)
    // One planned row and one free one, so both branches of the row's title
    // are on screen — and the filter chips, which carry `aria-pressed`.
    const screen = await log({
      benchmark2kMs: BENCHMARK_2K_MS,
      planId: 'pete5k',
      workouts: [{ planSessionId: 'pete5k-w1-s2', distanceM: 4000 }, { distanceM: 10_000 }],
    })
    await screen.expectReady()

    await assertNoViolations(screen.container)
  })

  it(`${SWEEPS.logSheet} has no violations`, async ({ log, theme }) => {
    await applyTheme(theme)
    const screen = await log()
    await screen.logRow()

    // Framed on the dialog: it is portalled outside the screen's subtree.
    await assertNoViolations(screen.sheet.anyDialog.element())
  })

  it(`${SWEEPS.planWeek} has no violations`, async ({ planWeek, theme }) => {
    await applyTheme(theme)
    // Week 3 of the full plan: six rows, a twelve-chip strip and a rotation
    // note — the densest screen in the app, and the one with the most colour
    // on it (a target on every row, in muted text over a card).
    const screen = await planWeek('pete5k', 3, { benchmark2kMs: BENCHMARK_2K_MS })
    await screen.expectReady(3)

    await assertNoViolations(screen.container)
  })

  it(`${SWEEPS.session} has no violations`, async ({ sessionDetail, theme }) => {
    await applyTheme(theme)
    const screen = await sessionDetail('pete5k-w3-s2', { benchmark2kMs: BENCHMARK_2K_MS })
    await screen.expectReady('6 × 1k / 1′ rest')

    await assertNoViolations(screen.container)
  })

  it(`${SWEEPS.settings} has no violations`, async ({ settings, theme }) => {
    await applyTheme(theme)
    await settings.expectReady()

    await assertNoViolations(settings.container)
  })

  it(`${SWEEPS.deleteDataDialog} has no violations`, async ({ settings, theme }) => {
    await applyTheme(theme)
    // The one dialog in the app whose whole job is to be read before it is
    // answered, and the only place a `destructive` button is on screen — so
    // it is the one place the destructive palette's contrast is graded.
    await settings.openDeleteDialog()

    // Framed on the dialog: it is portalled outside the screen's subtree.
    await assertNoViolations(settings.deleteDialog.element())
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

  it('today has a sound page structure', async ({ today }) => {
    const screen = await today({ benchmark2kMs: 424_200, planId: 'pete5k' })
    await screen.expectReady()

    await assertNoPageLevelViolations(screen)
  })

  it('the log has a sound page structure', async ({ log }) => {
    const screen = await log({ workouts: [{ distanceM: 10_000 }] })
    await screen.expectReady()

    await assertNoPageLevelViolations(screen)
  })

  it('a plan week has a sound page structure', async ({ planWeek }) => {
    const screen = await planWeek('pete5k', 3, { benchmark2kMs: 424_200 })
    await screen.expectReady(3)

    await assertNoPageLevelViolations(screen)
  })

  it('a session has a sound page structure', async ({ sessionDetail }) => {
    const screen = await sessionDetail('pete5k-w3-s2', { benchmark2kMs: 424_200 })
    await screen.expectReady('6 × 1k / 1′ rest')

    await assertNoPageLevelViolations(screen)
  })

  it('plans has a sound page structure', async ({ plans }) => {
    const screen = await plans({ benchmark2kMs: 424_200, planId: 'pete5k' })
    await screen.expectReady()

    await assertNoPageLevelViolations(screen)
  })
})
