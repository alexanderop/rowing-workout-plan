---
type: Convention
title: Vitest practices
description: The Vitest 4 APIs this project standardises on (fixtures over lifecycle hooks, defineHelper on every assertion helper, ARIA snapshots, tags, viewport assertions) and the ones deliberately left alone.
tags: [testing, vitest, fixtures, snapshots, browser-mode]
status: stable
---

# Vitest practices

[testing-strategy.md](testing-strategy.md) decides _which tier_ a test belongs
in. This decides _how it is written_ once it is there. Everything below is
Vitest 4.1, which is what the project is pinned to (`vitest` in the `testing`
catalog); the version each API landed in is noted so a downgrade is a decision
rather than a surprise.

## Fixtures, not lifecycle hooks

**Rule: a browser-tier spec declares what it needs and gets it. It does not
mount, and it does not clean up.**

```ts
import { describe, expect } from 'vitest'
import { it } from '../fixtures'

it('creates a note through the center FAB', async ({ notes }) => {
  await notes.addNote({ title: 'Buy milk' })
  await notes.expectNote('Buy milk')
})
```

`src/__tests__/fixtures.ts` is the browser tiers' `it`, the counterpart of
`test/e2e/fixtures.ts` on the Playwright side. A fixture owns the whole
lifecycle, meaning it resets the app state, mounts, and unmounts when the test
ends, which is what removed this from every browser spec:

```ts
// What a spec used to open with, and no longer does.
let notes: NotesScreen | undefined
beforeEach(resetAppState)
afterEach(() => {
  notes?.close()
  notes = undefined
})
```

That block was not just noise. The mutable `notes` had to be typed
`| undefined` because the hook could not know whether the test had assigned
it yet, so every use was an optional chain, and a spec that forgot the
`afterEach` leaked a mounted app into the next test with nothing to catch it.
A fixture has no such gap: the teardown is registered by the same code that
did the setup.

Three properties are worth knowing:

- **Fixtures are lazy.** A test that never names `notes` never mounts it. That
  is why one spec file can mix `notes` and `settings` without paying for both,
  and why extending the shared `it` in a spec that uses none of its fixtures
  costs nothing.
- **Use the builder syntax**, `.extend('name', async ({}, { onCleanup }) => …)`
  from Vitest 4.1, rather than the Playwright-compatible object form. The
  fixture type is inferred from what the function returns, so there is no second
  copy of the type to keep in step. The empty `{}` first parameter is not
  decorative: Vitest parses it to learn which fixtures this one depends on, so
  it cannot be renamed to `_context`. `no-empty-pattern` is configured for
  `src/__tests__/**` in `.oxlintrc.json` for exactly that reason.
- **`onCleanup` may be called once per fixture.** Two teardowns means two
  fixtures, which is the better shape anyway, since it makes the dependency
  explicit.

### Where a fixture lives

| Scope                           | Home                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| An app screen every tier drives | `src/__tests__/fixtures.ts` (`notes`, `settings`, `theme`) |
| A harness for one spec          | That spec file, extending the shared `it`                  |

`components/appShell.spec.ts` (a stub router and a component in isolation) and
`components/molecules/dialog/dialogContent.spec.ts` (a tall sheet under a simulated
keyboard) are the worked examples of the second row. Neither harness means
anything outside its file, so neither belongs in the shared module. Both still
extend the shared `it`, so there is one import to remember.

## Every assertion helper is wrapped in `vi.defineHelper`

**Rule: a function that calls `expect` on behalf of a spec is defined with
`vi.defineHelper` (4.1).**

The wrapper strips the helper's own frames from the stack, so the failure is
reported at the line in the spec that asked for it. Without it, every a11y
failure in the suite points at the same `expect` inside `helpers/a11y.ts`,
whichever screen produced it. The more behaviour a helper or page object
absorbs, the worse that gets, which would otherwise be an argument against
page objects rather than a solved problem.

**It does not matter for every assertion, which is why the rule is uniform.**
Measured against 4.1.10, a cross-file helper reports its failure at:

