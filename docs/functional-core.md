---
type: Architecture Decision
title: Functional core, imperative shell
description: Three layers (core, reactive shell, platform edge) with the budget that keeps decisions out of components, the ban that keeps the clock out of the core, and the test-doubles tripwire that proves the split actually happened.
tags: [architecture, purity, testing, effect, boundaries]
status: stable
---

# Functional core, imperative shell

Gary Bernhardt's [Boundaries](https://www.destroyallsoftware.com/talks/boundaries)
splits an app in two: a **functional core** of pure decisions over immutable
values, wrapped in an **imperative shell** that does the I/O. The shell calls
the core; the core cannot call the shell.

The part usually dropped is the part that makes it checkable. Bernhardt's claim
is not that purity is nice. It is falsifiable, in two directions:

- **The core is testable with no test doubles.** If a test needs a mock, the
  thing under test is shell.
- **The shell ends up with few conditionals.** Decisions live in the core, so
  what is left is sequencing. A branchy shell means the split did not happen.

Both are properties of the _tree_, not of any one file, which is why they are
enforced rather than reviewed.

## Why this codebase gets three layers, not two

A Vue component is never pure, because reactivity is mutation. So "component =
shell, everything else = core" would put composables, stores, atoms and
repositories on the wrong side of a two-way split. The honest shape here is
three layers, and the boundaries were not invented for this document. Three
independent signals already agreed on them:

1. `src/lib/persistentStorage.ts` and `src/lib/swUpdateCheck.ts` are the only
   two modules in the app that nest a conditional two levels deep.
2. They are the only two whose unit specs reach for a test double.
3. They are the two [the index](index.md) already called out as
   "browser-platform plumbing with no domain content", where `try`/`catch` is
   deliberate.

Three different questions, one answer. That is the edge; everything above it is
reactive glue; what is left is the core.

| Layer              | What it is                                           | Where it lives                                                                                                                                                         | Rule                                                  |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Core**           | Pure decisions over values                           | `db/converters.ts`, `features/*/{catalog,domain,history,pace,progress,schedule,session,targets,types}.ts`, `lib/installPlatform.ts`, `lib/utils.ts`                    | Deterministic; no complexity cap                      |
| **Reactive shell** | Components, composables, stores, atoms, repositories | `**/*.vue`, `composables/`, `stores/`, `db/`, `features/*/atoms.ts`, `features/*/use*.ts`                                                                              | Stays thin: `max-depth 1`, complexity 4, 7 statements |
| **Platform edge**  | Modules whose whole job is one fallible browser API  | `lib/persistentStorage.ts`, `lib/swUpdateCheck.ts`, `lib/download.ts`, `lib/themeColor.ts`, `lib/backupFile.ts`, `lib/webVitals.ts`, `lib/observability.ts`, `main.ts` | Exempt from both, and the only place a spec may mock  |

The three sets are defined once, as exported globs in `eslint.config.ts`.
`functionalCore.test.ts` reads them back out of that file as text rather than
importing them, because the config belongs to `tsconfig.node` and the tests to
`tsconfig.vitest`, so a layer edited in one place and not the other fails
loudly instead of drifting.

## Composables are shell, not core

The natural refactor instinct, "this component has too much logic, extract a
composable", moves code sideways rather than down. A composable is reactive and
lifecycle-bound: it is the middle rung, an adapter. The core is the plain
TypeScript _below_ it.

`useNoteAge` is the worked example, and the split is the whole pattern in two
files:

- `features/notes/domain.ts` owns _what_. `noteAge` reads "now" from
  Effect's `Clock` service, never `Date.now()`, so `TestClock` drives every
  bucket boundary in the unit tier with no fake timers.
- `features/notes/useNoteAge.ts` owns _when_. It re-evaluates the program
  every 30 s so a card ages on screen.

Extract to a composable when the question is _when_. Extract to a `.ts` module
when the question is _what_. Only the second one is the core, and only the
second one gets cheap to test.

