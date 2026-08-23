<!-- A working plan, not shipped documentation: **Tests** and **Done when**
     are this file's own section labels, and reading them as headings would
     put an h4 under every slice. -->
<!-- markdownlint-disable MD036 -->

# Spec — Plan authoring

Make adding a training plan a file plus a line.

The catalogue was written for one plan and then made to hold a second by
parameterising the parts that differed. What did not differ — twelve weeks,
three-week rotations — became module constants, and those constants are now
load-bearing in `schedule.ts`, `targets.ts` and three views. A third plan of a
different shape is not a data change today; it is a refactor. This spec is that
refactor, plus the four smaller changes that turn "possible" into "cheap".

Nothing here changes what a rower sees. `pete5k` and `pete5kLite` must generate
byte-identical week data at the end of every slice.

**Rules that govern every slice** — the same ones as
[`erg-trainer-epic.md`](erg-trainer-epic.md); that list is not repeated here.
Two apply to almost every line of this spec:

- The catalogue is pure `.ts`: no clock, no storage, no ambient reads.
  `docs/functional-core.md`.
- Shell budget is `max-depth: 1`, complexity 4, 7 statements. The view changes
  in slice 1 add one guard each and must stay inside it.

---

## What it costs today

Adding a plan touches six places, one of which is the plan.

1. `src/features/training/catalog.ts` — rotation tables, a `weekBody`
   callback, a `buildPlan` call, and an entry in `PLANS` (catalog.ts:208).
2. `src/i18n/messages/en.ts` **and** `de.ts` — `plans.catalog.<id>.description`.
3. `src/__tests__/unit/training/catalog.spec.ts` — the `describe.each(PLANS)`
   block (catalog.spec.ts:31).
4. `src/__tests__/unit/training/catalogBuild.spec.ts` — names both plans and
   both session counts as literals.
5. `src/features/training/schedule.ts` — if the plan is not exactly twelve
   weeks in threes.
6. Nothing tells you any of this. There is no `docs/adding-a-plan.md`.

Three of those are structural rather than tedious:

- **Plan shape is a module global.** `PLAN_WEEKS = 12` and
  `ROTATION_WEEKS = 3` live at catalog.ts:40-41 and are imported by
  `schedule.ts` (schedule.ts:3). `rotationFor(weekIndex)` takes no plan
  (schedule.ts:117) and returns `Rotation = 1 | 2 | 3 | 4` (schedule.ts:21),
  which flows into `targetFor`. The "Ongoing" plan the catalogue's own header
  promises (catalog.ts:13) is blocked on this.
- **The shared spec asserts one plan's shape over every plan.**
  `describe.each(PLANS)` requires twelve weeks (catalog.spec.ts:34) and a
  three-week rotation (catalog.spec.ts:75). Those are `pete5k`'s transcription
  pins wearing an invariant's clothes: a differently-shaped plan fails them for
  being different, not for being wrong.
- **`buildPlan` conflates two jobs.** Assigning positional ids is mechanical
  and every plan needs it. Generating weeks from a three-slot rotation is one
  strategy. They are welded together (catalog.ts:163), so a plan that is not
  rotational cannot use the id machinery at all.

---

## Slice 1 — Plan shape belongs to the plan

The enabling refactor. Move twelve and three out of the module and onto the
`Plan` they describe.

- `src/features/training/types.ts`
  - `Plan` gains `readonly rotationWeeks: number` — the length of one pass
    through the cycle. Plan length is already `weeks.length` and stays derived;
    do not add a second field that can disagree with the array.
- `src/features/training/schedule.ts`
  - `export type Rotation = number` — a positive integer, no longer four
    literals. The `as Rotation` SAFETY cast at schedule.ts:123 goes with them:
    it existed only because TypeScript could not see that the quotient fell in
    a fixed range, and there is no fixed range any more.
  - `rotationFor(plan, weekIndex)`, `isRotationEnd(plan, weekIndex)`,
    `isPlanWeek(plan, weekIndex)` — every one of them reads
    `plan.weeks.length` and `plan.rotationWeeks` instead of the constants.
    `rotationNote` already takes a `plan` and keeps its signature.
  - `WeekRangeError` gains no field. It reports the week that was out of
    range; which plan it was out of range _for_ is the caller's context.
  - `rotationNote` picks its variant by position rather than by a fixed
    three-entry table: slot 0 is `first`, the last slot of the rotation is
    `last`, anything between is `middle`, and the plan's final week still wins
    over all three. A one-week rotation makes `first` and `last` collide —
    `last` wins, because the sentence that matters is the one about the cycle
    restarting.
