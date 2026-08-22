---
type: Convention
title: UI components
description: How this starter writes shadcn-vue-style primitives on top of reka-ui, the four levers every primitive gives its consumer, and the rules that keep them open.
tags: [ui, components, reka-ui, shadcn, composition, tailwind]
status: stable
sources:
  - resource: https://github.com/unovue/shadcn-vue
    id: shadcn-vue
    title: unovue/shadcn-vue, the pattern this layer copies
  - resource: https://reka-ui.com/
    id: reka-ui
    title: Reka UI, the headless behaviour underneath
---

# UI components

A **primitive** — every atom (`src/components/atoms/AtomButton.vue`), plus the
parts of a compound one (`src/components/molecules/dialog/`) — is this app's
design system: our components, our markup, our classes, wrapping
[Reka UI](https://reka-ui.com/)'s headless behaviour. They are written in the
style [shadcn-vue](https://www.shadcn-vue.com/) established, but shadcn-vue is
not a dependency. The pattern is copied, not installed.

The flat `.vue` files in the tiers above `atoms/` are composites, and nothing
in this document grades them. Where that line falls, and which tier a component
belongs to at all, is [atomic-design.md](atomic-design.md).

That is the point of shadcn-vue rather than an oversight: the components are
meant to be owned. A dialog that needs to become a keyboard-aware bottom sheet
on phones is an edit to a file in this repo, not a fight with a package's
props. What we take from upstream is the _shape_ of the files, which is what
the rest of this document describes.

## What each layer owns

| Layer                | Owns                                                                  | Never                                           |
| -------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Reka UI              | Focus traps, ARIA wiring, escape/outside-click, `data-state`, portals | Renders no styling of its own                   |
| A primitive          | Markup, Tailwind classes, `data-slot`, variants                       | Reads the database, stores, or a feature        |
| Composites and views | Composition: which parts, in what tree, with what data                | Imports `reka-ui` or `class-variance-authority` |

The layer boundary is enforced, not just described. See [Enforcement](#enforcement).

## The four levers

Every primitive hands the call site four independent ways to bend it. A
primitive that closes one of them has to be edited to serve the next variant,
which is how a design system rots into flags.

### Structure: the tree is the variant

A compound primitive is a set of small parts sharing state through a
provider, not one component that renders every arrangement it might be asked
for. The consumer assembles the parts; the arrangement _is_ the variant.

```vue
<MoleculeDialog v-model:open="open">
  <MoleculeDialogContent>
    <MoleculeDialogHeader>
      <MoleculeDialogTitle>{{ t('notes.form.heading') }}</MoleculeDialogTitle>
      <MoleculeDialogDescription>{{ t('notes.form.description') }}</MoleculeDialogDescription>
    </MoleculeDialogHeader>
    <form @submit.prevent="save">
      <!-- the form lives here, so v-model binds to the consumer's state -->
    </form>
    <MoleculeDialogFooter>
      <MoleculeDialogClose>{{ t('common.buttons.cancel') }}</MoleculeDialogClose>
      <AtomButton type="submit">{{ t('common.buttons.save') }}</AtomButton>
    </MoleculeDialogFooter>
  </MoleculeDialogContent>
</MoleculeDialog>
```

A share dialog with no description drops `<MoleculeDialogDescription>`. A
confirm dialog swaps the form for a paragraph. Nothing inside the primitive branches
on a flag, and no state has to be plumbed back out through
`update:someFieldTheDialogOwns` events, because the fields were never inside
the dialog to begin with.

State lives in the provider (`MoleculeDialog`), not in the layout, which is
why `<MoleculeDialogClose>` works wherever the consumer puts it: in the footer,
pinned to a corner, or outside `<MoleculeDialogContent>` entirely.

### Style: `cn()` merges, it does not concatenate

Every primitive that paints anything accepts `class` and merges it _after_
its own defaults:

```vue
<div :class="cn('flex flex-col gap-2 text-center sm:text-left', props.class)">
```

`cn()` (`src/lib/utils.ts`) is `clsx` followed by `tailwind-merge`.
`tailwind-merge` resolves conflicting utilities so the last one wins, which is
what makes `<MoleculeDialogContent class="sm:max-w-2xl">` beat the primitive's
`sm:max-w-lg` without a specificity fight or a `!important`. Ordinary string
concatenation would leave both classes on the element and hand the decision to
stylesheet order.

Two consequences worth internalising:

- **`class` is consumed, never forwarded.** When a primitive wraps a reka
  part, `class` is stripped from the props before they are forwarded, via
  `reactiveOmit(props, 'class')`, and applied through `cn()` instead.
  Forwarding it would set it verbatim and drop the defaults.
- **A part that paints nothing needs no `class` prop.** `MoleculeDialogTrigger` sets
  no classes, so Vue's attribute fallthrough already merges whatever the
  consumer passes. Adding the prop there would be ceremony.

### State: `data-*` is the public contract

Reka writes lifecycle state to the DOM (`data-state="open" | "closed"`,
`data-disabled`, `data-orientation`), and primitives add `data-slot` to name
each part. Both are stylable from the call site with Tailwind's `data-[…]:`
variants:

```vue
<MoleculeDialogContent class="data-[state=open]:duration-300" />
```

```css
/* a parent can target a part without knowing its utilities */
.prose [data-slot='dialog-footer'] {
  gap: 0.75rem;
}
```

Attributes rather than classes, because `class` belongs to the consumer (see
[Style](#style-cn-merges-it-does-not-concatenate)) and because a utility list
is refactored while `data-state="open"` survives. Every primitive carries a
`data-slot`, and the architecture tier fails the build if one does not.

### Element: `as-child` swaps the tag

`as-child` hands the primitive's behaviour to the consumer's own element
instead of rendering its own:

```vue
<MoleculeDialogTrigger as-child>
  <RouterLink to="/profile">Open profile</RouterLink>
</MoleculeDialogTrigger>
```

Reka's `Primitive` implements the cloning; a primitive gets it for free by
forwarding `PrimitiveProps` (`AtomButton` does this via `:as` / `:as-child`) or by
forwarding a reka part's props wholesale.

## Anatomy of a primitive

The wrapping form, from `src/components/molecules/dialog/MoleculeDialogTitle.vue`:

```vue
<script setup lang="ts">
import type { DialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogTitle, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class') // class is ours to merge
const forwarded = useForwardProps(delegatedProps) // everything else is reka's
</script>

<template>
  <DialogTitle
    data-slot="dialog-title"
    v-bind="forwarded"
    :class="cn('text-lg leading-none font-semibold', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
```

Five moves, in every file:

1. Accept the reka part's props **plus** `class`.
2. `reactiveOmit` `class` out of what gets forwarded.
3. `useForwardProps` / `useForwardPropsEmits` to pass the rest through.
4. `data-slot` naming this part.
5. `cn(defaults, props.class)`.

A part that renders a plain element instead of wrapping reka
(`MoleculeDialogHeader`, `MoleculeDialogFooter`) skips steps 1 to 3 and keeps 4
and 5.

Note what the file above does _not_ rename: the reka part it imports stays
`DialogTitle`. The prefix names _our_ component — the file, the barrel export
and the tag a consumer writes. Inside a wrapper, the unprefixed name is reka's,
and the two no longer collide.

Variants, meaning genuinely stylistic axes like `variant` and `size`, are a
`cva()` table rather than `v-if` branches. It lives at the top of the
component's own `<script setup>` when the primitive is one file, and in the
barrel when several parts share it. `src/components/atoms/AtomButton.vue` is
the worked example.

## Enforcement

Two layers, matching how the db and feature boundaries are enforced.

**ESLint** (`eslint.config.ts`, the `no-restricted-imports` boundaries) covers
imports, including in `.vue` files:

- `reka-ui` and `class-variance-authority` may only be imported inside a
  primitive: anywhere under `src/components/atoms/`, or inside a compound
  primitive's directory, `src/components/<tier>/<name>/**`.
- App code imports a compound primitive from its barrel
  (`@/components/molecules/dialog`), never from the file inside it. An atom has
  no barrel to reach past — `@/components/atoms/AtomButton.vue` is the import.
- A primitive may not import `@/db`, `@/stores/*`, or any feature. Primitives
  stay presentational.
- `shadcn-vue` and `radix-vue` are banned everywhere: we copy the pattern
  rather than depend on it.

ESLint also covers the cheaper way around that boundary, in the
`app/no-raw-elements` scope: `<button>`, `<input>`, `<textarea>` and `<label>`
are errors in any `.vue` outside a primitive
(`vue/no-restricted-html-elements`). Restricting the import only stops someone
reaching past `AtomButton` to reka-ui; it does nothing about skipping the
primitive entirely and writing the element, which has no import to restrict
and is the version that actually happens. It is also the more expensive one —
a bare `<button>` has no touch floor, no press feedback, no
`touch-manipulation` and no focus ring, and looks correct on a desktop review.
The list is only elements a primitive owns; `<select>` is absent because there
is no `AtomSelect` to send anyone to.

This has to be ESLint rather than the `anti-slop` oxlint plugin next door.
oxlint hands a JS plugin a `.vue` file as its `<script>` block alone — no
template nodes, and `sourceCode.getText()` returns the script text only — so a
rule about markup has nothing to look at. See
[oxlint-rules.md](oxlint-rules.md).

Suppress it on the line, with the reason, when the primitive genuinely cannot
express the case. There are four such lines today and each names what is
missing: the nav tabs in `OrganismAppShell.vue` and the centre action in
`App.vue` want a `nav` variant on `AtomButton` (`buttonVariants` is
`inline-flex` with `gap-2 rounded-md`, and its
`[&_svg:not([class*='size-'])]:size-4` shrinks a lucide icon sized by
attribute), and the hidden file picker in `SettingsView.vue` has no string
value for `AtomInput`'s `defineModel<string>` to bind.

**The architecture tier** (`src/__tests__/architecture/primitives.test.ts`)
covers file shape, which ESLint cannot see:

- every compound primitive holds more than one part, has an `index.ts`, and
  exports every `.vue` in it from that barrel under its own name;
- every primitive carries a `data-slot`;
- a primitive that sets classes accepts `class` and merges it through `cn()`,
  and a primitive that accepts `class` actually uses it;
- a primitive declares at most three configuration props beyond `class`.

`touchConventions.test.ts` covers the other half of the contract, that a
control answers a touch and that nothing writes an unclamped inset. See
[Answering a touch](#answering-a-touch) below.

That last one is the flag-sprawl tripwire. Props forwarded from a reka type
(`DialogContentProps & { … }`) are not counted, only the ones the component
invents.

Both suites also assert the rules reject deliberate violations
(`boundaries.test.ts`, and the closing block of `primitives.test.ts`). A rule
that has only ever seen passing input is not a rule.

## Answering a touch

Part of the primitive contract, not decoration on top of it. Mobile-first is
the product, so a primitive that only responds to a mouse is incomplete in the
same way one without a `data-slot` is.

The button base is the worked example, and the shape every interactive
primitive copies:

```ts
// base: the press state lives here, not in a variant
'select-none touch-manipulation transition-[color,background-color,box-shadow,transform] duration-100 active:scale-[0.97] …'

// sizes: touch-first, collapsed for a fine pointer
size: {
  default: 'h-touch-target px-4 py-2 pointer-fine:h-10',
  icon: 'size-touch-target pointer-fine:size-10',
}
```

Two things to internalise before adding a variant:

- **A `hover:` is not feedback on a phone.** Tailwind v4 gates every `hover:`
  behind `@media (hover: hover)`, so on a touch device the variant styles above
  never fire and the control answers a tap with nothing. `active:` is what
  answers; `hover:` is the mouse's extra.
- **The floor is the default, the collapse is the exception.** Written the
  other way round, the untested default is the phone one, and the phone is
  what this app is for.

`src/__tests__/architecture/touchConventions.test.ts` fails the build for a
control with a `hover:` and no `active:`, and for the button base losing either
its press state or `touch-manipulation`. The reasoning, and the three
conventions that live outside this layer:
[touch-conventions.md](touch-conventions.md).

## Adding a primitive

1. **Check Reka has it.** `~/Projects/opensource/reka-ui` is the checked-out
   source; `packages/core/src/<Name>/` holds the parts and their prop types.
   If Reka has no headless version, write the behaviour yourself in the same
   shape, a provider component plus small parts.
2. **Read the upstream file.** `~/Projects/opensource/shadcn-vue` at
   `apps/v4/registry/new-york-v4/ui/<name>/` is the reference implementation.
   Copy its structure; do not copy its classes blindly, since this app has its
   own tokens (`--spacing-touch-target`, `--text-section-title`) in
   `src/style.css`. Upstream filenames carry no tier prefix, so every one of
   them is renamed on the way in.
3. **One file, unless it is compound.** A single-component primitive is a flat
   `.vue` in its tier (`atoms/AtomButton.vue`); a provider plus the parts that
   share its state gets a directory, one file per part, plus `index.ts`.
   Filenames are `PascalCase.vue`, open with the tier prefix
   (`MoleculeDialogTitle.vue`, see [atomic-design.md](atomic-design.md)), and
   match the exported name exactly — a barrel may not alias the prefix away.
4. **Wire the five moves** above into each part.
5. **Export from the barrel**, if there is one. Do not re-export raw reka
   parts from it. Wrap them, so every part carries a `data-slot` and the lint
   rule stays total.
6. **Run `pnpm check`.** The arch tier will tell you which of the rules above
   you missed, by name.

Primitives are not unit-tested on their own: they have no logic to test. What
gets a test is behaviour the primitive _adds_. `dialogContent.spec.ts` covers
the scroll region surviving a keyboard-shrunk viewport, in the browser tier.
See [testing-strategy.md](testing-strategy.md).

## Composition over configuration

The diagnostic, when a prop is tempting: does it change _what_ renders, or
_how_?

- _How_ props are fine: `variant`, `size`, `class`. They select a style for a
  fixed tree.
- _What_ props are the smell: `mode`, `showHeader`, `hasFooter`,
  `headerCentered`. Each one moves a decision that belongs at the call site
  into a branch inside the component, and they compound. The next variant
  needs one more, and the tree that renders is now spread across a dozen
  conditionals.

When you catch one, lift it: the thing the flag was switching between becomes
a component the consumer places, or omits, itself.

### The convenience layer

Eventually someone wants `<MoleculeConfirmDialog title="…" description="…" />` instead
of eight tags. Build it on top of the primitives, as a composite — a flat
`.vue` in the tier it belongs to, or inside the feature that needs it — never
as flags added to the primitive:

```vue
<!-- MoleculeConfirmDialog.vue: a consumer of the primitives, not an extension -->
<template>
  <MoleculeDialog v-model:open="open">
    <MoleculeDialogContent>
      <MoleculeDialogHeader>
        <MoleculeDialogTitle>{{ title }}</MoleculeDialogTitle>
      </MoleculeDialogHeader>
      <MoleculeDialogFooter>
        <MoleculeDialogClose>{{ cancelLabel }}</MoleculeDialogClose>
        <AtomButton :variant="destructive ? 'destructive' : 'default'" @click="confirm">
          {{ confirmLabel }}
        </AtomButton>
      </MoleculeDialogFooter>
    </MoleculeDialogContent>
  </MoleculeDialog>
</template>
```

The next non-standard variant drops back down to the primitives without anyone
touching `MoleculeConfirmDialog`. This is the rule that stops the compound API
collapsing back into a flag-configured monolith over time.

### When not to reach for it

A primitive with one shape and no state does not need a provider and parts.
`<AtomInput>`, `<AtomLabel>`, `<AtomTextarea>` are single components on
purpose, and therefore single files. Build the compound version when a real
second variant exists, not in anticipation of one.

## Where this codebase deviates from upstream shadcn-vue

Deliberate, and worth knowing before "fixing" them to match a copy-pasted
upstream file:

- **`MoleculeDialogContent` is a bottom sheet on phones.** Mobile-first is the
  product, so there is one content component, not a desktop dialog plus a
  separate drawer. It mounts its own `DialogPortal` and `MoleculeDialogOverlay`, and
  forgetting the overlay is a silent accessibility regression rather than a
  visible one. It is keyboard-aware via `--keyboard-inset` (see
  `useKeyboardInset`).
- **`defineModel` for state a component owns; forwarding for state a reka
  part owns.** Upstream uses `useVModel` from VueUse for Vue 3.3 compatibility;
  this project pins 3.5 and uses `defineModel` (see [the index](index.md)). But `AtomSwitch`
  forwards `modelValue` to `SwitchRoot` rather than declaring `defineModel`,
  because reka already implements that model, and two owners of one value drift.
- **Strings come from i18n.** Upstream hard-codes `"Close"`; this project
  requires every user-facing string in `src/i18n/messages/*`, so
  `MoleculeDialogContent` uses `useI18n()`.
- **Touch-target sizing, and a press state on the base.** Sizes resolve
  `--spacing-touch-target` and collapse to upstream's tighter heights only
  under `pointer-fine:`; the base carries `active:scale-[0.97]`,
  `touch-manipulation` and `select-none`, which upstream leaves to the
  consumer. See [Answering a touch](#answering-a-touch).

## Reading the real source

Both reference trees are cloned and announced to every session (see
**References** in [the index](index.md)). Read them instead of recalling an API:

- `~/Projects/opensource/reka-ui`, at `packages/core/src/<Name>/`, for what a
  part accepts, emits, and writes to the DOM.
- `~/Projects/opensource/shadcn-vue`, at `apps/v4/registry/new-york-v4/ui/`,
  for the canonical file shape.
