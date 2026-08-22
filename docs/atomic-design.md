---
type: Convention
title: Atomic design
description: How src/components/ is tiered into atoms, molecules, organisms and templates, the primitive/composite split inside a tier, and the one direction imports may run.
tags: [ui, components, architecture, boundaries, atomic-design]
status: stable
sources:
  - resource: https://bradfrost.com/blog/post/atomic-web-design/
    id: atomic-web-design
    title: Brad Frost, Atomic Web Design — where the five stages come from
---

# Atomic design

`src/components/` is the app's shared component layer, and it is organised
into four directories that get progressively less reusable and more specific:

```text
src/components/
  atoms/      AtomButton.vue  AtomInput.vue  AtomLabel.vue
              AtomSwitch.vue  AtomTextarea.vue
  molecules/  dialog/MoleculeDialog.vue + 8 parts
              MoleculePageHeader.vue  MoleculePwaUpdatePrompt.vue
              MoleculeToastViewport.vue
  organisms/  OrganismAppShell.vue  OrganismPwaInstallPrompt.vue
              OrganismPwaInstallDialog.vue
  templates/  TemplatePageLayout.vue
```

The fifth stage, pages, is `src/views/` — the routed screens, which bind data
and place a template. It stays where it is because the router already names it.

A feature's own components (`src/features/notes/components/`) are outside this
tree entirely. Atomic design is about the _shared_ layer: the moment a
component only makes sense inside one feature, its home is the feature, and
[adding-a-feature.md](adding-a-feature.md) covers that.

## Which tier

The question is not "how big is it" but **what does it stop working without**.

| Tier          | Works on its own given                             | Examples                                                                            |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **atoms**     | props alone                                        | `AtomButton`, `AtomInput`, `AtomLabel`, `AtomSwitch`, `AtomTextarea`                |
| **molecules** | props, plus a couple of atoms it composes          | `dialog/`, `MoleculePageHeader`, `MoleculePwaUpdatePrompt`, `MoleculeToastViewport` |
| **organisms** | a place in the app — routes, a store, a composable | `OrganismAppShell`, `OrganismPwaInstallPrompt`, `OrganismPwaInstallDialog`          |
| **templates** | a page's slots filled in                           | `TemplatePageLayout`                                                                |

`MoleculeToastViewport` reads a store and is still a molecule, because what it
renders is one small thing (a stack of strings) rather than a region of the
app. `OrganismAppShell` reads the router and owns the whole frame, which is
what makes it an organism. When a component sits between two tiers, file it by the lower one:
promoting later is a move, demoting is a move plus every call site that came to
rely on the extra context.

## Two shapes inside a tier

A tier holds exactly two kinds of thing:

- **A primitive** is a shadcn-style wrapper over Reka UI: presentational, and
  forbidden from importing `@/db`, `@/stores/*` or a feature. Every atom is
  one — a component that works on props alone _is_ the primitive contract — so
  `atoms/` has no composite half. How one is written, down to the five moves
  in every file: [ui-components.md](ui-components.md).
- **A composite** is an ordinary app component: `molecules/MoleculePageHeader.vue`,
  `organisms/OrganismAppShell.vue`. It may read a store, a composable or the
  router, and it composes primitives rather than wrapping Reka.

Above `atoms/` the two are told apart by the listing, because a primitive that
far up is always the **compound** form: a directory with an `index.ts` barrel,
holding a provider and the parts that share its state, like
`molecules/dialog/`. Nothing says a compound primitive has to be a molecule —
an organism written as a provider plus parts would be one, and the rules would
grade it as one.

A directory is for that compound form only. A primitive that is one component
is one file, sitting in its tier — `atoms/AtomButton.vue`, not
`atoms/button/AtomButton.vue` behind a barrel that re-exports a single line.
`primitives.test.ts` fails a directory holding one part, and the fix is to
flatten it.

That is also the line the tooling draws. `knip` and the coverage reporter skip
compound primitive directories, because a part exported from a barrel before
anything imports it is deliberate; a composite nobody renders is dead code.
The a11y tier grades composites as screen parts and skips primitives, atoms
included, because sweeping one in isolation would be grading Reka UI.

`reka-ui` and `class-variance-authority` are importable only inside a
primitive: anywhere under `atoms/`, or inside a compound directory in any
tier.