| Assertion in the helper           | Unwrapped                    | With `defineHelper`  |
| --------------------------------- | ---------------------------- | -------------------- |
| `expect(value).toEqual(…)`        | inside the helper            | the spec's call site |
| `expect.poll(…).toBe(…)`          | inside the helper            | the spec's call site |
| `expect.element(…).toBeVisible()` | the spec's call site already | unchanged            |

So the browser runner already attributes locator assertions correctly, and
wrapping `expectNote` changes nothing today, while `NotesScreen.expectOrder`
(a poll) and both axe helpers (plain `expect`) genuinely need it. Wrapping
all of them means adding an assertion never requires knowing which of the two
kinds you just wrote, and never quietly regresses the stack when a locator
assertion grows a plain one beside it.

This is why the `expect*` members of a screen object are fields rather than
methods:

```ts
readonly expectNote = vi.defineHelper(async (title: string): Promise<void> => {
  await expect.element(this.note(title)).toBeVisible()
})
```

Locators and actions stay ordinary methods. Only the assertions need the
stack rewrite.

## ARIA snapshots for structure, axe for violations

`src/__tests__/a11y/` holds two different questions, and they do not overlap:

- **`a11y.spec.ts`** runs axe-core sweeps. It catches what axe can _name_: an
  unlabelled control, insufficient contrast, a broken landmark.
- **`ariaStructure.spec.ts`** runs `toMatchAriaSnapshot` (4.1.4, experimental).
  It catches structure quietly disappearing: a `<nav>` that becomes a `<div>`, a
  heading that drops a level, a dialog that loses its accessible name. Axe
  reports no violation for any of those. Nothing is _wrong_, the semantics
  are simply gone.

A baseline is the accessibility tree as text, which is the form a screen
reader consumes and a reviewer can actually read in a diff:

```text
- navigation "Main navigation":
  - button "Notes"
  - button "Add a note"
  - button "Settings"
```

Unlike the visual tier's screenshots these are platform-independent, so they
cost nothing to keep in CI. Two rules keep them honest:

- **Scope them to a region whose semantics are a promise**, so navigation,
  dialogs, forms. A snapshot of the whole app root gets re-recorded on every
  copy change, and a baseline nobody reads is a baseline nobody trusts.
- **Rebaseline deliberately**: `pnpm test:a11y -- --update`, then read the
  diff. A structure change that surprises you is the test doing its job.

## Focus is the third accessibility layer, and it needs real input

Axe answers "does this markup break a rule". ARIA snapshots answer "does the exposed structure still say what it should". Neither can answer "can a keyboard user operate this" — and a dialog with impeccable ARIA that drops focus on `<body>` and never hands it back passes both while being unusable. That is the regression portalled content produces, because the node the user came from is nowhere near the node they land in.

The assertions live in the tier that renders the real trigger, not in `a11y/`: `features/notes/quickAddFocus.spec.ts` for the sheet, `touch/sheetFocus.spec.ts` for its coarse-pointer half.

- **Tab with `userEvent.tab()`, then assert where focus went.** Not a synthetic `keydown` plus `event.defaultPrevented` — that was jsdom's only option, since it has no sequential focus navigation and a Tab there moves nothing. `defaultPrevented` is the implementation detail that stood in for the contract; the contract is the destination.
- **A trap is a claim about a subtree, so it is not a locator matcher.** `toHaveFocus` asks about one element; 4.1.10 has no `toContainFocus`. `QuickAddSheet.expectHoldsFocus` does the containment read instead, synchronously — the preceding `tab()` has already resolved, so "focus is here now" is the contract and a retrying matcher would widen it to "focus arrives here eventually", which a leaking dialog satisfies on its way past.
- **Assert focus restoration explicitly.** A modal has to hand focus back to whatever opened it. That is why `NotesScreen.addButton` is a named locator rather than inlined into `openQuickAdd`: the trigger is the assertion target.
- **A modal also hides its backdrop from assistive technology, and that is a separate test.** reka-ui marks the app root `aria-hidden` while a modal is open, so `getByRole('navigation')` resolves to nothing — the shell is on screen, pixel-for-pixel, and gone from the accessibility tree. Assert it as a count (`expect(notes.tabBar.query()).toBeNull()`); no attribute probe on the nav itself would see it, because the attribute lands on an ancestor.

