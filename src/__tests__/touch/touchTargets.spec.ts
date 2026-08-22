import { describe, expect } from 'vitest'
import { it } from '../fixtures'
import { stubInstallPromptAvailable } from '../helpers/installEvent'

/**
 * The 44px floor, asserted where it is actually observable.
 *
 * Sizing in this app is written touch-first and collapsed for a fine pointer
 * (`h-touch-target … pointer-fine:h-10`, see src/components/atoms/AtomButton.vue),
 * so on every other browser tier the collapsed value is what renders — a
 * desktop Chromium matches `pointer: fine`. That makes this the one tier that
 * measures what a phone gets, and the reason it exists as its own project
 * rather than as a spec somewhere: the condition comes from the browser
 * context, and `matchMedia` cannot be stubbed from inside the page.
 *
 * The a11y tier does not cover this and cannot: axe's `target-size` rule uses
 * the WCAG 2.2 AA floor of 24×24. A 40px button satisfies axe and fails us.
 */

/** Apple HIG's minimum hit area, and what `--spacing-touch-target` resolves to. */
const TOUCH_TARGET_MIN = 44

const INTERACTIVE = [
  'button',
  'a[href]',
  'select',
  'textarea',
  'input:not([type="hidden"])',
  '[role="button"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Controls that do not have to clear the floor, with the reason each one is
 * exempt — the `A11Y_SKIPPED` idiom. An exemption without a justification is
 * a hole with a comment shape.
 */
const EXEMPT: ReadonlyArray<{ selector: string; reason: string }> = [
  {
    selector: '[role="switch"]',
    reason:
      'reka SwitchRoot renders a 24x40 track, and growing it is a redesign of the primitive rather than a class collapse — a real gap, tracked rather than hidden. Its <Label for=…> makes the text a second target in the meantime.',
  },
]

interface Undersized {
  label: string
  width: number
  height: number
}

/**
 * Every control a user could tap, measured. Zero-size elements are skipped
 * rather than failed: a `display: none` file input and a control inside a
 * closed dialog are not targets, and failing them would make the sweep say
 * something it does not mean.
 */
function undersizedControls(root: ParentNode): Array<Undersized> {
  return [...root.querySelectorAll(INTERACTIVE)]
    .filter((element) => !EXEMPT.some(({ selector }) => element.matches(selector)))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .filter(({ rect }) => rect.width < TOUCH_TARGET_MIN || rect.height < TOUCH_TARGET_MIN)
    .map(({ element, rect }) => ({
      label: describe_(element),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }))
}

/** A control named the way a reader can find it in the source. */
function describe_(element: Element): string {
  const name =
    element.getAttribute('aria-label') ??
    element.getAttribute('id') ??
    element.textContent?.trim().slice(0, 40) ??
    ''
  return `<${element.tagName.toLowerCase()}>${name ? ` "${name}"` : ''}`
}

function report(undersized: ReadonlyArray<Undersized>): string {
  return (
    `${undersized.length} control(s) below the ${TOUCH_TARGET_MIN}px floor on a coarse pointer:\n` +
    undersized.map((one) => `  - ${one.label} is ${one.width}x${one.height}`).join('\n') +
    '\n\nSize touch-first and collapse for a fine pointer — `h-touch-target pointer-fine:h-10`,\n' +
    'not `h-10`. See docs/touch-conventions.md.'
  )
}

describe('touch targets', () => {
  it('runs on a coarse pointer at all', async ({ settings }) => {
    await settings.expectReady()

    // Without this the whole tier is a second desktop run and every sweep
    // below grades the collapsed `pointer-fine:` sizes — passing while
    // proving nothing. It is the first assertion for that reason.
    expect(
      matchMedia('(pointer: coarse)').matches,
      'this tier is supposed to emulate a phone — check contextOptions in vitest.config.ts',
    ).toBe(true)
    expect(matchMedia('(hover: hover)').matches).toBe(false)
  })

  it('clears the floor on the settings screen', async ({ settings }) => {
    await settings.expectReady()

    const undersized = undersizedControls(document.body)
    expect(undersized, report(undersized)).toEqual([])
  })

  it('clears the floor on the plans screen', async ({ plans }) => {
    // The card-heavy screen: a browse card is a button whose geometry is
    // overridden rather than the primitive's own, which is exactly the case a
    // desktop review passes and a thumb does not.
    const screen = await plans({ benchmark2kMs: 424_200, planId: 'pete5k' })
    await screen.expectReady()

    const undersized = undersizedControls(document.body)
    expect(undersized, report(undersized)).toEqual([])
  })

  it('clears the floor in the benchmark sheet', async ({ plans }) => {
    const screen = await plans()
    await screen.enterBenchmark()

    const undersized = undersizedControls(document.body)
    expect(undersized, report(undersized)).toEqual([])
  })

  it('clears the floor in a dialog', async ({ settings }) => {
    stubInstallPromptAvailable()
    await settings.install.expectVisible()
    await settings.install.openDialog()

    // A dialog is portalled outside the mounted container, so the sweep is
    // rooted at the document rather than at the screen.
    const undersized = undersizedControls(document.body)
    expect(undersized, report(undersized)).toEqual([])
  })
})
