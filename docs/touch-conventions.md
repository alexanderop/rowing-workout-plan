---
type: Convention
title: Touch conventions
description: The five rules that make this shell feel like an app rather than a website on a phone: press feedback, touch-first sizing, suppressed document behaviour, clamped environment values, and never drawing an affordance that is not wired.
tags: [mobile, touch, css, safe-area, accessibility, app-shell]
status: stable
---

# Touch conventions

[The index](index.md) says the app shell, safe-area handling, and keyboard-aware
sheets are the product. This is the rule set that keeps that true: five
conventions, each one a defect that shipped in this starter before it was
written down.

They are cheap. Every one of them is CSS or a class string; none needs a
dependency. What makes them worth a document is that almost none of them are
visible in a browser tier that runs on a desktop, which is how thirteen of
them survived here at once.

## 1. Press feedback before completion feedback

A native control answers the finger on `pointerdown`, before it knows whether
the action will succeed. A web control that waits for the result answers
hundreds of milliseconds later, and the gap is the whole difference between
"app" and "website".

`hover:` is not that answer. Tailwind v4 correctly gates every `hover:` utility
behind `@media (hover: hover)`, so on a phone those styles never fire at
all, and a button whose only feedback is a `hover:` answers a tap with nothing.

```ts
// src/components/atoms/AtomButton.vue, the base, not a variant
'select-none touch-manipulation transition-[color,background-color,box-shadow,transform] duration-100 active:scale-[0.97]'
```

Three things travel with the press transform, and none is optional:

- **`transition-colors` cannot animate a transform.** Naming the properties is
  what makes the scale animate rather than snap.
- **`touch-manipulation`** drops the browser's ~300 ms wait for a possible
  double-tap-zoom. Without it every tap in the app is late.
- **`select-none`** stops a long-press turning the label into a text selection
  instead of a press.

Put it on the element that is the hit target. The FAB in `App.vue` scales an
inner `<span>` but the `<button>` around it is what gets tapped, so the
`touch-manipulation` goes on the button.

## 2. Size touch-first, collapse for a fine pointer

Write the 44 px floor as the default and let a mouse opt into something
tighter, rather than the other way round:

```ts
default: 'h-touch-target px-4 py-2 pointer-fine:h-10',
icon: 'size-touch-target pointer-fine:size-10',
```

`pointer-fine:` compiles natively in Tailwind 4, with no config and no
`@custom-variant`. The direction matters: written the other way (`h-10
pointer-coarse:h-touch-target`) the _untested_ default is the phone one, and a
control added by someone who forgets the variant ships too small for the device
the app is built for.

44 px is Apple's HIG floor, and it is not what the a11y tier checks: axe's
`target-size` rule uses the WCAG 2.2 AA floor of 24×24, so a 40 px button
satisfies axe and fails us. The `touch` tier is what grades this. See
[testing-strategy.md](testing-strategy.md).

## 3. Suppress document behaviour, then grant it back

App chrome is not a document. Rows, tab labels and stat readouts are controls,
not quotable text, and letting them be selected intercepts the long-press a
native app would spend on a context menu.

```css
body {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none; /* or a long-press still raises iOS's action sheet */
}

/* and immediately, in the same commit: */
input,
textarea,
[contenteditable='true'] {
  -webkit-user-select: text;
  user-select: text;
}
```

> **Ship both halves together, always.** A global `user-select: none` with no
> field exemption makes iOS refuse caret placement inside inputs. It presents
> as a broken keyboard rather than as a CSS bug, and it reproduces on no
> desktop browser and in no tier we run.

Then grant selection back wherever the user's own words are on screen, with
`select-text` on note titles and bodies in `NoteCard.vue`. The rule is about
_whose_ text it is, not about which element type it is.