## Press a disabled control with `force: true`

**Rule: when the claim is "this control refuses the interaction", assert the state _and_ press it.**

```ts
await expect.element(notes.quickAdd.saveButton).toBeDisabled()
await notes.quickAdd.pressSaveIgnoringDisabled() // click({ force: true })
```

Both, because they are different claims and a mutation check separates them. `toBeDisabled` pins the binding — dropping `:disabled="!canSave"` leaves the press alone green, since `save()` carries the same rule a second time and nothing is written either way. The press pins that the platform honours the state, which the jsdom-era spelling could not: a test framework's `trigger('click')` short-circuits on a disabled control itself, so it graded its own guard rather than the browser's.

`force: true` skips the actionability _wait_, not the gesture — Chromium still delivers a real `pointerdown` and then declines to follow it with a click. Without it, `.click()` sits in "wait for enabled" until `actionTimeout` and fails for a reason unrelated to the contract.

## Locators match exactly, and it is configured once

`browser.locators.exact` is on in `vitest.config.ts`, so no spec spells out `{ exact: true }`. Vitest 4's default is substring matching, which is a family of tests that pass against a component that never works: `getByText('checked')` matches `unchecked`, `getByRole('option', { name: 'Apple' })` matches _Pineapple_. Exact is Vitest 5's default, so this is that migration done early.

Two knobs in the same config are worth knowing because they change what a _failure_ costs, not what passes:

- **`actionTimeout: 2000`** caps a failing action and lets a failing `expect.element` fall back to `expect.poll`'s 1s default instead of inheriting `testTimeout`. Measured here: a failing assertion 8123 ms → 1162 ms. The comment above it holds the ladder that chose the number, and re-running that ladder is the response when a tier starts flaking.
- **Traces are off by default.** `VITEST_TRACE=1 pnpm test <file>` for the one file you are debugging. Left on for a whole suite they cost ~2.85× wall clock and bring their own failures.

## `toBeInViewport` when the claim is reachability

`toBeVisible` asserts the CSS notion of visible. It passes for an element
clipped by an ancestor's scroll region: present, laid out, and completely
unreachable on the device. When the thing being proved is that a user can
actually get to a control, the assertion is `toBeInViewport` (4.0), which
measures the intersection through the ancestor chain:

```ts
await expect.element(submit).not.toBeInViewport()
body.scrollTop = body.scrollHeight
await expect.element(submit).toBeInViewport()
```

This matters more here than in most apps: keyboard-aware sheets are the
product, and "the Save button is below the fold with the keyboard open" is the
failure mode the dialog primitive exists to prevent. `QuickAddSheet.expectReady`
uses it too, so the wait that gates every quick-add interaction means _usable_
rather than merely _rendered_.

## Geometry assertions measure what a user perceives

**Rule: when the claim is about layout, measure the distance a user sees.
Never assert the declaration that produces it.**

```ts
// The sheet's last control must clear its bottom edge.
const gap = sheet.getBoundingClientRect().bottom - submit.element().getBoundingClientRect().bottom
expect(gap).toBeGreaterThanOrEqual(24)
```

Not `getComputedStyle(sheet).paddingBottom === '24px'`, and certainly not
`toHaveClass('pb-6')`. The measured form survives someone swapping the padding
for a spacer element, and it fails for the reason a user would notice. The
class-string form goes red on a harmless rename and stays green when the CSS is
broken, a change detector aimed at the wrong thing, and
[testing-strategy.md](testing-strategy.md) rules it out on those grounds.

`getComputedStyle` is still the right tool when the _property itself_ is the
subject and there is no perceivable proxy in a headless browser.
`overscrollBehaviorY` is one, since chaining needs a real gesture. Two things
keep that honest:

