import axe from 'axe-core'
import { expect, vi } from 'vitest'
import type { AppScreen } from '../pages/appScreen'

/**
 * Page-level rules axe only evaluates when the context is the whole
 * document. Scope axe to a mounted container and every one of these is
 * reported "inapplicable" — silently skipped, not passed.
 *
 * Deliberately absent: `html-has-lang`, `html-lang-valid` and
 * `document-title`. In this tier they would grade the Vitest browser
 * runner's own page (`<title>Vitest Browser Tester</title>`), not ours. The
 * shipped index.html is checked in the e2e tier, which loads it for real.
 */
const PAGE_LEVEL_RULES = [
  'bypass',
  'landmark-banner-is-top-level',
  'landmark-complementary-is-top-level',
  'landmark-contentinfo-is-top-level',
  'landmark-main-is-top-level',
  'landmark-no-duplicate-banner',
  'landmark-no-duplicate-contentinfo',
  'landmark-no-duplicate-main',
  'landmark-one-main',
  'landmark-unique',
  'page-has-heading-one',
  'region',
]

function report(results: axe.AxeResults) {
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target),
  }))
}

/**
 * Runs axe-core against an element and fails with a readable list of
 * violations (rule id + offending selectors) instead of a generic diff.
 *
 * Wrapped in `vi.defineHelper` so the failure is reported at the `await
 * assertNoViolations(...)` line in the spec rather than at the `expect`
 * below. This one is load-bearing rather than stylistic: a plain `expect`
 * keeps its own frame at the top of the stack, so without the wrapper every
 * a11y failure in the suite points at the same line here, whichever screen
 * produced it.
 */
export const assertNoViolations = vi.defineHelper(async (context: Element): Promise<void> => {
  const results = await axe.run(context, { resultTypes: ['violations'] })
  expect(report(results)).toEqual([])
})

/**
 * Runs the document-scoped rules — landmark structure, heading order,
 * skip links, unlabelled content outside any landmark. These are the ones
 * `assertNoViolations` cannot reach.
 *
 * They only mean anything with a screen on the page, and an empty document
 * passes every one of them, so the screen is a parameter rather than a
 * comment: hand over the one you mounted and it is checked before axe runs.
 * axe itself is still pointed at `document`, the only context in which it
 * evaluates these rules at all.
 */
export const assertNoPageLevelViolations = vi.defineHelper(
  async (mounted: AppScreen): Promise<void> => {
    expect(mounted.container.isConnected).toBe(true)

    const results = await axe.run(document, {
      resultTypes: ['violations'],
      runOnly: PAGE_LEVEL_RULES,
    })
    expect(report(results)).toEqual([])
  },
)
