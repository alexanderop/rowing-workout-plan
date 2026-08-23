---
type: Architecture Decision
title: Testing strategy
description: Seven test tiers, the rule for which tier a given test belongs in, and when a property earns its place.
tags: [testing, tiers, ci, property-testing]
status: stable
---

# Testing strategy

Seven tiers, each answering a different question. The point of the tiers is placement: every test has exactly one right home, and the cheap tiers stay fast enough to run constantly.

## The tiers

| Tier    | Command            | Runtime                                  | Question it answers                                                  |
| ------- | ------------------ | ---------------------------------------- | -------------------------------------------------------------------- |
| unit    | `pnpm test:unit`   | Node, ~100 ms                            | Is the pure logic right?                                             |
| default | `pnpm test`        | Real Chromium (Vitest browser mode)      | Do components and features behave, wired together?                   |
| a11y    | `pnpm test:a11y`   | Real Chromium + axe-core, light and dark | Are rendered screens accessible, and is their structure still there? |
| touch   | `pnpm test:touch`  | Real Chromium under touch emulation      | Does the app work the way a phone experiences it?                    |
| visual  | `pnpm test:visual` | Real Chromium screenshots                | Did the UI change when I didn't mean it to?                          |
| arch    | `pnpm test:arch`   | Node + ArchUnitTS/ESLint                 | Are the layer boundaries intact, and does the enforcement fire?      |
| e2e     | `pnpm test:e2e`    | Playwright against the production build  | Does the shipped artifact work end to end?                           |

## One driver, two runners

Four of those rows say "real Chromium" and the last says Playwright, and all five mean the same binary. `vitest.config.ts` sets `provider: playwright()` (`@vitest/browser-playwright`), so the browser tiers drive Playwright's Chromium too. Vitest browser mode ships no automation of its own, it picks a provider. e2e differs by running under `@playwright/test` (a `Pixel 7` profile, still Chromium) rather than under Vitest. There is one automation library in this repo, not two.

What actually differs is where the test code runs, and that explains more of the rules below than the API difference does:

- **Browser tiers.** Vitest compiles the spec through Vite and runs it _in the page_, in the same realm as the component. So a spec can hold the mounted app, call `runDb(listNotes)` and assert against IndexedDB directly (`src/__tests__/features/notes/notesFlow.spec.ts`), and have `fake-indexeddb` swapped in per file. The same realm is also the limit: no `node:*`, no filesystem, no local HTTP server. A unit-tier test that reaches for one of those does not move up a tier unchanged.
- **e2e.** The spec runs in Node and drives the page over a channel. It gets the Node side back, and gives up access to the app's modules entirely: everything it knows arrives through the DOM. That is the tier's point rather than its handicap, since it sees only what the shipped artifact exposes to a user, service worker and real IndexedDB included.

## Which tier does my test belong in?

Work down this list and stop at the first match:

