---
type: Reference
title: Number entry
description: The pad every number in this app is typed on — the mask module, the drawer primitive, the field composite that assembles them, and why there is no text input left to validate.
tags: [ui, touch, accessibility, forms, i18n, training]
status: stable
---

# Number entry

Four numbers are typed into this app, and all four go through the same pad:

| Field    | Sheet             | Mask       | Value      | Example  |
| -------- | ----------------- | ---------- | ---------- | -------- |
| Distance | `LogWorkoutSheet` | `decimal`  | metres     | `10000`  |
| Time     | `LogWorkoutSheet` | `duration` | ms         | `43:07`  |
| Rate     | `LogWorkoutSheet` | `decimal`  | spm        | `24`     |
| 2k time  | `BenchmarkSheet`  | `split`    | ms         | `7:04.2` |

## Why there is a pad at all

Three of the four are sexagesimal, and that was the defect.
`inputmode="numeric"` raises a pad with **no colon on it** in iOS Safari, so
the two time fields summoned a keyboard that could not type the value their
own placeholder asked for. Apple sanctions a custom input view for exactly
this under
[virtual keyboards](https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards),
with one condition attached — the view has to earn itself, "otherwise, they
may wonder why they can't regain the system keyboard."

An earlier attempt kept a real `<input>` and set `inputmode="none"` on touch
devices, docking a pad under the field. It worked, and it applied to one field
of four, on one pointer type of two: the sheet had two ways of entering a
number in it at once, and whether you got the good one depended on your
device. Consistency is the feature. So the input went instead of the keyboard:
there is no text field in either sheet, on any device, and therefore nothing
for a software keyboard to open over and nothing to hand-validate.

## Shape

| File                                              | Layer     | Holds                                                   |
| ------------------------------------------------- | --------- | ------------------------------------------------------- |
| `src/lib/numericInput.ts`                         | core      | The three masks. Pure functions over a draft.           |
| `src/components/molecules/numeric-input/`         | primitive | The drawer, keypad, presets and display, in 14 parts.   |
| `src/components/molecules/MoleculeNumberField.vue`| composite | Label, trigger, message — the assembly every field uses.|

`numericInput.ts` is in the `CORE` array in `eslint.config.ts`, so it is held
to determinism and has no complexity budget;
[`functionalCore.test.ts`](../src/__tests__/architecture/functionalCore.test.ts)
reads that array as text, so the two cannot drift.

A screen uses the composite, not the parts:

```vue
<MoleculeNumberField
  id="log-time"
  v-model="duration"
  :label="t('logSheet.time')"
  :title="t('logSheet.timeTitle')"
  :description="t('logSheet.timeHelp')"
  :placeholder="t('logSheet.timePlaceholder')"
  :options="{ mask: 'duration', max: 5_999_000, zerosKey: 2 }"
  :error="missingTime"
/>
```

Reach for the parts directly only when a screen needs an arrangement this one
cannot express — the fourteen exports exist for that, and the composite is
what stops four fields drifting apart in the meantime.

## The masks

`options.mask` picks how a buffer of digits is read:

- **`decimal`** — a number typed left to right. `maximumFractionDigits` adds a
  decimal key; `useGrouping` groups thousands. Bounded by `max`, not by digits.
- **`duration`** — `m:ss`, four digits, milliseconds. `4307` is `43:07`.
- **`split`** — `m:ss.t`, five digits, milliseconds. `7042` is `7:04.2`.

Rules the masks enforce so nothing downstream has to:

- **Right-to-left fill** on the sexagesimal masks. `'7'` is `0:07`.
- **Transient seconds are permitted.** Typing `6`, `0`, `0` passes through
  `0:60` to reach `6:00`; refusing that keystroke makes `6:00` unreachable.
  The draft shows what is in the buffer and says nothing about it being wrong,
  because it is not wrong — it is unfinished. Confirming a transient draft
  commits the value its digits add up to: `0:60` becomes `1:00`.
- **A ceiling per mask**, and a `max` in the value's own unit. A key that
  would take the draft past `max` is refused rather than the value clamped —
  a clamp answers a mis-tap with a number nobody typed.
- **No leading zeros**, except the ones a mask pads in itself.

Options are one object so a feature can pass them through without turning the
primitive into a wall of flags:

| Option                       | Meaning                                          | Default     |
| ---------------------------- | ------------------------------------------------ | ----------- |
| `mask`                       | `decimal`, `duration`, `split`                   | `decimal`   |
| `min` / `max`                | Committed range, in the value's unit             | `0` / `999` |
| `maximumFractionDigits`      | Decimal digits accepted. `decimal` only          | `0`         |
| `useGrouping`                | Group thousands in the display                   | `false`     |
| `zerosKey`                   | Zeros on the shortcut key: `00`, `000`, or none  | `0`         |
| `presetStep` / `presetRange` | The window generated when no `presets` are given | `1` / `10`  |

## Transactional, and zero means empty

Opening the pad copies the committed value into a draft. Keypad and preset
presses change only the draft; **Confirm** commits it, and Cancel, Escape, an
outside press or a downward swipe discard it. The first digit replaces the
existing value, calculator-style, so correcting a number is not a retype.

A value of `0` is how a field says "nobody has filled me in": the trigger
shows its placeholder rather than a `0` that reads like an answer, and Save
stays disabled. That is also why the sheets no longer carry a format error —
the entry cannot be malformed. `LogWorkoutSheet` says which of the two numbers
is missing once the other one is there, and that is the only message left.

## The parser contract, retired

`parseDuration` and `parseSplit` were the codec between typed text and
milliseconds, and they were the only validators in the app. Nothing types text
any more, so they are gone: the mask produces the number directly, and
`formatDuration`/`formatSplit` remain for rendering. What survives them is the
rule they existed for — **one implementation per rule**. There is no second
place that decides what `43:07` means.

Range failures did not go anywhere. `splitFor` still rejects a zero distance
or a zero duration, and the repository still rejects a benchmark of `0:00.0`;
both branches are still handled in the sheets by tag.

## Accessibility

The trigger is a real button named by its label *and* its value
(`aria-labelledby` points at the label and at the trigger itself), so a screen
reader hears "Time 43:07" and not just "Time". An empty field announces
"Empty" rather than its placeholder, which would otherwise be read out as a
value the field does not hold. The pad is a Reka Drawer: a
dialog with a title and a description, focus trapped, Escape to dismiss. The
live readout is a `role="status"`, every key has a name that is not the glyph
printed on it, and replace-mode is announced. A physical keyboard types
digits, `,`/`.`, Backspace and Enter straight into the open pad.

What was given up: the sound and haptics Apple asks a custom input view to
play. The web cannot reach the keyboard sound, cannot honour Settings ›
Sounds, and `navigator.vibrate` is unsupported in iOS Safari. Keys get the
`active:scale-[0.97]` transform and nothing else. That is a real cost of doing
this as a PWA — recorded, not papered over with a synthesised click.

## Tests

- `src/__tests__/unit/lib/numericInput.spec.ts` — the masks, including the
  transient pair, the ceilings, the round-trip property over every value each
  mask can express, and the preset rules.
- `src/__tests__/features/training/numberEntry.spec.ts` — the transactional
  draft, cancel, the keyboard path, and a field that offers no presets.
- `src/__tests__/touch/numberEntry.spec.ts` — the premise, asserted against
  the DOM: no `input` in the sheet for a keyboard to answer.
- `src/__tests__/a11y/a11y.spec.ts` — the `numberPad` sweep, in both themes.
