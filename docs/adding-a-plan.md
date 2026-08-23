---
type: Playbook
title: Adding a plan
description: Adding or editing a training plan in the catalogue — the one file and the one line, what a plan may decide, and where its numbers go in the tests.
tags: [training, catalog, i18n, testing]
status: stable
---

# Adding a plan

A plan is a file under `src/features/training/catalog/` and a line in
`catalog/index.ts`. Everything else — the Plans screen, the week screen, the
targets, the progress card — reads the plan and needs no change.

That is the whole claim, and it is checked: the acceptance drill at the end of
this file adds a plan of a shape the catalogue has never held and expects
`pnpm check` to go green without `schedule.ts`, `targets.ts` or a view being
opened.

The claim holds for a plan written in the vocabulary below. `peteBeginner` was
not one — it needed timed sessions and optional ones, neither of which
existed — and it cost two session kinds, a flag, and edits to `session.ts`,
`schedule.ts`, `progress.ts` and four components. That is the price of a new
kind, and it is the reason to check first whether the session you want is an
existing kind with different numbers.

## The one file

```ts
// src/features/training/catalog/pete5kBase.ts
import { definePlan, longRest, MINUTE_MS, rotating, shortRest, steady } from './build'
import type { SessionBody, WeekBody } from './build'
import type { Plan } from '../types'

/**
 * Eight weeks of four-week rotations — base before the 5k plan.
 *
 * Adapted from thepeteplan.com. The reasoning that belongs to *this* plan
 * lives here: what was taken from the published version, what was invented,
 * and which week the numbers were transcribed against.
 */

const ROTATIONS = 2
const ROTATION_WEEKS = 4

/** The floor on a steady row, with no ceiling — the screens say "8k+". */
const STEADY = steady(8000)

/**
 * The rotation tables, indexed by a week's place in its cycle (0…3). Reading
 * down a column is one rotation; the reps lengthen as you go.
 */
const SHORT_REST_ROTATION: readonly SessionBody[] = [
  shortRest(10, 400, MINUTE_MS),
  shortRest(8, 500, MINUTE_MS),
  shortRest(6, 750, MINUTE_MS),
  shortRest(6, 1000, MINUTE_MS),
]

const LONG_REST_ROTATION: readonly SessionBody[] = [
  longRest(6, 750, 3 * MINUTE_MS),
  longRest(5, 1000, 3 * MINUTE_MS),
  longRest(4, 1250, 3 * MINUTE_MS),
  longRest(4, 1500, 3 * MINUTE_MS),
]

/** Four sessions: two steady rows interleaved with the week's two hard ones. */
const baseWeek = (slot: number): WeekBody => [
  STEADY,
  SHORT_REST_ROTATION[slot],
  STEADY,
  LONG_REST_ROTATION[slot],
]

export const pete5kBase: Plan = definePlan({
  id: 'pete5k-base',
  name: 'Pete Plan 5k — Base',
  descriptionKey: 'plans.catalog.pete5kBase.description',
  source: 'thepeteplan.com',
  rotationWeeks: ROTATION_WEEKS,
  weeks: rotating({ rotations: ROTATIONS, rotationWeeks: ROTATION_WEEKS, week: baseWeek }),
})
```

## The one line

```ts
// src/features/training/catalog/index.ts
import { pete5kBase } from './pete5kBase'

export const PLANS: readonly Plan[] = [pete5k, pete5kLite, pete5kBase]
```

`PLANS` is in the order the Plans screen lists it. Add a **named re-export**
(`export { pete5kBase } from './pete5kBase'`) only when something imports the
plan by name — its pin spec, in practice. Adding one nothing imports fails
`pnpm knip`, which is the right answer: an export with no reader is dead
surface.

## What the catalogue decides, and what it does not

A plan says **what to row**. It does not say how fast.

| Decision                          | Owner                                    |
| --------------------------------- | ---------------------------------------- |
| Which sessions, in what order     | the plan file                            |
| Which of them are optional        | the plan file (`optional(…)`)            |
| How many weeks, how long a cycle  | the plan file (`weeks`, `rotationWeeks`) |
| The target split for a session    | `targets.ts` (`TARGET_OFFSETS_MS`)       |
| The stroke-rate window            | `targets.ts` (`RATE_RANGES`)             |
| How a session reads as a sentence | `session.ts`                             |
| Where a rower is in the plan      | `schedule.ts`                            |

The offset and rate tables are **one per app, not one per plan**: every plan in
the catalogue is paced from the same 2k model, and per-plan pacing is a
different argument from per-plan structure. Adding a plan is not the moment to
touch them. If the plan you are adding genuinely needs a different pace model,
that is a spec, not a table edit.

## Session ids are positional, and that is load-bearing

`definePlan` stamps `${id}-w${week}-s${position}` on every session, and a
completed workout in the log stores that id and nothing else. So:

- **Appending to a week is safe.** Nothing before it moves.
- **Inserting into or reordering an existing week is not.** Every id after the
  insertion point shifts by one, which silently re-points every logged workout
  at a different session. A rower's history changes shape under them and no
  test fails.

This applies to a plan that has shipped. While you are still writing one,
reorder freely.

## Optional sessions

`optional(session)` marks a session the plan offers without requiring it —
Pete's `[square brackets]`. It is one-way: absent means required, and nothing
writes `false`, so no reader has to think about a third state.

Three things read the flag, and between them they are what "optional" means:

- `schedule.ts` skips optional sessions when it picks what is **next**, and
  leaves them out of `done`/`total`. Without that, an optional day nobody
  meant to row becomes the session Today offers forever and the progress bar
  freezes behind it. Rowing one is still logged and still ticks in the week
  list; it just moves nothing.
