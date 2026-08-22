<!-- A working plan, not shipped documentation: **Tests** and **Done when**
     are this file's own section labels, and reading them as headings would
     put an h4 under every slice. -->
<!-- markdownlint-disable MD036 -->

# Epic — Concept2 erg trainer

Turn `vue-pwa-starter` into a rowing-only training app: follow a structured
plan, row the session with live data off a PM5 over Web Bluetooth, keep the
log on-device.

Design canvas: <https://claude.ai/code/artifact/13df41f9-000f-4063-9e57-ba0ac9b1947b>

**Rules that govern every slice** — from `docs/index.md` and the concept files
it links. Read the linked doc before the slice that touches it.

- Core is deterministic `.ts`: no `Date.now()`, no `new Date()`, no ambient
  reads, no `Effect.run*`. `now` arrives as a parameter. — `docs/functional-core.md`
- Shell budget is `max-depth: 1`, complexity 4, 7 statements. Decisions live in
  the core; components wire.
- Everything reachable from `@/db` is Effect. Browser plumbing with no domain
  content is plain async TS in `src/lib/` and listed in `PLATFORM_EDGE`
  (`eslint.config.ts:258`).
- Reads are atoms (`dbRuntime.atom` + `Atom.withReactivity`); writes go through
  `dbMutation` with every failure caught by tag first.
- One `Schema.Struct` + same-name `interface` per row. Never a hand-written type
  beside a schema.
- Tests are not colocated. Anything driving UI goes through a page object.
- Every string in `en.ts` **and** `de.ts`. Runtime-built keys must be declared
  in the `INTERPOLATED` map or `i18nKeys.test.ts` fails.
- Every control: 44px floor, `active:scale-…`, `touch-manipulation`,
  `select-none`. `pnpm test:touch` is the only tier that sees a coarse pointer.
- Conventional Commits with scope. `pnpm check` green before every commit.

**Blocked on input** (does not stop slices 0–7):

- **PM5 byte layouts.** ~~Needs the *Concept2 PM Bluetooth Smart Communication
  Interface Definition* PDF~~ — found and vendored at
  `specs/reference/PM5_BluetoothSmartInterfaceDefinition.pdf` (revision 1.30),
  which is the authority for every offset and scaling slices 8–11 decode. See
  the README beside it for what it covers and why the mirror URL is the one
  that works.
- **Real frames captured off the erg**, committed as
  `src/__tests__/fixtures/pm5/*.json`. Still outstanding, and not obtainable
  from prior art: the published PM5 projects store *decoded* values rather than
  the bytes they came from, so none of them substitutes for a capture. A
  decoder tested only against its own author's reading of the document is
  tested against nothing. Slice 8 can be **written** from the PDF; it cannot be
  **trusted** until a captured 6×1k replays into the right splits.
- **The pacing model.** Target-splits-from-your-2k is our invention, not Pete's.
  Slice 3 ships one table of offsets to argue about, in one place.

**Known fix carried in from the mockups:** week 12 of the full plan has **five**
sessions, not six (taper into the 5k test). Total is **71**, not the 72 shown on
the Plans screen. The catalogue is the source of truth; the UI reads from it.

---

## Slice 0 — Clear the deck

Remove the notes worked example. The app is left with Settings only, and green.

- Delete `src/features/notes/`, `src/views/NotesView.vue`,
  `src/db/repositories/notes.ts`.
- Drop the `notes` table from `src/db/schema.ts`, its converter and schemas from
  `src/db/converters.ts`, and its entry in `src/db/backup.ts`.
- Remove `src/stores/quickAdd.ts` and the `#center-action` wiring in `App.vue`
  (it comes back in slice 10 as *start a row*).
- Delete the notes specs: `src/__tests__/unit/notes/`,
  `src/__tests__/features/notes/`, `src/__tests__/db/` notes cases, the
  `NotesScreen` page object and its fixture entry, e2e notes steps and pages.
- Strip `notes.*` and `quickAdd.*` keys from `en.ts` and `de.ts`.
- Router: `/` temporarily points at Settings so the app still boots.

**Tests** — nothing new. `pnpm check` and `pnpm test` must be green with the
feature gone; `knip` must report no orphans.

