---
type: Specification
title: Number entry
description: Replacing the four free-text number fields with a docked pad and a right-to-left mask — the module split, the touch gate that keeps it accessible, the parser contract that stops a second validator existing, and the four stages to ship it in.
tags: [ui, touch, accessibility, forms, i18n, training]
status: proposed
---

# Number entry

> **Stages 1 and 2 are in validation.** The mask and its unit tier are built,
> and the time field is wired behind the touch gate. The installed-iOS PWA
> check and week of field use are still outstanding, so stages 3 and 4 have
> deliberately not started and [the index](index.md) carries no row yet. Add
> that row in the commit that ships stage 2 after the gate passes.

## The problem

Four numbers are typed into this app, and all four go through a bare
`AtomInput` with a regex parse behind it:

| Field    | Sheet             | Shape    | Example  |
| -------- | ----------------- | -------- | -------- |
| Distance | `LogWorkoutSheet` | metres   | `10000`  |
| Time     | `LogWorkoutSheet` | `mm:ss`  | `43:07`  |
| Rate     | `LogWorkoutSheet` | spm      | `24`     |
| 2k time  | `BenchmarkSheet`  | `m:ss.t` | `7:04.2` |

Three of them are sexagesimal, and that is the defect. `inputmode="numeric"`
raises a pad with **no colon on it** in iOS Safari, so the two time fields
summon a keyboard that cannot type the value their own placeholder asks for —
the user has to switch to the alphabetic plane to reach `:`. Distance and rate
are not broken, only slow.

The fix is a pad the app draws itself, with a mask that fills from the right:
typing `4`, `3`, `0`, `7` produces `43:07` and the colon is never typed at all.
Apple sanctions exactly this under
[custom input views](https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards),
with one condition attached — the view has to earn itself, "otherwise, they may
wonder why they can't regain the system keyboard". That condition is why rate
gets chips rather than a keypad.

## Scope

In: the four fields above, on touch devices.

Out, deliberately:

- **Any change on a fine pointer.** Desktop keeps today's plain input.
- **A general numeric-input framework.** Four fields, one module. PM5 Bluetooth
  will take over most manual logging; `BenchmarkSheet` stays manual forever, so
  the investment is bounded, not open-ended.