- `src/features/training/catalog.ts`
  - `PLAN_WEEKS` and `ROTATION_WEEKS` stop being exported. `buildPlan` keeps
    them as locals until slice 3 moves them into the per-plan spec.
- `src/views/PlanWeekView.vue`, `TodayView.vue`, `SessionView.vue`
  - Each `targetOf` gains one guard: the plan is already in scope at all three
    call sites (`plan.value`, `activePlan.value`, `current.plan`), so this is a
    `const current = …` and one added clause on an existing null check.
- `src/i18n/messages/en.ts` **and** `de.ts`
  - `plans.rotation.middle` currently opens "Second week of rotation
    {rotation}", which is true only while every rotation is three weeks long.
    Reword it to name the position without the ordinal — "Mid-rotation week of
    rotation {rotation} — the reps lengthen at the same target." A rotation of
    four would otherwise print a confident wrong number, and this is the only
    string in the catalogue that hardcodes the shape.

**Tests** — unit tier, `src/__tests__/unit/training/schedule.spec.ts`.

- Every existing case keeps its expectations and gains a plan argument. This
  slice must not change a single expected value for `pete5k` or `pete5kLite`.
- New: `rotationFor` against a plan with `rotationWeeks: 4` returns 1 for weeks
  1–4 and 2 for week 5 — the case the constants made unrepresentable.
- New: `rotationNote` on a two-week rotation yields `first` then `last`, with
  no `middle`; on a one-week rotation, `last`.
- New: a week past `plan.weeks.length` fails with `WeekRangeError` for a short
  plan even though it would be in range for a twelve-week one.
- `pnpm test:mutation` over `schedule.ts` leaves no survivors. The arithmetic
  moved; the assertions that graded it have to move with it.

**Done when** `rg 'PLAN_WEEKS|ROTATION_WEEKS' src` returns hits inside
`catalog.ts` only, `pnpm check` is green, and the three views render the same
targets and rotation sentences as before.

`refactor(training): plan shape belongs to the plan`

---

## Slice 2 — Invariants and pins, separated

Split the catalogue spec along the line the file's own header already draws
(catalog.spec.ts:8-21) but does not enforce: what is true of _any_ plan, and
what is pinned about _this_ one.

- `src/__tests__/unit/training/planInvariants.ts` — a helper, not a spec:
  `assertPlanInvariants(plan)` runs the `it` blocks that hold for every plan.
  - Week indices contiguous from 1.
  - Every session id unique and positional: `${plan.id}-w${week}-s${position}`.
  - Every `kind` in `SESSION_KINDS`.
  - Every interval session carries positive `reps`, `repDistanceM`, `restMs`.
  - Every `steady` session carries a positive `minDistanceM` and no rep
    structure. **The 10k floor is a pin, not an invariant** — it moves to
    `pete5k.spec.ts` (catalog.spec.ts:65).
  - Rotation self-consistency: weeks at the same slot in different rotations
    are identical but for their ids, derived from `plan.rotationWeeks` and
    skipping any week the plan overrides. This is the generalisation of
    catalog.spec.ts:75.
  - **Not** an invariant: twelve weeks, a three-week rotation, lengthening
    `shortRest` reps. All three are `pete5k` family pins.
- `src/__tests__/unit/training/catalog.spec.ts` — keeps only
  `describe.each(PLANS)` calling the helper, plus the assertion that `PLANS` is
  non-empty and its ids are unique.
- `src/__tests__/unit/training/pete5k.spec.ts` and `pete5kLite.spec.ts` — the
  literals: 71 and 12, 36, the 6/6/…/5 week profile, week 3 session by session
  against the design canvas, the 10k steady floor, reps lengthening across a
  rotation, and the id/name/source triple.
- `src/__tests__/unit/training/catalogBuild.spec.ts` — iterates `PLANS` instead
  of naming two plans, and asserts each has at least one week and one session.
  Its reason for existing (a module that throws at load reports zero failures,
  not one) is unchanged and its header comment stays.

**Tests** — this slice is the tests.

- The proof that the split worked: a fixture plan defined inside
  `planInvariants.spec.ts` — eight weeks, a four-week rotation, five sessions a
  week, no steady rows — passes `assertPlanInvariants` **without any edit to
  the helper**. This fixture never enters `PLANS` and never ships.