1. **Pure function, no DOM, no IndexedDB?** Use `unit` (`src/__tests__/unit/`). This tier runs in the pre-commit hook, so it has to stay in the hundreds of milliseconds. Extract logic out of components into plain `.ts` modules (see `src/features/notes/domain.ts`) precisely so it can live here.
2. **Needs a rendered component, the router, or the database?** Use `default` (`src/__tests__/<area>/`). Browser mode means real CSS, real events, real browser APIs, no jsdom approximations. IndexedDB is replaced by fake-indexeddb per test file for speed and isolation.
3. **Asserting on accessibility?** Use `a11y` (`src/__tests__/a11y/`) — for two of the three layers. Axe answers whether the markup breaks a rule; ARIA snapshots answer whether the exposed structure still says what it should. The third layer, whether a keyboard user can actually operate the thing, is behaviour and lives with the specs that render the real trigger — see [vitest-practices.md](vitest-practices.md#focus-is-the-third-accessibility-layer-and-it-needs-real-input). Per-control a11y (labels, roles) likewise belongs in the `default` specs that exercise the control. Rules axe classifies as page-level (landmark structure, `region`, `page-has-heading-one`) are skipped when the sweep is scoped to a container, so `assertNoPageLevelViolations(screen)` runs them against the document instead. It takes the mounted screen because an empty document passes every one of them. `html-has-lang` and `document-title` are not among them, since in this tier they would grade the Vitest runner's page, so the shipped index.html is checked in e2e. The tier's other half is `ariaStructure.spec.ts`: ARIA snapshots, which catch semantics _disappearing_ (a `<nav>` that becomes a `<div>`) where axe reports no violation at all. See [vitest-practices.md](vitest-practices.md#aria-snapshots-for-structure-axe-for-violations).

   Two things about this tier are easy to get wrong and are therefore enforced rather than remembered:

   - **Every sweep runs in both themes.** `color-contrast` is the rule this tier reports most, and the only one whose answer depends on which palette is live. A light-only run grades half the app, and dark is the half nobody looks at by accident. The sweeps are a `describe.each` over `['light', 'dark']`; the structure sweeps are not repeated, since landmarks do not change colour. Switching theme is `await theme.dark()`, and the `await` is load-bearing: the tab bar carries `transition-colors`, so for ~150 ms every colour on screen is a blend of the two themes. The fixture waits the transitions out. Without that, axe grades a frame no user ever sees, differently each run.
   - **A component only gets swept if some sweep renders it**, and the default screen sweeps render the empty state of everything. A note card, a toast, an install banner, the update banner: none of them are on screen unless a sweep puts them there. `src/__tests__/a11y/coverage.ts` is the ledger, where every component names the sweep that renders it or names why it is not swept, and `architecture/a11yCoverage.test.ts` fails when a component is in neither, when an entry is stale, or when a declared sweep is one no spec runs. Adding a component is therefore a decision about its a11y coverage, not a silent omission. It found `heading-order` in `NoteCard` the day it was written.

4. **Does the claim only hold under a coarse pointer?** Use `touch` (`src/__tests__/touch/`). Every other browser project launches a stock desktop Chromium, where `hover: hover` and `pointer: fine` match, so a mobile-first app whose stated product is the app shell had no tier that experienced it the way its users do. That is how a batch of touch conventions rotted unnoticed. This tier's project passes `contextOptions: { hasTouch: true, isMobile: true }` to the Playwright provider; `hasTouch` gives the page touch events, `isMobile` is what flips Chromium's primary pointer to coarse, and both are needed. `matchMedia` is read-only from inside the page, which is why the condition is a project rather than a stub in a spec.

   Two things follow from that:

   - **Every spec here asserts the tier is real first.** `expect(matchMedia('(pointer: coarse)').matches).toBe(true)` is the opening assertion in `touchTargets.spec.ts`. Without it the whole tier is a second desktop run that passes while grading the collapsed `pointer-fine:` sizes.
   - **It is not the a11y tier's job.** Axe's `target-size` rule uses the WCAG 2.2 AA floor of 24×24; ours is the 44px HIG one. A 40px button satisfies axe and fails us.
   - **A branch that reads `(pointer: coarse)` has no other home.** `MoleculeDialogContent` cancels reka-ui's autofocus on touch, because focusing the first field would pop the on-screen keyboard while the sheet is still animating and `useKeyboardInset` is still measuring. `touch/sheetFocus.spec.ts` is the only place that `else` runs; `features/notes/quickAddFocus.spec.ts` covers the desktop `if`. Two specs asserting opposite things is the correct shape when the product behaviour genuinely differs by pointer.

   The e2e tier also drives a `Pixel 7` profile, which is a coarse pointer too, but it proves user journeys against the production build and costs a build to run. A convention about the chrome belongs here.

5. **Asserting nothing changed visually?** Use `visual` (`src/__tests__/visual/`).
6. **Asserting a project-wide rule, an import boundary, or that another tier is doing its job?** Use `arch` (`src/__tests__/architecture/`). It runs in Node over the whole source tree, which is what the files here have in common. Four things live there:
   - ArchUnitTS rules over the real module graph.
   - `boundaries.test.ts`, which feeds ESLint deliberate violations. It exists because ArchUnitTS does not parse `.vue` files and because "the codebase has no violations" also passes when nothing is being enforced. The actual `.vue` coverage comes from `no-restricted-imports` in `eslint.config.ts`.
   - `primitives.test.ts`, the file-shape rules for a primitive directory ([ui-components.md](ui-components.md)), `atomicDesign.test.ts`, the tier layering ([atomic-design.md](atomic-design.md)), and `touchConventions.test.ts`, the coverage half of [touch-conventions.md](touch-conventions.md). These are the rules whose _mechanism_ a browser tier proves but whose _application to every control_ only a static scan can.
   - `a11yCoverage.test.ts` and `i18nKeys.test.ts`, which are tests about the tests and the catalogue. Both answer a question their own subject cannot: the a11y tier cannot tell you which screens it forgot, and the type system cannot see a message key that nothing reads or one assembled at runtime. That is the same reasoning as `boundaries.test.ts`. A green check means nothing until you know it would go red.
7. **Proving a user journey against what actually ships (service worker, real IndexedDB, production bundle)?** Use e2e (`test/e2e/`, Gherkin + playwright-bdd). Keep these few and load-bearing. The offline-reload scenario is the canonical example: it cuts the network before reloading, so it fails unless the service worker precached the shell.

## Test quality bar

- Verify observable behavior through the public interface, meaning what a user or caller sees.
- Mock only at system boundaries (time, randomness, network). Never mock internal collaborators; the browser tier exists so you don't have to.
- No call-count or order assertions, no reaching into component internals.
- **An unexpected `console.warn` or `console.error` fails the test.** Installed once for every browser tier in `src/__tests__/setup.ts`, so no spec can opt out by forgetting. This is not tidiness: a missing required prop, a prop of the wrong type, a `v-model` pointed at nothing, a duplicate `v-for` key and a component that resolved to nothing are all _only_ reported this way. None of them throw, so without the gate a spec can render a broken component, assert on the text that still reached the screen, and pass. The allowlist in `helpers/consoleGate.ts` takes specific patterns with a reason each, never a broad one like `/Vue warn/`, which switches the gate off while looking like configuration.
- Order independence is non-negotiable. In the browser tiers the screen fixtures own it: a fixture resets the app state before it mounts and unmounts when the test ends, so a spec cannot forget. A test that needs the reset without a screen still calls `beforeEach(resetAppState)`.

## Every UI test goes through a page object

A spec says what the user did; one object says how. Nothing that drives the UI writes its own `getByRole('button', { name: 'Add a note' })`. Four tiers used to spell out the same four locators, so a renamed label was a grep instead of an edit.

- **Browser tiers.** `src/__tests__/pages/`, one _screen_ object per screen, handed to specs as fixtures from `src/__tests__/fixtures.ts`: `it('…', async ({ notes }) => …)`, then `notes.addNote({ title })`, `notes.expectNote(title)`. The fixture mounts and unmounts, so no spec calls `open()` or `close()` itself. `AppScreen` holds what every screen shares (the mounted container, the app root, the tab bar, toasts).
- **e2e.** `test/e2e/pages/`, the same vocabulary against Playwright locators, handed to steps as fixtures from `test/e2e/fixtures.ts`. Every Gherkin step is one line that names the intent; `notes.feature` stays readable by someone who never opens the steps.

Fixtures on both sides is the point: a browser-tier spec and a Gherkin step now open the same way, and neither carries lifecycle bookkeeping. [vitest-practices.md](vitest-practices.md) has the rules for writing one.

Two objects rather than one shared one, and the reason is the split above rather than taste. The driver is the same Playwright, but a browser-tier object queries from inside the page (`vitest/browser` locators, `expect.element`) while an e2e object queries it from Node (Playwright's own locators, awaited over the channel). No wrapper reconciles those without becoming the thing it wraps. What stays in step is the _names_: a step and a browser-tier spec read alike, which is what makes the pair easy to keep honest.

The rules that keep them from becoming a second app:

- **One object per screen** (mirroring `src/views/`); a nested part gets its own, mirroring the component that renders it, so `QuickAddSheet` ↔ `QuickAddNoteSheet.vue`.
- **Locators stay roles and accessible names.** An object that reaches for `data-testid` has stopped testing what a user can find. The app root is the one exception, and only the visual tier uses it, to frame the screenshot.
- **They stop at the UI.** `runDb(listNotes)` assertions stay in the spec: that a note survived to IndexedDB is the point of the test, not a detail of the page.
- **Waits live in the object, not the spec.** `openQuickAdd()` waits for the lazy-loaded sheet, and waits for it to be _usable_ rather than merely rendered, since `expectReady` asserts the Save button is in the viewport rather than clipped below the fold. `addNote()` waits for the sheet to close, since it closes only once the write has landed, which is what makes a second `addNote()` safe to call straight after.
- **Assertions are `vi.defineHelper` fields, not methods.** `readonly expectNote = vi.defineHelper(async (title) => …)`. The wrapper reports the failure at the spec line that called it instead of somewhere inside the object, which is the thing that makes a page object safe to keep pushing behaviour into. Locators and actions stay ordinary methods. Browser locator assertions already report at the call site; plain `expect` and `expect.poll` do not, and the rule is uniform so nobody has to check which they wrote. See [vitest-practices.md](vitest-practices.md#every-assertion-helper-is-wrapped-in-videfinehelper).

## Properties, and when one earns its place

`it.prop` and `it.effect.prop` (from `@effect/vitest`) run a test body against ~100 generated inputs instead of one hand-picked one. They belong to the unit tier only. A property is the same test a hundred times over, which pure logic absorbs in milliseconds and the browser tiers cannot afford.

Reach for one when the thing you want to say is true of _every_ input rather than at a boundary, and you can state it without reimplementing the code under test. Three shapes cover most cases:

- **Round-trip.** What one direction emits, the other accepts. `toNote`'s output has to decode as a stored row again, because it lands in IndexedDB and in the user's next backup (`src/__tests__/unit/db/converters.spec.ts`).
- **Invariant.** The operation preserves something. `sortNotes` is a reordering: same notes out as in, plus the ordering rule between every pair of neighbours (`src/__tests__/unit/notes/domain.spec.ts`).
- **Agreement.** Two paths that claim the same rule stay in step. `isNoteDraft` has to accept exactly the drafts `decodeNoteDraft` accepts; when they diverge, the form and the write path disagree about what a note is.

Where a schema owns the shape, generate from the schema rather than hand-writing an arbitrary: `Schema.toArbitrary(StoredDbNote)` cannot drift from the validator the repository decodes rows with. That makes the property a test of the schema as well as of the code, which is the point, and worth being ready for.

Keep the examples too. A property pins the _definition_ of a behavior; an example pins a specific boundary that must not move, and reads far better when it fails.

**When a property fails, suspect the code before the generator.** `sortNotes` failed roughly one run in four on a generated `updatedAt: Number.NaN`, and the tempting fix, filtering NaN out of the generated rows, would have converted a found bug into a hidden one. The generator was right: `Schema.Number` accepts NaN, so the read path accepted it too, and a NaN timestamp compares false against everything, landing the note at an arbitrary place in the list with "NaN days ago" under it. The fix was in `converters.ts`, where timestamps became `Schema.Natural`, after which the generator stopped producing the value because the schema stopped allowing it. If a generated input really is impossible, say so in the schema and let the generator follow. Narrowing the property is how you lose the read-path hole it just found.

## Grading the tier itself

The tiers answer "does the code work". [Mutation testing](mutation-testing.md)
answers "would these tests notice if it stopped". `pnpm test:mutation` runs
Stryker over the unit tier's scope in ~10 s and reports which lines the tests
execute without asserting on. It is scoped to the unit tier on purpose, and
reading a survivor has its own procedure. Both are in that document.

## The visual tier and its baselines

Screenshot baselines live in `__screenshots__/` and are platform-specific, since font rendering differs between macOS and Linux. The tier is a local tool by default and is deliberately not in CI:

- After an intentional UI change: `pnpm test:visual:update`, review the diff, commit the new baselines.
- To enable it in CI: run the tier once in a CI job with `--update`, download the Linux baselines as an artifact, commit them, then add a CI job mirroring the a11y one.

## Where the gates run

- **Every commit** (husky, ~15 s): lint-staged, type-check, `test:unit`, knip.
- **While working, and before pushing** (`pnpm check`, ~8 s): lint, formatting, types, knip, `test:unit` and `test:arch`, run concurrently and reported together. That is every gate that needs no browser. Then the browser tiers your change touches. Formatting on commit only reaches staged files, so the `format:check` inside `pnpm check` is what catches the rest.
- **CI on every PR** (`.github/workflows/`): everything, with the browser tier sharded, plus the mutation score and the touch tier as their own jobs. Alongside `ci.yml`:
  - `autofix.yml` runs the `--fix` variants and pushes the result back via autofix.ci, so the mechanical half of a red build becomes a commit instead of an errand. `lint:check` and `format:check` still run in `ci.yml` and still fail on whatever `--fix` cannot repair.
  - `zizmor.yml` is static analysis of the workflows themselves, pedantic persona. The repo pins every action to a SHA and sets least-privilege `permissions` by hand; this is what keeps that true. The `harden-github-actions` skill runs the same tool on demand, which is not a gate.
  - `dependency-diff.yml` and `dependency-diff-comment.yml` report what a lockfile change costs, on the PR that makes it: packages added, install size, and replacement suggestions from e18e's `module-replacements`. `size-limit` guards the bytes that reach a user, but arrives after the dependency is already in. They are split in two so the job holding `pull-requests: write` never has a fork's code checked out beside it. See the comment at the top of each.

The principle: the cost of a check should match how often it runs. Fast checks run on every commit; minutes-long tiers are CI's job.

## The bundle budget

`pnpm size-limit` measures `dist/assets/*.js` brotlied against the limit in
`package.json`. **210 kB**, with the app at just over 200 kB — a little under
5% of headroom, which is enough that an ordinary change does not trip it and
tight enough that a new dependency does.

It was 172 kB for the starter and 200 kB after the training feature, and each
raise was a decision rather than a formality: the number exists to catch a
regression, so moving it has to be deliberate and has to say what it bought.
The 200 kB raise bought slices 1–7 — four routes, the training core, the plan
catalogue and a schema-validated persistence layer. The 210 kB raise bought
the number-entry pad (`MoleculeNumberField` and the fourteen numeric-input
primitives, ~10 kB brotlied), the second training plan, and the version panel
in settings — which together carried the total ~400 B past the old limit.

Where the bytes actually are, brotlied, is worth knowing before anyone tries
to cut them:

| Chunk                     | Size  | What is in it                                                                                                                     |
| ------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createLucideIcon-*.js`   | 61 kB | Mostly `tailwind-merge`'s table of every Tailwind utility, plus lucide's icon factory. Fixed cost: it does not grow with the app. |
| `db-*.js`                 | 41 kB | Effect `Schema` and Dexie — the decode-every-row guarantee, priced.                                                               |
| `useApi-*.js`             | 27 kB | reka-ui primitives.                                                                                                               |
| `MoleculeNumberField-*.js`| 10 kB | The number-entry pad: the field and the fourteen numeric-input primitives.                                                        |
| everything else           | 61 kB | The router, the views, i18n, the app shell. Each view is 2–8 kB.                                                                  |

The chunk _names_ are misleading — Vite names a chunk after one of its
modules, so the biggest one is called `createLucideIcon` and contains no icon
set at all. Measure before optimising; the obvious suspect here is the wrong
one.

Nothing dev-only reaches this number. The PM5 capture harness and
`src/lib/ergBluetooth.ts` sit behind `import.meta.env.DEV`, which Vite
replaces with a literal `false`, and `grep -rl ce060030 dist/assets/` after a
build is what keeps that honest.