## The name carries the tier

Every component is named for the tier it lives in, singular: `AtomButton`,
`MoleculeDialogContent`, `OrganismAppShell`, `TemplatePageLayout`. The
filename, the tag in a template, and the barrel export where there is a
barrel, are all the same string.

The import path already says the tier, so at first this looks like saying it
twice. It is not the same reader. A path is read once, at the top of a file; a
template is read constantly, and there the tier is invisible — `<Dialog>`
inside `<AppShell>` tells you nothing about which way the dependency runs. With
the prefix, an upward import is visible in the markup before any tool reports
it.

The parts of a compound primitive take the prefix too:
`MoleculeDialogContent`, `MoleculeDialogTitle`, `MoleculeDialogFooter`. It is
verbose, and the alternative — parts keeping the Reka names their wrappers
mirror — buys that brevity with an exception the arch test has to encode and a
reader has to remember. One rule with no carve-outs is worth the characters.

This is also the one place the primitives visibly deviate from upstream
shadcn-vue, whose files are `Button.vue` and `DialogTitle.vue`, each in a
directory of its own. Copying one out of the reference tree means renaming the
file, its template tags, and its barrel line if it has one.
`src/__tests__/architecture/atomicDesign.test.ts` fails the build if you
forget, and names the file it wanted.

## Imports point one way

Atoms compose into molecules, molecules into organisms, organisms into
templates, and a view places a template. **A component may import its own tier
and everything below it, and never a tier above.**

A same-tier import is composition, not a leak: `OrganismPwaInstallPrompt`
opens `OrganismPwaInstallDialog`, and both are organisms.

The rule earns its place at the bottom, not the top. The moment `AtomButton`
knows about `OrganismAppShell`, it can only be used where an app shell exists —
and the tier
it was filed under has stopped meaning anything, because the reason to file it
there was that it needed nothing. An upward import is the tier collapsing, one
component at a time.

When you hit the rule, one of two things is true:

- **The shared part belongs lower.** Extract it and move it down. This is the
  common case: a molecule wanted a piece of an organism, and that piece was
  really an atom all along.
- **This component belongs higher.** It has grown context, so move it up a
  tier. That is a rename and a set of imports, and the rule found it while it
  was still cheap.

## Enforcement

Twice, like every other boundary here.

**ESLint** (`eslint.config.ts`) builds a `no-restricted-imports` scope per
tier, from the same exported `TIERS` array the arch test reads. It covers
`.vue`, which is where nearly all of these imports live, and it reports in the
editor before a test run.

**The architecture tier**
(`src/__tests__/architecture/atomicDesign.test.ts`) covers the two things
ESLint cannot see:

- **Placement.** A component dropped straight into `src/components/` matches no
  scope at all, so no rule applies to it — the failure mode of a lint-only
  boundary is silence, not an error.
- **The relative spelling.** ESLint matches the import _specifier_, so
  `@/components/organisms/OrganismAppShell.vue` is caught and
  `../organisms/OrganismAppShell.vue`
  from inside `molecules/` is not: it carries no `components/` segment to match
  against. The arch test resolves the path first.

`src/__tests__/architecture/primitives.test.ts` grades the other half — the
file shape of anything on the primitive side of the split, in whichever tier it
was filed: that a compound directory holds more than one part and a barrel
that exports each under its own name rather than aliasing the prefix away, and
that every primitive, atom or part, opens the four levers.

Both suites also assert the rules reject a deliberate violation. A rule that
has only ever seen passing input is not a rule.

## Adding a component

1. **Decide the tier** with the table above: what does it stop working without?
2. **Decide the shape.** A directory with a barrel only if it is a provider
   plus the parts that share its state; otherwise one flat `.vue` — whether it
   wraps Reka (an atom) or composes what already exists (a composite). Either
   way the filename opens with the tier prefix.
3. **Check the arrow.** If the tier you picked needs something above it, you
   picked the wrong tier — or the thing it needs belongs lower.
4. **Wire the test home.** Specs mirror the source tree, so
   `molecules/MoleculePageHeader.vue` is specced at
   `src/__tests__/components/molecules/`. A composite also needs a row in
   `src/__tests__/a11y/coverage.ts` naming the screen sweep that covers it.
5. **Run `pnpm check`.** The arch tier names the rule you missed.