The same "global, then exempt" shape applies to motion. We ship the bottom-sheet
keyframes and a press transform on every button and tab, and a user who has
asked the OS for less motion has asked for both:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    /* … */
  }
}
```

Global on purpose, since an opt-in list is a list someone forgets to extend.

## 4. Clamp every environment value

`env(safe-area-inset-*)` is 0 on every device without a notch or home
indicator, which is most of them and all of CI. A bare `env()` therefore
ships a layout nobody has ever seen render.

```css
@utility safe-area-bottom {
  padding-bottom: max(var(--safe-bottom-min, 0px), env(safe-area-inset-bottom));
}
```

Two rules follow, and the arch tier enforces both:

- **The utility is the only thing that writes the property.** A call site that
  adds `pb-6` beside `safe-area-bottom` has two utilities declaring
  `padding-bottom` at equal specificity, and the winner is generated-stylesheet
  order rather than the order they were authored. That is exactly how every
  bottom sheet in this app came to have zero bottom padding. The floor goes in
  the variable: `safe-area-bottom [--safe-bottom-min:1.5rem]`.
- **No raw `env(safe-area-inset-*)` outside those utilities.**

`index.html` sets `viewport-fit=cover`, which is a request for the full display
_and_ the responsibility for it, so the top and side insets have to be paid
too, not only the bottom one.

**Where the inset goes is a layout decision, not a habit.** The obvious home is
the scroll container, and it is wrong here: a sticky element's constraint
rectangle is the _scrollport_, meaning the scroll container's padding box, so
`padding-top` on `<main>` would not push `MoleculePageHeader`'s `sticky top-0` down.
The header would stick flush to the top of `<main>` and slide under the status
bar. The inset goes on the shell root, where it is one declaration, correct
with or without a sticky header, and impossible to double-pay.

## 5. Never draw an affordance you have not wired

A grabber pill on a sheet says "drag me". If dragging does nothing, the user
tries it, gets nothing, and stops trusting the rest of the screen, which is
worse than a sheet with no grabber. Either wire the gesture or do not draw it,
and in the meantime do not let a comment promise it either.

`reka-ui` ships a `Drawer` (`DrawerHandle`, `DrawerSwipeArea`, snap points,
velocity dismissal) and it is already in `node_modules`; migrating
`MoleculeDialogContent` to it is the real fix and is an API change rather than a CSS
one.

## What no tier can tell you

`env()` is 0 in every headless Chromium, overscroll _chaining_ needs a real
gesture, and the iOS caret bug reproduces on no desktop browser at all. Before
calling touch work done, drive it per [agent-browser.md](agent-browser.md) in a
mobile device profile and confirm by hand:

1. A sheet opened on a **flat-bottomed** profile has visible bottom padding.
2. Scrolling an inner list to its end does not move the page behind it.
3. Buttons and tabs visibly depress on `pointerdown`, not on release.
4. Long-pressing a list row produces no selection highlight and no callout,
   **and tapping into a text field still places a caret.**
5. With reduced motion on, the sheet appears without sliding.

Item 4's second half is the one that will not fail loudly. Check it explicitly.

## How these are held

The pairing this project uses everywhere: one behavioral test that the
mechanism works, one static rule that it is applied everywhere. Neither
substitutes for the other. A per-control spec does not scale to the next
control someone adds, and a static rule does not prove the mechanism.

| Convention             | Behavioral                                          | Static                                  |
| ---------------------- | --------------------------------------------------- | --------------------------------------- |
| Press feedback         | none, see below                                     | `architecture/touchConventions.test.ts` |
| Touch-first sizing     | `touch/touchTargets.spec.ts`                        | the same file, for the button base      |
| Selection and callouts | `components/touchConventions.spec.ts`               | none                                    |
| Clamped insets         | `components/molecules/dialog/dialogContent.spec.ts` | `architecture/touchConventions.test.ts` |
| Reduced motion         | none                                                | presence check, and it says so          |

Press feedback gets no behavioral test on purpose. `:active` is UA-driven and
cannot be dispatched (`userEvent` has `click`, `dblClick` and `hover` but no
pointer-hold), and asserting that `active:scale-97` visibly scales an element
is testing Chromium rather than testing us. What can actually rot is coverage:
the next control that ships mouse-only. A static rule is the right and complete
answer there, not a compromise.

Reduced motion is a presence check for a narrower reason: a behavioral one needs
`contextOptions: { reducedMotion: 'reduce' }`, meaning a _second_ browser
project, and folding it into the `touch` tier would conflate two conditions so a
failure could not say which one it was. Documented upgrade path rather than a
silent omission.

**Assert the computed effect, never the declaration.** Every spec above
measures what a user perceives, the gap below the last control, what a
double-click selects, the height of a tab, because a class-string assertion
goes red on a harmless rename and stays green when the CSS is broken. It is a
change detector aimed at the wrong thing.