- A second fixture, deliberately broken (a duplicated session id), fails it.
  An invariant helper nothing can fail is a helper nothing checks.

**Done when** a plan of a different shape can be added to `PLANS` and the
shared suite has an opinion about it that is about correctness, not about
`pete5k`.

`test(training): separate plan invariants from transcription pins`

---

## Slice 3 — `definePlan`: id assignment split from week generation

Take the mechanical half of `buildPlan` away from the rotational half, so a
plan that is not built from a slot table can still get its ids.

- `src/features/training/catalog/build.ts`
  - `withIds(id, bodies): readonly PlanWeek[]` — the part every plan needs.
    Takes weeks as arrays of `SessionBody` and stamps
    `${id}-w${week}-s${position}` on each. The comment at catalog.ts:157 about
    why ids are positional and why nothing may be inserted mid-week moves here
    intact; it is the reason this function exists.
  - `rotating({ rotations, rotationWeeks, week, overrides })` — one strategy
    among several, returning the `SessionBody[][]` `withIds` consumes.
    `week(slot)` builds a rotation slot; `overrides` is a map from 1-based week
    index to a replacement week. `fullWeek`'s `isFinalWeek` boolean
    (catalog.ts:113) becomes `overrides: { 12: taperWeek }`, which is both
    clearer and what a plan with a different taper needs.
  - `definePlan(spec): Plan` — the seam the two meet at, and the only export a
    plan file calls. It takes id, name, `descriptionKey`, source,
    `rotationWeeks`, and the weeks (from `rotating` or written out literally),
    and returns a frozen `Plan`.
- Session helpers, beside them: `steady(minDistanceM)`, `shortRest(reps, m,
restMs)`, `longRest(…)`, `pacedTwoK(…)`, `piece(distanceM)`. These replace
  the `intervals(kind, prescription)` indirection at catalog.ts:59 and are what
  make a plan file read like a plan instead of like a struct literal.

**Tests** — unit tier, `src/__tests__/unit/training/build.spec.ts`.

- `withIds` over hand-written weeks: ids are positional and unique; a week with
  no sessions yields a week with no sessions rather than throwing.
- `rotating` with `rotations: 2, rotationWeeks: 3` yields six weeks and the
  slot function is called with 0, 1, 2 twice.
- An `overrides` entry replaces exactly that week and leaves its neighbours on
  the rotation.
- An override for a week the plan does not have is a **build-time throw**, not
  a silent no-op. `catalogBuild.spec.ts` is what turns that throw into a
  reported failure.
- The session helpers produce exactly the field sets `PlanSession` documents
  for their kind, and nothing else.

**Done when** `pete5k` and `pete5kLite` are expressed through `definePlan` and
generate week data identical to the current output, asserted by the slice-2
pins passing untouched.

`refactor(training): split plan construction from rotation generation`

---

## Slice 4 — One file per plan

- `src/features/training/catalog/pete5k.ts` — the plan, and the reasoning that
  belongs to it. Most of the 30-line header at catalog.ts:3-29 is about this
  plan specifically (what was adapted, what was invented, why week 3 is the
  pinned one) and moves here.
- `src/features/training/catalog/pete5kLite.ts` — likewise, including the note
  at catalog.ts:130 about why the lite long-rest table has two rows and not
  three, and that mutation testing is what caught it.
- `src/features/training/catalog/index.ts` — `PLANS`, in the order the Plans
  screen lists it, and nothing else. The general reasoning that is about the
  _catalogue_ rather than about a plan — immutable data, never persisted, ids
  stable across a rebuild — stays here.
- Import sites are unchanged: `atoms.ts:13`, `LogRow.vue:6` and `PlansView.vue`
  already import from `'./catalog'` / `'@/features/training/catalog'`, which
  resolves to the directory index.

**Tests** — no new cases. `pnpm knip` must report no orphans, and
`pnpm test:arch` must stay green: the catalogue directory is inside
`features/training` and crosses no boundary.

**Done when** adding a plan means adding one file under
`src/features/training/catalog/` and one line in its index.

`refactor(training): one file per plan in the catalogue`

---

## Slice 5 — A description that cannot be missing

`descriptionKey: string` (types.ts:93) means a plan pointing at a key nobody
added prints the raw key on screen. The `Plan` doc comment at types.ts:83-87
already claims otherwise — "a plan added to the catalogue without a description
does not compile" — and the type does not deliver it. `i18nKeys.test.ts` will
not catch it either: it flags keys nothing _names_, not names with no key.