**Done when** the app boots, Settings works, backup export/import round-trips an
empty database, and no `notes` string remains outside git history.

`chore: remove the notes worked example`

---

## Slice 1 — Pace core

The arithmetic every other slice depends on. Pure, no UI, no storage.

- `src/features/training/pace.ts`
  - `wattsFromSplit(splitMs)` — Concept2: `watts = 2.80 / (secondsPerMetre)³`,
    where `secondsPerMetre = splitMs / 1000 / 500`
  - `splitFromWatts(watts)` — the inverse, `(2.80 / watts)^(1/3)`
  - `durationMsFor(distanceM, splitMs)` / `splitFor(distanceM, durationMs)`
  - `formatSplit(splitMs)` → `"1:52.4"`, `parseSplit("1:52.4")` → ms
  - `paceBand(splitMs, toleranceMs)` → `{ lower, upper }` for the live screen
- Guard the domain: zero/negative distance or duration returns a typed failure,
  not `Infinity`. These feed a UI that must not render `NaN`.

**Tests** — unit tier, `src/__tests__/unit/training/pace.spec.ts`.

- Property: `splitFromWatts(wattsFromSplit(s)) ≈ s` across a plausible range
  (1:20–3:00), within float tolerance.
- Property: `wattsFromSplit` is strictly monotonic decreasing in `splitMs`.
- Property: `parseSplit(formatSplit(ms)) ≈ ms` to 0.1s.
- Table: known pairs — 1:52.4 ↔ 247 W, 1:46.0 ↔ 294 W, 2:06.0 ↔ 175 W.
- `pnpm test:mutation` over this file should leave no survivors; it grades the
  assertions, and this is the file where a weak assertion costs most.

**Done when** every target split shown in the design canvas can be reproduced
from the module.

`feat(training): pace and power conversions`

---

## Slice 2 — Plan catalogue and schedule

The Pete Plan as immutable data plus the functions that locate you in it.
Still pure, still no storage.

- `src/features/training/types.ts`
  - `SessionKind = 'steady' | 'shortRest' | 'longRest' | 'pacedTwoK' | 'distancePiece'`
  - `PlanSession = { id, kind, reps?, repDistanceM?, restMs?, distanceM?, minDistanceM? }`
  - `PlanWeek = { index, sessions: PlanSession[] }`
  - `Plan = { id, name, source, weeks }`
