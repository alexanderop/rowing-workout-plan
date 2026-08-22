---
type: Playbook
title: Adding a feature
description: Build order for a new feature, mapped onto the notes worked example, with the test home for every step.
tags: [features, walkthrough, testing]
status: stable
---

# Adding a feature

The notes feature (`src/features/notes`) is the worked example, and this walkthrough maps its pieces so you can copy the pattern. Build in this order; every step has a test home.

## 1. Storage (if the feature persists data)

- Define the row in `src/db/converters.ts` as a `Schema.Struct` plus a same-name `interface`, with a `Stored*` variant whose old-shape fields are `Schema.optionalKey`. The schema is the source of truth: Dexie's table typing, the read-path decode, and backup validation all derive from it, so they cannot drift. The three training rows (`Benchmark`, `PlanEnrolment`, `Workout`) are the worked example; `StoredDbWorkout` is the one that shows a relaxed field and its backfill.
- Add the table to `src/db/schema.ts`, typed from that schema. New table on a fresh install? Just add it to the **current** version's `stores()`. Changing an existing table? Bump the version, write an `upgrade()`, and relax the changed fields in the `Stored*` schema (see the v1→v2 example).
- Add a converter in `src/db/converters.ts`. Reads have to produce complete domain objects from any historical shape.
- Add a repository in `src/db/repositories/` (`workouts.ts` is the template) and re-export it from `src/db/index.ts`. Merge its `Layer` into `src/db/layer.ts` and nowhere else, and give it a `testLayer` there too, so a program over it runs in the Node unit tier. Nothing outside `src/db` may import deeper than the index; ESLint fails on the import and the arch tests fail your PR. Reads decode every row; writes validate their input. Both fail with tagged errors, not exceptions.
- Add the table to `src/db/backup.ts` in the same commit, reusing the same `Stored*` schema.
- **Tests**: schema decode and converter go in the unit tier; repository CRUD, rejected rows, and the backup round-trip go in `src/__tests__/db/`.

## 2. Domain logic

Pure functions in `src/features/<name>/domain.ts` (sorting, deriving, validating). Keeping them out of components is what makes them unit-tier testable. `src/features/notes/domain.ts` and its spec in `src/__tests__/unit/notes/` are the template.

## 3. State

Atoms via `@effect/atom-vue`, with `src/features/notes/atoms.ts` as the template. Conventions:

- **Reads are atoms.** Build them with `dbRuntime.atom(program)` and wire them with `Atom.withReactivity([NOTES_KEY])` (add a key per table). The atom's value is an `AsyncResult` carrying loading, failure, and data in one value, and components subscribe with `useAtomValue(() => yourAtom)`. Subscribing _is_ the load; there is no `onMounted` fetch and no `isLoaded` flag.
- **Writes go through `dbMutation`** (from `@/db`), which only accepts `Effect<unknown, never, DbServices>`. The component composes the repository program with `Effect.catchTag`/`Effect.catchTags` first, then hands it to the setter from `useAtomSet(() => dbMutation, { mode: 'promise' })`. When the write lands, the reactivity key is invalidated and every read atom re-reads, so state always mirrors disk with no store method remembering to re-read.
- Plain UI state (a sheet's open flag, toasts) is a writable `Atom.make(...)` behind a small composable. `src/stores/quickAdd.ts` and `src/stores/toast.ts` are the pattern, including the writable `computed` for anything a component two-way binds.
- No `$reset()` needed: atom state lives in the registry, and browser tests get a fresh registry per render (see `src/__tests__/helpers/renderApp.ts`).
- Why not Pinia? Nothing here needs devtools time-travel or plugins, and the registry-scoped atoms give the piece Pinia never had: reads that Effect programs can invalidate, with failures typed all the way into the template.

## 4. UI

- Feature-owned components in `src/features/<name>/components/`. Features never import from other features; shared pieces go to `src/components/` once they have 2+ consumers.
- Route-level page in `src/views/`, registered in `src/router/index.ts`.
- New tab? Add one entry to `src/router/navigation.ts` and the shell handles the rest. Full-screen route? `meta: { hideNav: true }`.
- Every user-facing string goes through i18n, in `src/i18n/messages/en.ts` **and** `de.ts`. The `MessageSchema` type makes a missing key a compile error.
- Give destructive or ambiguous icon buttons an `aria-label` that includes the item name (see `NoteCard.vue`). The a11y tier will catch bare icon buttons.

## 5. Tests, tier by tier

For a feature the size of notes, the full set is roughly:

| Tier    | What to cover                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| unit    | domain functions, converters                                                                                  |
| default | the main user flow through the real UI (`notesFlow.spec.ts` pattern: interact, assert UI, assert persistence) |
| a11y    | one axe sweep of the new screen; one of any new dialog                                                        |
| visual  | a screenshot if the screen is part of the shell's core look (`pnpm test:visual:update`)                       |
| arch    | nothing to write; the generic rules pick up new features automatically                                        |
| e2e     | only if the feature carries a load-bearing journey, like persistence across reload                            |

Anything that drives the new screen goes through a page object first: a class in `src/__tests__/pages/` for the browser tiers, and one in `test/e2e/pages/` if the feature reaches e2e. `NotesScreen` and `NotesPage` are the templates; the rules are in [testing-strategy.md](testing-strategy.md).

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