- **A second validator.** See [the parser contract](#the-parser-contract).
- **Sound and haptics.** Apple asks a custom input view to play the standard
  keyboard sound. The web cannot reach it, cannot honour Settings › Sounds, and
  `navigator.vibrate` is unsupported in iOS Safari. Key presses get the
  `active:scale-[0.97]` transform and nothing else. This is a real cost of
  doing it as a PWA; record it, do not paper over it with a synthesised click.

## Shape

Three files, split by what [`architecture.test.ts`](../src/__tests__/architecture/architecture.test.ts)
already enforces: `components/` may not import from `features/`, and logic
inside `<script setup>` is invisible to both the layer rules and the unit tier.

| File                                            | Layer     | Holds                                                |
| ----------------------------------------------- | --------- | ---------------------------------------------------- |
| `src/features/training/entry.ts`                | core      | The mask. Pure functions over strings.               |
| `src/components/molecules/MoleculeKeypad.vue`   | primitive | Renders a key grid, emits `press`. No domain import. |
| `src/features/training/components/EntryPad.vue` | composite | Field switching, presets, wiring.                    |

`entry.ts` is core, so add `'src/features/*/entry.ts'` to the `CORE` array in
`eslint.config.ts`. That array is an explicit allowlist and
[`functionalCore.test.ts`](../src/__tests__/architecture/functionalCore.test.ts)
reads it from there as text, so the two cannot drift.

## The mask module

```ts
export type EntryKind = 'metres' | 'duration' | 'split' | 'rate'

/** Digits → what the field shows. */
export function formatEntry(
  kind: EntryKind,
  digits: string,
  options?: { readonly groupSeparator?: string },
): string

/** Digits → the string the existing parsers accept. `''` when empty. */
export function canonicalEntry(kind: EntryKind, digits: string): string

/** Canonical → digits, so the pad can open on a value already in the field. */
export function digitsFrom(kind: EntryKind, text: string): string

/** Key handling. Both return the unchanged buffer when the key is refused. */
export function pushDigit(kind: EntryKind, digits: string, digit: string): string
export function popDigit(digits: string): string
```

Rules the mask enforces, so that nothing downstream has to:

- **Right-to-left fill.** `'4307'` is `43:07`; `'7'` is `0:07`.
- **Transient seconds are permitted.** A right-to-left decimal mask has to pass
  through `0:60` on the way from `0:06` to `6:00`, and through `5:95` on the
  way to `59:59`. Rejecting those intermediate keys makes both valid values —
  and the documented `7:04.2` benchmark — unreachable. The active pad therefore
  suppresses a premature format message; when the user advances, the existing
  parser decides whether the final text is valid. This is the parser contract
  applied consistently, not a second seconds validator hidden in the mask.
- **Tenths first for `split`.** `'7042'` is `7:04.2`.
- **Digit ceilings.** `metres` 5, `duration` 4, `split` 5, `rate` 2.
- **No leading zeros**, except the ones the mask itself pads in.

`formatEntry` takes the group separator as an **argument**. The core may not
read ambient state, and `toLocaleString()` with no locale reads the host's —
which would also be wrong, since `de` groups `10.000`. The caller passes the
separator from `vue-i18n`.

### Invariants worth a property

```ts
canonicalEntry(k, digitsFrom(k, s)) === s // for any s the pad can emit
canonicalEntry('duration', enter(digitsFrom('duration', s))) === s
  // for every parseDuration-valid m:ss inside the four-digit mask
```

The second is the whole point of the exercise, stated as a test. See
[Testing strategy](testing-strategy.md) for when a property beats examples.

## The touch gate

**Keep a real `<input>`.** Do not swap the fields for buttons or divs. Set
`inputmode="none"` only when `useTouchDevice()` is true.

This is the load-bearing accessibility decision and it is cheap:

- VoiceOver and TalkBack still announce a text field with its label and value.
- An external keyboard still types into it.
- The existing `AtomLabel for=`, `aria-describedby` and `aria-invalid` wiring
  in both sheets survives untouched.
- A fine pointer sees no pad and no change in behaviour at all.

Do **not** use `readonly`: it alters assistive-tech semantics and can suppress
the caret, and the caret is what says which field the pad is typing into.

The Apple HIG has nothing to say about screen readers and custom input views —
it is silent, not reassuring. The gate is what makes that silence survivable:
the pad is an enhancement on coarse pointers, never the only way in.

## The parser contract

The mask does not validate. It produces a canonical string and hands it to
`parseDuration` (`features/training/history.ts`) or `parseSplit`
(`features/training/pace.ts`), which stay the only validators in the app.

This is not ceremony. `LogWorkoutSheet` already carries a comment explaining
that rounding in the wrong place once stored a row whose distance, time and
pace disagreed. A mask that validated independently would be that same class of
bug: two implementations of one rule, drifting.

**Keep both error branches.** Format failure becomes unreachable; range failure
does not — `0:00` is well-formed and still not a workout, and the repository
still rejects it. `showInvalidTime` and `showInvalidDistance` stay, as do their
i18n keys. What changes is the _message_: match on the error tag the way
`save()` already does with `Effect.catchTags`, so a range failure stops saying
"Enter a time like 43:07".

## Per-field behaviour

| Field    | Pad shows                                 | Why                                                           |
| -------- | ----------------------------------------- | ------------------------------------------------------------- |
| Distance | Digits, a `000` key, preset chips above   | 2k/5k/6k/10k cover most rows; everything else is five digits  |
| Time     | Digits, a `00` key, no presets            | No preset is meaningful; the mask is the whole feature        |
| Rate     | **Rate chips**, digits behind a `123` key | A keypad for an optional two-digit number earns nothing       |
| 2k time  | Digits, tenths-first mask, no presets     | Entered a few times a year; precision matters, speed does not |

The rate row is the HIG condition applied literally. The action key in the
column beside the grid is `Next` on the first two fields and `Done` on the last;
beside rate chips, backspace becomes `Clear`, since backspacing a chip
selection means nothing.

## Sheet changes

- **`LogWorkoutSheet`** may focus distance on open once the pad exists, because
  there is no OS keyboard left to race the sheet animation. Do it with a local
  `@open-auto-focus` listener — `MoleculeDialogContent` re-emits specifically so
  a consumer can. Do not change the shared molecule; other sheets still have
  real keyboards and still need its guard.
- **`useKeyboardInset` stays.** The log sheet stops depending on it, which is a
  pleasant side effect and not a licence to delete it — any sheet with a real
  text input still needs it.
- **`rate` stays a string ref.** `optionalFields()` is unchanged, so the write
  path is untouched.
- The refs keep holding the **canonical** string. The pad owns a digit buffer
  derived from it on focus and writes canonical back on every key, so there is
  one source of truth rather than two states to keep in step.

## Stages

Each stage ships on its own and is worth having if the next never happens.

1. **`entry.ts` + unit tests (implemented).** No UI change. Done when the
   module is in `CORE` and its tests pass with no test doubles — which is the claim
   [functional core](functional-core.md) makes falsifiable.
2. **Time field only (implementation candidate)**, in `LogWorkoutSheet`, behind
   the touch gate. Automated coarse-pointer coverage is green; this is done
   when `43:07` can be entered without the alphabetic keyboard appearing on a
   real iPhone, and `logSheet.invalidTime` does not fire during pad entry.
3. **Distance and rate.** Presets, the `000` key, rate chips.
4. **`BenchmarkSheet`.** Last: rarest interaction, most expensive regression,
   since every training target derives from that one number.

Stage 2 is the one that pays for itself. Do not start 3 until 2 has survived a
week of real use.

## Tests

New:

- `src/__tests__/unit/training/entry.spec.ts` — the mask, including transient
  seconds, the ceilings, reachability, and the round-trip property.
- A component spec for `MoleculeKeypad` per [UI components](ui-components.md).

Will go red without attention:

- `a11yCoverage.test.ts` — a new composite under `features/` that no sweep
  renders fails the registry. Add the entry.
- `touchConventions.test.ts` — build keys from `AtomButton` so they inherit
  `touch-manipulation`, `select-none` and the press transform, rather than raw
  `<button>`.
- `touchTargets.spec.ts` — keys are 52px, above the 44px floor, but the
  screenshot baseline changes.
- `i18nKeys.test.ts` — `de.ts` in step with `en.ts`.
- Baselines under `visual/`, `a11y/` and `touch/__screenshots__`.

## Open risk

**Verify before building stages 3 and 4 on top of stage 2:** that
`inputmode="none"` actually suppresses the keyboard in an installed iOS PWA,
and that the caret still renders. It is supported in Safari 12.2+, but
standalone-mode input behaviour has surprised people before. If it does not
suppress, both keyboards appear at once and the approach collapses — fifteen
minutes on a real phone, per [agent-browser](agent-browser.md) or by hand.

### Installed-iPhone gate

Record the iPhone model, iOS version and build under test with the result. Run
this from the Home Screen installation, not a Safari tab — the standalone-mode
behaviour is the claim:

1. Launch from the app icon and confirm there is no Safari chrome.
2. Open **Log a row** and tap **Time**. The field keeps its text-field role and
   visible caret; the app pad appears and the system keyboard does not.
3. Enter `4`, `3`, `0`, `7`. The field ends at `43:07`, no format error appears,
   and the caret remains in the field while the pad keys are pressed.
4. Clear the field and enter `6`, `0`, `0`. The transient `0:60` does not show
   an error while the pad is active, and the final value is `6:00`. Backspace
   once and confirm the value becomes `0:60`; press **Next** and confirm the
   existing format error appears.
5. With a paired hardware keyboard, focus **Time**, replace its contents with
   `6:00`, and confirm the real input accepts it despite `inputmode="none"`.
   Press **Next** and confirm focus moves to the real Rate input.
6. With VoiceOver enabled, repeat steps 2 and 3. The field is announced with
   the **Time** label and current value, and every pad key has an intelligible
   name, including **Backspace** and **Next**.

Any system keyboard appearing beside the pad, missing caret, lost input label,
or unreachable value fails stage 2. If the gate passes, use this time pad for
every real manual workout logged over the next week. Start stage 3 only after
that week ends without a wrong or blocked time entry; record any workaround as
a failure rather than silently adapting around it.

The accessibility of a custom input view under VoiceOver is the other unknown,
and the HIG does not answer it. The touch gate bounds the damage; it does not
remove the question.