- **Ask the DOM which elements to grade, do not name them.** The overscroll
  bug was a correct declaration on an element that never scrolls, so a test
  naming `<main>` would have missed the next instance. Collect the elements
  whose computed `overflow-y` is `auto` or `scroll`, then hold _those_ to the
  rule.
- **Assert the collection is non-empty first.** A sweep that finds nothing
  passes, which is the `a11yCoverage` lesson: a green check means nothing until
  you know it would go red.

## Retries are narrow, and tagged

The browser projects retry on CI only, and only for errors that are the
browser rather than the app: a lazy chunk that did not arrive, a page torn
down mid-run. That narrowing is the `condition` option (4.1):

```ts
retry: process.env.CI
  ? { count: 2, delay: 250, condition: /Failed to fetch dynamically imported module|…/i }
  : 0
```

A blanket retry is worse than none. A failed assertion fails the same way the
second time, so all it buys is a slower red, and if it _does_ pass on the
retry, a real race has just been hidden. Locally there is no retry at all,
because a flake is a thing to look at.

**Tags** (4.1) carry the options for a category of test that cuts across the
tiers:

```ts
it('creates a single note when submitted twice', { tags: ['flaky'] }, async ({ notes }) => { … })
```

Tags are defined once in `vitest.config.ts` and inherited by every project;
`strictTags` defaults to on, so a typo is an error rather than a silently
untagged test. `src/__tests__/vitest.d.ts` augments `TestTags` so it is a
compile error too.

**A tag has to earn itself.** Reach for one only when the category cuts across
the tiers and carries runner options:

| If the grouping follows…                           | Use                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| a directory                                        | a project, which is what the tiers already are |
| a test name                                        | `-t` / `--testNamePattern`                     |
| a cross-cutting category with shared timeout/retry | a tag                                          |

`flaky` is the only tag today, and it is applied to exactly one test. Do not
add `frontend`/`backend`-style tags that restate the tier structure; filter
by project instead.

## The console is asserted on

Every browser tier fails on an unexpected `console.warn` or `console.error`.
The gate is installed once in `src/__tests__/setup.ts`, nothing per spec.

It is there because a whole class of Vue mistake is reported this way and no
other: a missing required prop, a prop of the wrong type, a `v-model` pointed
at nothing, a duplicate `v-for` key, a component that resolved to nothing.
None of it throws. Without the gate, a spec renders a broken component, finds
the text that still made it to the screen, and passes, and so does the next
twenty.

Two consequences when writing a spec:

- **If a test you expect to pass fails on a warning, the warning is the bug.**
  It was there before; it just had nowhere to be reported.
- **A spec that provokes a warning on purpose**, say to prove a component
  rejects bad input, asserts on it rather than tolerating it: read the spy in
  the test itself. Do not widen the allowlist in `helpers/consoleGate.ts` for
  one spec. That list is for noise from the harness and from libraries, each
  entry a specific pattern with the reason it is not a defect; `/Vue warn/`
  would switch the gate off while looking like configuration.

The console still prints, since `vi.spyOn` wraps the method rather than
replacing it, so the output is there when a failure needs reading.

## What we deliberately do not use

Recorded so the question does not get re-opened every few months.

- **`aroundEach` / `aroundAll` (4.1)** are for wrapping a test in a _context_: a
  database transaction, an `AsyncLocalStorage` scope, a tracing span. Nothing
  here needs to straddle the test that way; a fixture's `onCleanup` covers the
  setup and teardown case and reads better.
- **`locators.extend` (3.2)** gives custom locators like `page.getByNoteCard(…)`.
  The screen-object classes already own that vocabulary. Worth revisiting only
  if a domain query needs locator chaining or strict-mode protection.
- **`context.annotate` (3.2)** attaches axe violation payloads or trace
  paths to the reporter. The current failure messages are already readable;
  this is the tool if they stop being.
- **`test.scoped`** is deprecated in favour of `test.override` (4.1). Neither is
  in use.
- **`expect.schemaMatching`, `mock.mockThrow`** are documented on the Vitest site
  under a 4.x badge, but not present in 4.1.10. Do not plan around them.