- `progress.ts` counts them as `optionalPerWeek`, apart from the weekly
  commitment. A plan of three core sessions plus two you might pick up is a
  three-a-week plan, and a card saying "5 / week" turns its own invitation
  into a reason not to start.
- `SessionRow.vue` badges them.

**Append them; never interleave.** The ids are positional, so an optional
session placed in front of a core one re-points every workout logged against
everything after it. `peteBeginner` puts its two at positions 4 and 5 of every
week for exactly this reason, and its spec pins that.

## Where the numbers go

Two kinds of assertion, and the difference decides which file yours goes in.

**Invariants** — true of *any* plan — are inherited. Registering a plan in
`PLANS` puts it through `assertPlanInvariants`
(`src/__tests__/unit/training/planInvariants.ts`) automatically: contiguous
week indices, unique positional ids, real kinds, more than one rep on every
interval, the rotation repeating, and — from `REQUIRED_FIELDS`, one row per
kind — exactly the numbers that kind carries, all positive, and none belonging
to another kind. You write nothing for these, and you do not edit the helper to
make your plan pass — a plan that fails an invariant is wrong.

Adding a *kind* is the one case that does edit it: a new kind is a new row in
`REQUIRED_FIELDS`, and a new field on `PlanSession` is a new column in
`ALL_FIELDS`. That is not making a plan pass, it is telling the table what the
kind is.

**Transcription pins** — the literal numbers — go in a file of your own,
`src/__tests__/unit/training/pete5kBase.spec.ts`, beside the plans that already
have one. They exist because a plan is the one part of this app that comes from
outside it: if a rep distance is wrong, everything downstream is consistently,
confidently wrong and every invariant still passes. Pin the week the plan was
transcribed against, session by session, plus the totals — and pin the plan's
own shape there, because twelve weeks and a three-week rotation are `pete5k`'s
numbers, not the catalogue's.

**A plan with no pin file is a plan nobody transcribed carefully.**

If you are unsure which side a case belongs on: *could a plan be correct and
fail it?* If yes, it is a pin.

## The i18n obligation

`plans.catalog.<key>.description` in **both** `src/i18n/messages/en.ts` and
`de.ts`. The type now enforces the first half — `descriptionKey` is a template
literal over the keys `en.ts` actually has, so a plan naming a description
nobody wrote does not compile, and deleting a description out from under a plan
is a type error at the plan.

`de.ts` is the half the type cannot see, since the schema is built from `en`
alone. `catalog.spec.ts` resolves every plan's key in both locales, which is
what catches a translation that was never added.

## Adding a session *kind* is a much larger change

Almost never the right answer. A new kind touches, at minimum:

- `SESSION_KINDS` in `types.ts` — the runtime array the union is derived from.
- `TARGET_OFFSETS_MS` and `RATE_RANGES` in `targets.ts` — how fast, and at
  what rate. Neither has a default, and both are `satisfies Record<SessionKind,
  …>`, so the compiler asks.
- `session.ts` — which of the five sentence styles it is written as, and
  `REQUIRED_FIELDS` in `planInvariants.ts`, which is the same question asked
  of the data.
- `plans.kind.*` and `plans.session.*` in `en.ts` and `de.ts`, plus the
  `SessionRow.vue` entry in `INTERPOLATED` (`i18nKeys.test.ts`), since both
  keys are built at runtime.

And then the question of whether the new kind is rotation-shifted
(`isRotationShifted`), which is a pacing decision, not a catalogue one. Before
adding one, check whether the session you want is an existing kind with
different numbers. It usually is.

`timedSteady` and `timedIntervals` are the two that were not. Nothing in the
catalogue could express "30′" or "3 × 10′ / 2′ rest" — every other kind is
prescribed in metres — and from week 12 the beginner plan makes one of them a
core session every week. Both are named for their **pacing** rather than by
symmetry with `distancePiece`: a `distancePiece` is a hard test piece, a timed
session is aerobic work the clock happens to bound (Pete's own "Group 1"), and
neither is rotation-shifted for the same reason `steady` is not.

A timed session states no distance, which is the part that reaches beyond
`targets.ts`. `sessionDistanceM` returns zero for one — correctly, since
"roughly 23 km" is the plan speaking — so `sessionWorkMs`/`weekWorkMs` carry
the time, the week header quotes it beside the metres, and
`sessionDistanceEstimateM` derives metres off the session's own target for the
screens with a metres field on them.

## The drill

The proof that this file is complete. Add a plan of a shape the catalogue does
not hold — eight weeks, four-week rotations, four sessions a week, no taper —
touching only:

1. `src/features/training/catalog/<plan>.ts`
2. `src/features/training/catalog/index.ts`
3. `src/i18n/messages/en.ts` and `de.ts`

Then `pnpm check`. It must be green, the shared invariants must have run over
the new plan (the test count goes up without a spec being written), and
`schedule.ts`, `targets.ts` and the three views must not have been opened.

If any of that fails, the failure is in the code or in this file, not in the
plan.

## Known limits

`ROTATION_STEP_MS` in `targets.ts` takes 100 ms off the target for each
rotation past the first, with no floor. That is fine for four rotations and
absurd for twelve. A plan long enough to reach rotation 12 is expressible
today and would be paced nonsense; the first plan that actually wants one is
the change that should decide whether the arithmetic clamps.

**There is no steady-paced distance-interval kind.** A distance interval is
priced as hard work whatever its rest, so `peteBeginner`'s week-4 optional
`2 × 2500m / 2min` — endurance work in the source, at roughly 2k+20s — is a
`shortRest` paced at 2k+6s. One session in 120 did not justify an eighth kind.
It is pinned in `peteBeginner.spec.ts` so it cannot be quietly "fixed" into a
claim the source does not make; the plan that needs a second one of these is
the change that should add the kind.
