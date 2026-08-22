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
  it('contains overscroll on every scroll container in the shell', async ({ notes }) => {
    await notes.expectNoNotes()

    const containers = scrollContainers(notes.root.element())

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
   * only way to know a green one means anything. Two of the three go red:
   *
   * - the heading, on removing `body { user-select: none }` — the tab above
   *   it carries its own `select-none`, so that one would stay green;
   * - the note body, on removing `select-text` from NoteCard.
   *
   * **The field assertion cannot go red in this tier, and that is recorded
   * rather than glossed.** The failure it is about — a global
   * `user-select: none` with no exemption making iOS refuse caret placement —
   * is WebKit behaviour; desktop Chromium keeps inputs editable either way,
   * so deleting the exemption leaves this green. It is kept as the statement
   * of the rule, and the thing that actually covers it is item 4 on the
   * manual device checklist in docs/touch-conventions.md.
   */
  it('makes chrome unselectable while leaving prose and fields alone', async ({ notes }) => {
    const body = 'Two litres, oat if they have it'
    await notes.addNote({ title: 'Buy milk', body })

    await userEvent.dblClick(notes.tab('Notes'))
    expect(
      window.getSelection()?.toString(),
      'a tab label is a control, not quotable text — double-clicking one should select nothing',
    ).toBe('')

    // The tab carries its own `select-none`, so the assertion above would
    // stay green if the global rule vanished. The route heading is covered by
    // nothing but `body { user-select: none }`, which is what makes this the
    // one that would go red.
    await userEvent.dblClick(notes.heading)
    expect(
      window.getSelection()?.toString(),
      'the app-wide selection suppression is gone — src/style.css',
    ).toBe('')

    await userEvent.dblClick(notes.noteBody(body))
    expect(
      window.getSelection()?.toString(),
      'the note body is the one thing on the card the user wrote — it needs select-text back',
    ).not.toBe('')

    await notes.openQuickAdd()
    const title = notes.quickAdd.title
    await title.fill('Selectable')
    await userEvent.dblClick(title)

    const field = title.element()
    if (!(field instanceof HTMLInputElement)) throw new Error('title field is not an input')
    const selected = (field.selectionEnd ?? 0) - (field.selectionStart ?? 0)
    expect(
      selected,
      'the field exemption is missing — on iOS this is a keyboard that refuses to place a caret, not a CSS bug',
    ).toBeGreaterThan(0)
  })
})
