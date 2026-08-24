---
type: Playbook
title: Adding a feature
description: Build order for a new feature, mapped onto the training feature, with the test home for every step.
tags: [features, walkthrough, testing]
status: stable
---

# Adding a feature

The training feature (`src/features/training`) is the worked example, and this walkthrough maps its pieces so you can copy the pattern. Build in this order; every step has a test home.

## 1. Storage (if the feature persists data)

- Define the row in `src/db/converters.ts` as a `Schema.Struct` plus a same-name `interface`, with a `Stored*` variant whose old-shape fields are `Schema.optionalKey`. The schema is the source of truth: Dexie's table typing, the read-path decode, and backup validation all derive from it, so they cannot drift. The three training rows (`Benchmark`, `PlanEnrolment`, `Workout`) are the worked example; `StoredDbWorkout` is the one that shows a relaxed field and its backfill.
- Add the table to `src/db/schema.ts`, typed from that schema. New table on a fresh install? Just add it to the **current** version's `stores()`. Changing an existing table? Bump the version, write an `upgrade()`, and relax the changed fields in the `Stored*` schema (see the v1→v2 example).
- Add a converter in `src/db/converters.ts`. Reads have to produce complete domain objects from any historical shape.
- Add a repository in `src/db/repositories/` (`workouts.ts` is the template) and re-export it from `src/db/index.ts`. Merge its `Layer` into `src/db/layer.ts` and nowhere else, and give it a `testLayer` there too, so a program over it runs in the Node unit tier. Nothing outside `src/db` may import deeper than the index; ESLint fails on the import and the arch tests fail your PR. Reads decode every row; writes validate their input. Both fail with tagged errors, not exceptions.
- Add the table to `src/db/backup.ts` in the same commit, reusing the same `Stored*` schema.
- **Tests**: schema decode and converter go in the unit tier; repository CRUD, rejected rows, and the backup round-trip go in `src/__tests__/db/`.

## 2. Domain logic

Pure functions in `src/features/<name>/` (deriving, validating, converting). Keeping them out of components is what makes them unit-tier testable, and every module here has to be listed in `CORE` (`eslint.config.ts`) with a spec under `src/__tests__/unit/<feature>/` — the arch tier fails a core module that has neither. `features/training/progress.ts` and its spec are the smallest complete example: rows in, one answer out, and every assertion about the case where the rows disagree.

## 3. State

Atoms via `@effect/atom-vue`, with `src/features/training/atoms.ts` as the template. Conventions:

- **Reads are atoms.** Build them with `dbRuntime.atom(program)` and wire them with `Atom.withReactivity([TRAINING_KEY])` — the keys are grouped by how often a thing changes, not one per table. The atom's value is an `AsyncResult` carrying loading, failure, and data in one value, and components subscribe with `useAtomValue(() => yourAtom)`. Subscribing _is_ the load; there is no `onMounted` fetch and no `isLoaded` flag. A screen that needs several combines them with `AsyncResult.all`, which reports the first failure and waits for the rest — one loading state, one error state.
- **Writes go through `useDbWrite`** (`src/composables/useDbWrite.ts`), the one edge over the `dbMutation` fn atom. It only accepts a `DbProgram` — `Effect<unknown, never, DbServices>` — so the component composes the repository program with `Effect.catchTag`/`Effect.catchTags` first, then hands it to `write`. When the write lands, the reactivity key is invalidated and every read atom re-reads, so state always mirrors disk with no store method remembering to re-read. Two things the composable owns and a component must not re-implement: the in-flight guard (`isWriting`, which a Save button binds to `disabled`) and the defect, which the fn atom would otherwise swallow whole.
- Plain UI state (a sheet's open flag, toasts) is a writable `Atom.make(...)` behind a small composable. `src/stores/toast.ts` is the pattern, including the writable `computed` for anything a component two-way binds. An immutable module constant is _not_ an atom — the plan catalogue has no async, no failure and nothing to invalidate, so wrapping it buys indirection and no capability.
- No `$reset()` needed: atom state lives in the registry, and browser tests get a fresh registry per render (see `src/__tests__/helpers/renderApp.ts`).
- Why not Pinia? Nothing here needs devtools time-travel or plugins, and the registry-scoped atoms give the piece Pinia never had: reads that Effect programs can invalidate, with failures typed all the way into the template.

## 4. UI

- Feature-owned components in `src/features/<name>/components/`. Features never import from other features; shared pieces go to `src/components/` once they have 2+ consumers.
- Route-level page in `src/views/`, registered in `src/router/index.ts`.
- New tab? Add one entry to `src/router/navigation.ts` and the shell handles the rest. Full-screen route? `meta: { hideNav: true }`.
- Every user-facing string goes through i18n, in `src/i18n/messages/en.ts` **and** `de.ts`. The `MessageSchema` type makes a missing key a compile error.
- Give destructive or ambiguous icon buttons an `aria-label` that includes the item name (see `PlanCard.vue`, whose whole card is the control). The a11y tier will catch bare icon buttons, and `a11y/coverage.ts` will fail the arch tier until the new component names the sweep that renders it.

## 5. Tests, tier by tier

For a feature the size of training, the full set is roughly:

| Tier    | What to cover                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| unit    | domain functions, converters                                                                                  |
| default | the main user flow through the real UI (`plansFlow.spec.ts` pattern: interact, assert UI, assert persistence) |
| a11y    | one axe sweep of the new screen; one of any new dialog                                                        |
| visual  | a screenshot if the screen is part of the shell's core look (`pnpm test:visual:update`)                       |
| arch    | nothing to write; the generic rules pick up new features automatically                                        |
| e2e     | only if the feature carries a load-bearing journey, like persistence across reload                            |

Anything that drives the new screen goes through a page object first: a class in `src/__tests__/pages/` for the browser tiers, and one in `test/e2e/pages/` if the feature reaches e2e. `PlansScreen` is the template, with `BenchmarkSheet` as the nested part; the rules are in [testing-strategy.md](testing-strategy.md). A screen whose contents depend on what is in the database gets a _factory_ fixture rather than a mounted one — read atoms load on subscribe, so seeding has to happen before the mount, and `plans({ benchmark2kMs, planId })` in `fixtures.ts` is what makes that order impossible to get wrong.

## 6. Ship

```bash
pnpm check                     # lint, format, types, knip, unit + arch tiers. One command, ~8 s
pnpm test && pnpm test:a11y    # the browser tiers your feature touches
```

Then walk the flow yourself in a real browser with [agent-browser](agent-browser.md).
Capture, reload, confirm the row survived. A green suite says the code is right;
the walkthrough says the feature is. Anything it turns up gets a test in the tier
that owns it before you commit.

Commit per behavior. The pre-commit gate (~15 s) keeps you honest, and CI runs the full matrix on the PR.