- `src/features/training/catalog.ts` — `pete5k` (12 weeks, 6/6/6/6/6/6/6/6/6/6/6/**5** = 71)
  and `pete5kLite` (12 × 3 = 36), transcribed from thepeteplan.com.
  - `pacedTwoK` is **not** three hard 2ks: rep 1 and rep 3 are steady-paced,
    rep 2 is a submaximal 2k test. Encode per-rep intent, or the target logic in
    slice 3 will pace it wrong.
  - `steady` carries `minDistanceM: 10000` and no upper bound — "10k+".
- `src/features/training/schedule.ts`
  - `positionFor(plan, completedSessionIds)` → `{ weekIndex, sessionIndex, done, total }`
  - `nextSession(plan, completedSessionIds)` → `PlanSession | null`
  - `rotationFor(weekIndex)` → `1 | 2 | 3 | 4` — the 3-week cycle the plan is
    built on, and what the Plan week screen explains
  - `isRotationEnd(weekIndex)`

**Tests** — unit tier, `src/__tests__/unit/training/`.

- Catalogue invariants as properties over both plans: every session id unique;
  every `reps × repDistanceM` positive; kinds all in the union; week indices
  contiguous from 1.
- `pete5k` totals 71 sessions and 12 weeks; `pete5kLite` totals 36. Assert the
  literal numbers — this is the check that catches a transcription slip.
- Spot-check transcription against the source: week 3 is
  `[steady, 6×1k/1', steady, 4×1800m/4', steady, 3×2k/3']`; week 12 has 5.
- `positionFor` with 0, 1, mid-plan and all-complete inputs.

**Done when** the Plan week screen's content can be generated from the
catalogue with no hard-coded strings.

`feat(training): plan catalogue and schedule position`

---

## Slice 3 — Targets

Turns a 2k benchmark into a target split per session. **The invented part** —
one table, one place to argue.

- `src/features/training/targets.ts`
  - `TARGET_OFFSETS_MS: Record<SessionKind, number>` — seconds off 2k pace,
    exported and commented so it is tunable without reading the callers
  - `targetFor(session, benchmark2kMs, rotation)` → `{ splitMs, rateRange, watts }`
  - Rotation shifts the short/long-rest targets: same pace as reps lengthen
    within a rotation, a tenth to a second faster on the next — that rule is the
    plan's spine and belongs here, not in the UI
  - `pacedTwoK` returns **per-rep** targets, not one split
- Starting offsets, to be argued with: steady +20s, shortRest +6s,
  longRest +4s, pacedTwoK middle +1s, distancePiece scaled by distance.

**Tests** — unit tier.

- Property: for any benchmark, `steady` target is always slower than
  `shortRest`, which is slower than `longRest`, which is slower than the
  `pacedTwoK` middle rep. The ordering is the invariant; the numbers are taste.
- Property: a faster benchmark yields a faster target for every kind.
- `pacedTwoK` returns three targets with reps 1 and 3 equal and slower than 2.
- Table: 2k of 7:04.2 reproduces the canvas figures — 1:52.4 shortRest,
  1:50.0 longRest, ~2:06 steady.

**Done when** every number on the Session detail mockup is derived, not typed.

`feat(training): target splits from a 2k benchmark`

---

## Slice 4 — Storage

First slice that persists. Follows `docs/adding-a-feature.md` step 1 exactly.

- `src/db/converters.ts` — three rows, each a `Schema.Struct` + same-name
  `interface` + a `Stored*` variant with `Schema.optionalKey` for future fields:
  - `Benchmark` — `{ id, kind: '2k'|'5k'|'6k', timeMs, recordedAt }`
  - `PlanEnrolment` — `{ id, planId, startedAt, active }`. Deliberately **does
    not** store completions: they derive from workouts carrying a
    `planSessionId`, so there is one source of truth and no reconciliation.
  - `Workout` — `{ id, startedAt, source: 'erg'|'manual', planSessionId?,
    distanceM, durationMs, avgSplitMs, avgWatts?, avgRate?, intervals }`
  - `WorkoutInterval` — `{ index, distanceM, durationMs, splitMs, watts?, rate?, restMs? }`
- `src/db/schema.ts` — three new tables on the **current** version's `stores()`
  (fresh install, no migration). Index `workouts` by `startedAt` and
  `planSessionId`.
- `src/db/repositories/{benchmarks,enrolments,workouts}.ts` — `Context.Service`
  classes with `Layer`s, modelled on `repositories/notes.ts` as it was. Reads
  decode every row; writes validate the draft; both fail with tagged errors.
- Register layers in `src/db/layer.ts` **only**. Re-export from `src/db/index.ts`.
- `src/db/backup.ts` — all three tables, reusing the `Stored*` schemas, same commit.
- Reactivity keys `WORKOUTS_KEY`, `TRAINING_KEY`.

**Tests**

- unit: schema decode and converters, including a historical row missing an
  optional field, `src/__tests__/unit/db/`.
- `src/__tests__/db/`: repository CRUD, a rejected malformed row, and the backup
  round-trip carrying all three tables.

**Done when** a workout written, exported, wiped and re-imported comes back
identical.

`feat(db): workouts, enrolments and benchmarks`

---

## Slice 5 — Onboarding and Plans browser

First screens. Read-only, no workout logging yet.

- `src/features/training/atoms.ts` — `plansAtom` (catalogue, no db),
  `activeEnrolmentAtom`, `benchmarkAtom`, all `dbRuntime.atom` +
  `Atom.withReactivity([TRAINING_KEY])`.
- `src/views/PlansView.vue` — active plan card with progress, browse list.
- `src/features/training/components/PlanCard.vue`,
  `BenchmarkSheet.vue` (enter your 2k, built on `molecules/dialog/`).
- Router: `/plans`; nav entry `plans` in `src/router/navigation.ts`.
- Empty state when no benchmark is set — the Plans screen is useless without one,
  so it asks first.
- i18n: `plans.*`, `benchmark.*`. `t(\`plans.kind.${kind}\`)` needs an
  `INTERPOLATED` entry listing every `SessionKind`.

**Tests**

- default tier: `PlansScreen` page object; enrol in a plan, assert the active
  card and that the enrolment persisted.
- a11y: one axe sweep of `/plans` and one of the benchmark sheet.

**Done when** you can set a 2k, enrol, and see week 1 waiting.

`feat(training): plans browser and benchmark entry`

---

## Slice 6 — Plan week and Session detail

- `src/views/PlanWeekView.vue` — `/plans/:planId/weeks/:week`. Week strip
  (all 12, horizontally scrollable, 44px chips), rotation explainer, session list.
- `src/views/SessionView.vue` — `/sessions/:sessionId`. Targets card, per-rep
  list, the rotation coaching note.
- `src/features/training/components/SessionRow.vue`, `TargetsCard.vue`,
  `WeekStrip.vue`.
- All numbers come from slices 2 and 3. No literals in templates.

**Tests**

- default: navigate Plans → week → session, assert the rendered targets match
  `targetFor` for the seeded benchmark.
- touch: week chips and session rows meet the 44px floor and carry a press state.
- a11y: sweep of both screens.
- visual: baseline of Plan week — it is the densest screen in the app.

**Done when** the whole plan is browsable and every target is derived.

`feat(training): plan week and session detail`

---

## Slice 7 — Manual logging and the Log

Closes the loop with **zero Bluetooth**. After this slice the app is usable.

- `src/features/training/components/LogWorkoutSheet.vue` — distance, time,
  optional rate; split and watts computed live from slice 1.
- Completing a session writes a `Workout` with its `planSessionId`, which
  advances `positionFor` and moves Today on.
- `src/views/TodayView.vue` — `/`, the app's home: plan position, next session,
  rest of the week.
- `src/views/LogView.vue` — `/log`, grouped by week, filter chips, month totals.
- `src/features/training/history.ts` (pure) — grouping by week and month
  totals, taking `now` as a parameter.
- Nav: Today, Plans, Log, Settings.

**Tests**

- unit: `history.ts` grouping, including the week-boundary case the design
  review caught — a Tuesday session must not land in "last week" on a Saturday.
- default: log a session manually, assert Today advances to the next one.
- e2e: log a workout, reload, assert it survived. The load-bearing journey.

**Done when** you can follow the plan end to end by typing numbers off the PM5.

`feat(training): manual logging, today and log`

---

## Slice 8 — PM5 frame decoding *(blocked on captures)*

Pure decoding, no connection. Cannot start from memory.

- `src/features/training/ergFrames.ts` — pure functions over `DataView`:
  `decodeGeneralStatus`, `decodeAdditionalStatus`, `decodeStrokeData`,
  `decodeSplitData`, `decodeEndOfWorkout`, and `decodeMultiplexed` which
  dispatches on the leading byte of `CE060080`.
- Every field carries its scaling (distance in 0.1 m, pace in 0.01 s, …) — the
  spec PDF is the authority, not inference from one capture.
- Returns tagged unions, never `any`. An unknown frame type is a typed
  `UnknownFrame`, not a throw.

**Tests** — unit tier, driven by fixtures in
`src/__tests__/fixtures/pm5/*.json` captured from the real erg.

- Round-trip each captured frame to its expected decoded value.
- Property: decoding never throws for any 20-byte input; unknown types come back
  as `UnknownFrame`.
- Truncated buffers fail cleanly.

**Done when** a captured 6×1k session replays from fixtures into the right
splits, offline.

`feat(training): PM5 frame decoding`

---

## Slice 9 — Bluetooth edge and connection composable

- `src/lib/ergBluetooth.ts` — **platform edge**: plain async TS, try/catch, no
  Effect. Add the path to `PLATFORM_EDGE` in `eslint.config.ts`.
  - `isErgBluetoothSupported()`, `requestErg()` (must be called from a user
    gesture), `knownErgs()` via `navigator.bluetooth.getDevices()`,
    `connect(device)`, `subscribeMultiplexed(server, onFrame)`, `disconnect()`.
  - Service `CE060030-43E5-11E4-916C-0800200C9A66`, multiplexed characteristic
    `CE060080-…`. Control service `CE060020-…` is out of scope until slice 12.
- `src/composables/useErgConnection.ts` — VueUse conventions per
  `docs/composables.md`: options object, `shallowRef`, returns
  `{ isSupported, status, device, connect, disconnect }` and returns its whole
  shape when `isSupported` is false. Listeners via `useEventListener` /
  `tryOnScopeDispose`.
- `status`: `'unsupported' | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'`.

**Tests**

- The edge module is the **only** place the unit tier may use `vi.mock` — that
  is the tripwire in `docs/functional-core.md`. If a double is needed anywhere
  else, the logic is in the wrong layer.
- `src/__tests__/composables/useErgConnection.spec.ts` with a faked
  `navigator.bluetooth`, using the `mountComposable` harness.
- Assert the shape is complete when `isSupported` is false.

**Done when** the composable connects to a real erg on Android and streams
decoded frames to the console.

`feat(erg): web bluetooth connection`

---

## Slice 10 — Connect sheet and live workout

- `src/features/training/components/ErgConnectSheet.vue` — the step *before*
  Chrome's device chooser, which we cannot style. Leads with the remembered
  monitor from `knownErgs()`; escapes to "use a different monitor" and "row
  without connecting".
- `src/views/RowView.vue` — `/row`, `meta: { hideNav: true }`.
- `src/features/training/liveWorkout.ts` (pure) — folds a stream of decoded
  frames plus the planned session into live view state: current piece, distance
  remaining, pace delta vs target, completed splits. Takes frames in, returns
  state; no timers, no refs.
- `src/composables/useLiveWorkout.ts` — owns *when*: the frame subscription,
  `navigator.wakeLock` so the screen survives a 2k, and writing the `Workout` on
  finish.
- App shell centre action starts a row.

**Tests**

- unit: `liveWorkout.ts` folded over a captured session replays to the expected
  final splits. This is where the live screen is actually tested.
- default: mock the connection, replay fixtures, assert the screen updates and a
  `Workout` lands in the db.
- touch: Pause and End meet the floor with a coarse pointer.
- Manual, per `docs/agent-browser.md`: row a real piece on the real erg.

**Done when** a plan session rowed on the erg lands in the Log by itself.

`feat(erg): live workout screen`

---

## Slice 11 — Dropout and reconnect

The state the design canvas does not yet draw. BLE drops; mid-piece is exactly
when it hurts.

- Hold the last known numbers under a "reconnecting" banner rather than blanking.
- Auto-retry with backoff while `gattserverdisconnected` fires; keep the workout
  open.
- Never lose an in-flight workout: persist a draft so a reload can restore it,
  the way the sheet's stash works.
- Manual entry as the escape hatch if the erg never comes back.

**Tests** — unit on the reconnect state machine (pure, takes events in);
default tier simulating a disconnect mid-piece and asserting nothing is lost.

`feat(erg): survive a mid-workout disconnect`

---

## Slice 12 — Polish and the remaining tiers

- Push the workout to the PM over CSAFE (`CE060020`) so the erg itself runs the
  intervals and owns the rest timers — the app stops inferring piece boundaries.
  Investigate first; may not be worth it.
- Visual baselines for Today, Live erg, Log.
- Full a11y sweep in light **and** dark.
- `pnpm test:mutation` over the training core; fix survivors.
- `pnpm size-limit` against the budget.
- Resolve the Pete Plan attribution before shipping anything public.

---

## Housekeeping, do first

`pnpm-workspace.yaml` pins `effect` to `4.0.0-beta.105` and
`.claude/references.json` asks for branch `pinned/4.0.0-beta.105`, but the clone
at `~/Projects/opensource/effect` is checked out on **`pinned/4.0.0-rc.108`**.
Refresh is fetch-only, so it will not correct itself, and v4 moved packages
between those releases. Anything read from that tree currently describes a
different API than the one installed. Move the clone back or bump the pin
deliberately — before writing Effect code.