- `src/features/training/types.ts`

  ```ts
  type PlanDescriptionKey =
    `plans.catalog.${string & keyof MessageSchema['plans']['catalog']}.description`
  ```

  Type-only import of `MessageSchema` from `@/i18n/types`. Checked against
  `boundaries.test.ts`: no rule forbids a feature importing `@/i18n`, and a
  type-only import adds nothing at runtime, so `catalog.ts` stays pure.

- If that import is judged too much coupling for the pure core, the fallback is
  an arch test asserting every `PLANS` entry's `descriptionKey` resolves in
  `en`. Weaker — it fails at test time rather than at compile time — but it
  closes the same hole. Take the type first.

**Tests** — unit tier, plus the type itself.

- A `@ts-expect-error` case in `types.spec.ts`: a plan literal with a
  `descriptionKey` naming a catalogue entry that does not exist does not
  compile. Without the `@ts-expect-error` the test is asserting nothing.
- `describe.each(PLANS)`: `t(plan.descriptionKey)` resolves to a non-empty
  string that is not the key itself, in `en` **and** `de`.

**Done when** deleting `plans.catalog.pete5kLite` from `en.ts` is a type error.

`feat(training): make a plan without a description a compile error`

---

## Slice 6 — `docs/adding-a-plan.md`

The convention in this repo is that a repeatable task gets a concept file. This
is the most repeatable task in the app and the only one without one.

- `docs/adding-a-plan.md` with the standard frontmatter (`type`, `title`,
  `description`, `tags`, `status`), written against the post-slice-5 code:
  - The one file and the one line, with a complete worked plan file.
  - Which decisions the catalogue owns and which it does not — a plan says what
    to row; `targets.ts` says how fast, and adding a plan is not the moment to
    touch the offset table.
  - Why session ids are positional and why nothing may be inserted into the
    middle of an existing week: an id that moves silently re-points every
    completed workout in the log.
  - Where a plan's numbers go in the tests: invariants are inherited, pins are
    written, and a plan with no pin file is a plan nobody transcribed carefully.
  - The i18n obligation, in both locales, and that the type now enforces it.
  - The two spots a _new session kind_ additionally touches —
    `SESSION_KINDS`, `TARGET_OFFSETS_MS`, `RATE_RANGES`, `session.ts`'s
    sentence style, and `plans.kind.*` — with a note that adding a kind is a
    much larger change than adding a plan and usually the wrong answer.
- One row in the `docs/index.md` concept table: _Adding a plan — Adding or
  editing a training plan in the catalogue._

**Tests** — `pnpm lint` covers markdownlint. The real check is the drill below.

**Done when** someone who has not read `catalog.ts` can add a plan from this
file alone.

`docs: how to add a training plan`

---

## Acceptance — the new-plan drill

The spec is done when this can be executed without editing anything outside the
two files it names:

1. Add `src/features/training/catalog/pete5kBase.ts` — a hypothetical eight-week
   build, four-week rotations, four sessions a week, no taper.
2. Add its description to `en.ts` and `de.ts`.
3. Register it in the catalogue index.
4. `pnpm check` is green. The shared invariants have an opinion about it. No
   existing spec was edited. `schedule.ts`, `targets.ts` and the three views
   were not opened.

Then revert it. The drill is the proof, not a plan we ship.

---

## Out of scope, and known limits carried forward

- **The published continuous Pete Plan.** Slice 1 removes the twelve-week
  ceiling that blocks it, but an unbounded plan needs a `weeks` array that does
  not end, which is a different data model (a generator, or a rotation the
  screens index into modulo its length) and a different Plan week screen. It
  gets its own spec.
- **`ROTATION_STEP_MS` is unbounded.** `targets.ts:161` subtracts
  `(rotation - 1) × 100 ms` with no floor, which is fine for four rotations and
  absurd for twelve. Widening `Rotation` to `number` in slice 1 makes a plan
  that reaches rotation 12 expressible without making its targets sane. Leave
  the arithmetic alone; the first plan long enough to hit it is the change that
  should decide whether it clamps.
- **The offset and rate tables stay one per app, not one per plan.** Every plan
  in the catalogue is paced from the same 2k model, and per-plan pacing is a
  different argument from per-plan structure.
- **No UI changes.** The Plans screen already counts weeks and sessions off the
  plan itself (`planSummary`, progress.ts:119) and de-duplicates sources
  (`PlansView.vue:56`), so a third plan appears with no view work.
