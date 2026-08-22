import { describe, expect } from 'vitest'
import { userEvent } from 'vitest/browser'
import { it } from '../fixtures'

/**
 * The touch conventions that are measurable in this tier's browser
 * (docs/touch-conventions.md).
 *
 * Every assertion here is on a *computed effect* — what scrolls, what a
 * double-click selects — never on a class string. A class-string assertion
 * goes red on a harmless rename and stays green when the CSS is broken; it is
 * a change detector aimed at the wrong thing. The conventions that no browser
 * we can afford to run will show (press transforms, reduced motion, the
 * insets themselves) get a static tripwire in the arch tier instead —
 * `architecture/touchConventions.test.ts`.
 */

/**
 * The elements that actually scroll, asked of the DOM rather than named.
 *
 * The bug this exists for was a *correct declaration on an element that never
 * scrolls*: `body` carried `overscroll-behavior-y: none` while `<main>` was
 * the real scroller. A test naming `<main>` would have missed both that
 * instance and the next one.
 */
function scrollContainers(root: Element): Array<Element> {
  return [...root.querySelectorAll('*')].filter((element) => {
    const { overflowY } = getComputedStyle(element)
    return overflowY === 'auto' || overflowY === 'scroll'
  })
}

describe('touch conventions', () => {
  it('contains overscroll on every scroll container in the shell', async ({ settings }) => {
    await settings.expectReady()

    const containers = scrollContainers(settings.root.element())

    // Without this the test passes when the shell has no scroller at all —
    // the a11yCoverage lesson: a green check means nothing until you know it
    // would go red.
    expect(
      containers.length,
      'no scroll container found — this test proves nothing',
    ).toBeGreaterThan(0)

    for (const container of containers) {
      expect(
        getComputedStyle(container).overscrollBehaviorY,
        `<${container.tagName.toLowerCase()}> scrolls but lets the gesture chain out of it — add overscroll-contain`,
      ).toBe('contain')
    }
  })

  // Settings is the screen with a *nested* scroller: PageLayout's own
  // overflow-y-auto inside the shell's <main>. Sweeping both screens is what
  // makes this a rule about the bug class rather than about one element.
  it('contains overscroll on every scroll container on a PageLayout screen', async ({
    settings,
  }) => {
    await settings.expectReady()

    const containers = scrollContainers(document.body)
    expect(
      containers.length,
      'no scroll container found — this test proves nothing',
    ).toBeGreaterThan(1)

    for (const container of containers) {
      expect(
        getComputedStyle(container).overscrollBehaviorY,
        `<${container.tagName.toLowerCase()}> scrolls but lets the gesture chain out of it — add overscroll-contain`,
      ).toBe('contain')
    }
  })

  /**
   * Selection, asserted as a user produces it: a double-click selects a word,
   * and under `user-select: none` it selects nothing. No class string in
   * sight, so the test survives the declaration moving.
   *
   * Each assertion was checked by deleting the rule it covers, which is the
   * only way to know a green one means anything. The heading is the one that
   * goes red on removing `body { user-select: none }`; the tab above it
   * carries its own `select-none`, so that one would stay green.
   *
   * **Two halves of the rule have nothing on screen to assert against right
   * now, and that is recorded rather than glossed.** `select-text` on prose,
   * and the `input`/`textarea` exemption, both need a screen that renders
   * prose or a text field — the notes worked example was the only one, and
   * the training screens are what bring them back. Until then the CSS in
   * `src/style.css` is covered by `architecture/touchConventions.test.ts`,
   * which grades the declarations, and by item 4 on the manual device
   * checklist in docs/touch-conventions.md. The field half could not go red
   * in this tier anyway: iOS refusing caret placement is WebKit behaviour and
   * desktop Chromium keeps inputs editable either way.
   */
  it('makes chrome unselectable', async ({ settings }) => {
    await settings.expectReady()

    await userEvent.dblClick(settings.tab('Settings'))
    expect(
      window.getSelection()?.toString(),
      'a tab label is a control, not quotable text — double-clicking one should select nothing',
    ).toBe('')

    // The tab carries its own `select-none`, so the assertion above would
    // stay green if the global rule vanished. The route heading is covered by
    // nothing but `body { user-select: none }`, which is what makes this the
    // one that would go red.
    await userEvent.dblClick(settings.heading)
    expect(
      window.getSelection()?.toString(),
      'the app-wide selection suppression is gone — src/style.css',
    ).toBe('')
  })
})