## The three rules

### 1. The shell stays thin

`max-depth: 1`, `complexity: 4`, `max-statements: 7` on the reactive shell.

These are the measured maxima of the tree that was already here, not round
numbers. `.vue` peaked at complexity 4 and 6 statements, composables at 7
statements, and nothing in the layer nested two deep. The limits only tighten
from here, so no refactor was needed to land them, which is the only kind of
architecture rule that survives contact with a deadline.

`max-depth: 1` is the load-bearing one. A guard clause is one level and reads as
the shell saying "not my job"; a second level is the first observable sign that
a decision failed to move down.

Line count is deliberately not capped. An Effect pipeline is long but flat.
`save` in `QuickAddNoteSheet.vue` is 25 lines at complexity 2, so
`max-lines-per-function` would punish exactly the style we want.

### 2. The core stays deterministic

Same input, same answer, forever, on any machine. Banned in core modules:
`Date.now()`, `new Date()`, `Math.random()`, and ambient reads such as
`localStorage`, `navigator`, `document`, `window`, `fetch`, `crypto`,
`setTimeout` and friends.

The escape hatch is the shape `detectInstallPlatform` already has: name the
signal in the signature. It takes `{ userAgent, maxTouchPoints }` instead of
poking at `navigator`, which is why the iPadOS desktop-UA case is pinned by a
unit test rather than discovered on a device. Where a value has to be generated
rather than passed, put it behind a service default the way `db/generateId.ts`
does with `crypto.randomUUID`.

`Effect.run*` is banned in the core too. The core **builds** programs and hands
them up; running one is the shell's job. A core module that runs its own has
taken the runtime choice, and `TestClock` with it, away from every caller.

There is no complexity budget on the core, deliberately. The pattern works by
pushing decisions down, so the layer that receives them must not be the layer
that punishes them.

### 3. The core needs no test doubles

The tripwire, and the one that cannot be satisfied by moving code around.

`vi.mock`, `vi.fn`, `vi.spyOn`, `vi.stubGlobal` and `vi.stubEnv` are allowed in
the unit tier only in specs for platform-edge modules. Anywhere else they mean
the code under test is describing a collaborator it cannot call for real, which
is the definition of shell. The fix is to move the decision into a core module
and test it on values, or to move the module to the edge and say why.

`TestClock` is explicitly not a double by this definition, and the distinction
matters: swapping a service implementation is the seam the core is built around,
not a hole punched in one. The spec that drives `noteAge` through
`TestClock.adjust` is doing the opposite of mocking.

Every core module also needs a unit spec. Being cheap to test is the entire
return on putting it there, so a core module without one is core in name only.
Exemptions go in `UNTESTED_CORE` with a reason, and a stale entry fails.

## Enforced twice

The pairing [used everywhere else in this project](index.md): one enforcer for
the code, one for the tree.

- **`eslint.config.ts`** grades code, and covers `.vue`, which ArchUnitTS
  cannot parse and which is where the shell actually lives.
- **`src/__tests__/architecture/functionalCore.test.ts`** grades what lint
  structurally cannot see: that every layer glob still matches a real file (a
  renamed module turns its rule off _silently, and green_), and the
  test-doubles property, which is a fact about the test tier rather than about
  any source file.
- **`src/__tests__/architecture/boundaries.test.ts`** feeds ESLint deliberate
  violations of both directions of every rule and asserts they are caught. A
  rule that only ever sees passing input is not a rule.

## Adding a feature

Nothing to configure. `src/features/<name>/domain.ts` is matched by the core
glob the moment it exists, and gets the determinism rules and the unit-spec
requirement automatically. See [adding a feature](adding-a-feature.md) for the
build order.

Adding a module to `lib/` is the case that needs a decision. Ask what it reads.
If it takes its inputs as arguments it is core, and if its whole job is one
fallible browser API it belongs in `PLATFORM_EDGE` in `eslint.config.ts`, which
is a deliberate, reviewable act rather than a default.
