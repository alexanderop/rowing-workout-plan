---
okf_version: '0.2'
---

# vue-pwa-starter knowledge

## What this is

A local-first Vue 3 PWA starter template. Data lives in the browser (Dexie/IndexedDB), with no backend and no accounts. Mobile-first: the app shell, safe-area handling, and keyboard-aware sheets are the product. The `notes` feature is a worked example meant to be copied and then deleted.

When in doubt about a design call: does it keep interactions instant and the data on-device?

## How to read this

This file is the entry point. It holds the rules; the concept files it links hold the reasoning behind them, as an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) v0.2 bundle. One concept per markdown file, YAML frontmatter (`type`, `title`, `description`, `tags`, `status`), relative links between them. Follow a link when your task touches it; do not read the tree top to bottom.

There is no `CLAUDE.md` and no `AGENTS.md`. A `SessionStart` hook (`.claude/hooks/docs.mjs`) injects this file into every agent session verbatim, so agents and humans read the same file and the conventions exist in one copy. An agent that changes a rule changes it here.

| Concept                                                 | Read it when                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Local-first](local-first.md)                           | Deciding whether something belongs on-device, or why the converter/migration pair exists                                                   |
| [Adding a feature](adding-a-feature.md)                 | Building a new feature, for the build order and the test home for each step                                                                |
| [Functional core, imperative shell](functional-core.md) | Deciding where a piece of logic lives (a component, a composable, a plain `.ts` module), or hitting a complexity/determinism lint rule     |
| [Writing composables](composables.md)                   | Adding or changing anything under `src/composables/` or `src/features/*/use*.ts`: what it takes, what it returns, how its effects clean up |
| [Testing strategy](testing-strategy.md)                 | Choosing which tier a test belongs in, or whether to write a property                                                                      |
| [Vitest practices](vitest-practices.md)                 | Writing a browser-tier spec: fixtures, assertion helpers, ARIA snapshots, tags                                                             |
| [Testing composables](testing-composables.md)           | Speccing a composable: whether it needs a component instance, and the `mountComposable` harness if it does                                 |
| [Driving the app with agent-browser](agent-browser.md)  | Verifying a feature yourself in a real browser, before claiming it works                                                                   |
| [Mutation testing](mutation-testing.md)                 | Reading a surviving mutant, or changing what `pnpm test:mutation` grades                                                                   |
| [Atomic design](atomic-design.md)                       | Adding a shared component, or deciding which tier of `src/components/` it belongs in                                                       |
| [UI components](ui-components.md)                       | Writing a primitive: the five moves in every file, or wondering why a component takes `class`                                              |
| [Touch conventions](touch-conventions.md)               | Anything a finger touches: a new control, the app shell, a safe-area inset, a sheet                                                        |
| [Effect](effect/index.md)                               | Any Effect work. It is the branch chooser into the per-topic concepts                                                                      |
| [Writing oxlint rules](oxlint-rules.md)                 | Adding or changing a lint rule in `tools/oxlint/`, or deciding whether a rule is the right enforcement tier at all                         |
| [Capturing PM5 frames](pm5-capture.md)                  | Recording raw Bluetooth frames off an erg into fixtures — and the secure-context problem that stops it working from a phone                |

Adding a doc means adding a concept file with frontmatter and linking it from this table, so the bundle stays conformant and navigable.

> **The worked examples are mid-move.** These concepts teach through the
> `notes` feature, and that feature has been deleted — `src/features/` holds
> only the `training` core the erg-trainer slices are building up, and `/`
> opens Settings. Every **rule** below and in the concept files still
> holds and is still enforced; only the file paths and snippets naming
> `NotesView`, `NoteCard`, `useNoteAge`, `NotesRepo` or the `notes` table point
> at code that now lives in `git show HEAD~1`. The plan in [`specs/`](../specs/)
> rebuilds the app as an erg trainer slice by slice, and each concept is
> rewritten against the real feature as the slice that provides it lands.

## Commands

```bash
pnpm check          # ← verify your work: lint + format + types + knip + unit + arch,
                    #   in parallel (~8 s), continuing past the first failure so one
                    #   run reports every problem. No browser needed. Run this before
                    #   claiming a change is done.
pnpm dev            # Dev server
pnpm test:unit      # Node unit tier, pure logic, ~100 ms
pnpm test           # Browser tier (Vitest browser mode)
pnpm test:a11y      # axe-core sweeps in light AND dark + ARIA snapshots (-- --update)
pnpm test:touch     # Chromium under touch emulation. The only tier with a coarse
                    #   pointer, and so the only one that sees what a phone gets
pnpm test:visual    # Screenshot comparisons (test:visual:update to rebaseline)
pnpm test:arch      # ArchUnitTS boundary rules
pnpm test:mutation  # Stryker over the unit tier (~10 s). It grades the assertions,
                    #   not the coverage. Read mutation-testing.md before editing the
                    #   scope in stryker.config.mjs.
pnpm test:e2e       # playwright-bdd against the production build
pnpm lint           # oxlint + eslint + markdownlint (fix mode; lint:check to verify)
pnpm format         # prettier (format:check to verify; CI runs the check)
pnpm type-check     # vue-tsc --build
pnpm knip           # Dead exports + unused deps, twice: the whole repo, then the
                    #   production graph alone (knip:production), which catches
                    #   code kept alive only by its own test.
pnpm build          # Production build (+ pnpm size-limit for the budget)
```

`pnpm check` covers every gate that runs without a browser; the lint and
formatting parts of it are fixable with `pnpm lint` and `pnpm format`. The
browser tiers (`test`, `test:a11y`, `test:touch`, `test:visual`, `test:e2e`) cost minutes and
stay separate. Run the ones your change touches, and let CI run the rest.

## Effect

`effect` is pinned to exactly `4.0.0-beta.105`. Start at
[effect/index.md](effect/index.md), which holds the conventions and the branch
chooser into per-topic concepts (schema, services and layers, config,
scheduling, caching, streams, HTTP clients, testing). Read
[effect/conventions.md](effect/conventions.md) for any Effect work, then only
the branches your task touches.

When the concepts do not answer the question, read the Effect source itself. It
is the `effect` reference, checked out to match the pin and announced to every
session by the hook described under **References**, so nothing here has to point
at it.

Online docs and v3 training data describe a different API; do not use them.
Bumping the pin means moving the reference clone's pinned branch too, and
re-checking the `docs/effect/` concepts against it.

Where the concepts and this file disagree about _this_ codebase, this file
wins. The concepts describe Effect; the **Critical conventions** below describe
our use of it.

## References

Source trees this project reads but does not vendor. `.claude/references.json`
is the registry; a `SessionStart` hook (`.claude/hooks/references.mjs`) resolves
it, clones anything missing into `~/Projects/opensource/<alias>` in the
background, and injects each entry into the session as `<available_references>`
so an agent knows the tree exists without being pointed at it. It is the sibling
of the hook that injected this file, with the same wire format and the same two
harnesses.

One registry, one script, two harnesses. `.claude/settings.json` registers both
hooks with Claude Code and `.codex/hooks.json` registers the same scripts with
Codex, which reimplements Claude Code's hook format down to the
`hookSpecificOutput.additionalContext` payload. Two differences are load-bearing
and the reason the Codex command reads the way it does: Codex sets no
`$CLAUDE_PROJECT_DIR` (hence `git rev-parse --show-toplevel`), and its session
`cwd` is wherever you started it, so each script climbs to what it needs rather
than assuming the repository root. Codex also refuses to run a project hook it
has not been shown. The first session lists it as untrusted and asks; until you
accept, this file and the references are silently unadvertised. Editing a hook
resets that.

Both hooks are registered for `clear` and `compact` as well as `startup` and
`resume`: injected context is part of the conversation, so without those the
rules would vanish the first time a session compacted.

```jsonc
{
  "effect": {
    "repository": "Effect-TS/effect", // owner/repo, host/path, or a git URL
    "branch": "pinned/4.0.0-beta.105", // clone-time ref; omit for the default
    "description": "…", // no description ⇒ cloned but unadvertised
  },
  "docs": "../product-docs", // shorthand: ./ ~/ or / ⇒ path, else repository
}
```

Add machine-local references in `.claude/references.local.json` (gitignored,
same shape, wins on alias collision) rather than editing the committed file.

Refresh is `git fetch` only, so a `pinned/<version>` checkout is never moved
under you. Set `"pull": true` per entry to fast-forward, `"refresh": false` to
leave a tree alone. Bumping a pin is still the manual `git checkout -b` in
`~/Projects/opensource/effect`; the hook will not do it.

`.claude/settings.json` grants `~/Projects/opensource` through
`permissions.additionalDirectories`, but project-level grants only apply once
you have accepted the workspace trust dialog. Until then Claude Code prints a
warning and the reference paths are advertised but unreadable. Codex needs no
counterpart, since reads are unrestricted in every one of its sandbox modes.
What it does need is the project marked trusted, because it ignores `.codex/`
entirely in an untrusted directory.

## Critical conventions

- **State**: atoms via `@effect/atom-vue`, pinned in lockstep with `effect`. Not Pinia, not VueUse `createGlobalState`. Shared state lives in a registry-held `Atom`; components subscribe with `useAtomValue`/`useAtom`/`useAtomSet`. Plain UI state is `Atom.make(...)` behind a composable (`src/stores/quickAdd.ts`, `src/stores/toast.ts`; note the writable `computed` wherever a component two-way binds). The registry is provided in `main.ts`; tests provide a fresh one per render instead of `$reset()`.
- **DB**: all access via `src/db/index.ts` repositories. Schema changes need a version bump, an `upgrade()`, and a converter update. `src/db/schema.ts` has the worked v1→v2 example, and [local-first.md](local-first.md) says why both.
- **One schema per row, in `src/db/converters.ts`**: a `Schema.Struct` plus a same-name `interface` is the source of truth; Dexie's table typing, the read-path decode, and backup validation all derive from it. Never hand-write a TypeScript type beside a schema for the same data. They drift silently. IndexedDB is untrusted input: repositories decode every row on read and validate every draft on write, both failing with tagged errors.
- **DB is Effect-based**: repositories are `Context.Service` classes with `Layer`s (`src/db/repositories/notes.ts` is the worked example), failures are tagged errors (`Schema.TaggedError`, `src/db/errors.ts`) visible in each program's type, and validation uses `effect/Schema`, not zod. Effect does not stop at the Vue boundary. It meets Vue at atoms. Reads that drive the UI are atoms built with `dbRuntime.atom(program)` and wired with `Atom.withReactivity([NOTES_KEY])`; `src/features/notes/atoms.ts` is the worked example. Their `AsyncResult` value carries loading, failure, and data typed into the template, and subscribing is the load. Writes are programs the component composes and hands to `useDbWrite`'s `write`, the one edge over the `dbMutation` fn atom — never to `useAtomSet(() => dbMutation)` directly, because that setter resolves with `undefined` on a _defect_ rather than rejecting, and a crash mid-write then reaches neither `app.config.errorHandler` nor the `unhandledrejection` backstop in `main.ts`. `write` also holds the in-flight guard, so a double tap runs one program rather than two. Like `runDb`, it accepts only a `DbProgram` — `Effect<unknown, never, DbServices>` — so every failure has to be handled inside Effect with `Effect.catchTag`/`Effect.catchTags` first. An unhandled `DatabaseError` is a type error, not a runtime surprise. A landed write invalidates the reactivity key, so read atoms re-read from disk and nothing re-reads by hand. `runDb` remains the imperative edge for programs that read and leave (backup export, test assertions). No try/catch and no `instanceof` in `.vue` files; `src/views/SettingsView.vue` is the worked example, with three failure types and one exhaustive `catchTags`. Pure Effect programs are tested with `it.effect` from `@effect/vitest` in the unit tier, worked example `src/__tests__/unit/db/backup.spec.ts`. Browser-tier tests say what they mean about failure with `Effect.orDie` (a failure would break the test) or `Effect.flip` (the failure _is_ the assertion). Inside a program, log with `Effect.logError` plus `Effect.annotateLogs` rather than `console.error` in an `Effect.sync`, which keeps the entry on the fiber and the span `Effect.fn` opened.
- **Where Effect starts and stops**: everything reachable from `@/db`, meaning persistence, backup payloads, and the domain rules over them. `src/lib/backupFile.ts` is on this side, since a component composes it into one `catchTags` with the db programs. Browser-platform plumbing with no domain content stays plain async TypeScript: `src/lib/persistentStorage.ts` and `src/lib/swUpdateCheck.ts` use try/catch on purpose. If a failure needs a name the UI can match on, it belongs in Effect; if the only response is `console.debug`, it does not.
- **One layer stack, two runtimes**: `src/db/layer.ts` defines `dbLayer`, and both the atom runtime (`src/db/atoms.ts`) and the ManagedRuntime behind `runDb` (`src/db/runtime.ts`) are built from it. They are separate contexts, so a repository layer merged into one is invisible to the other. Add new layers in `layer.ts` and nowhere else. `src/lib/observability.ts` rides along there: OTLP tracer and logger from `effect/unstable/observability`, no `@opentelemetry/*` dependency, gated on `import.meta.env.DEV && VITE_OTLP_URL` so it is dead code in production. The spans it exports are the `Effect.fn('NotesRepo.list')` names already in the repositories. Instrument by naming the `Effect.fn`, not by adding an exporter call.
- **Shared components are tiered by atomic design**: `src/components/` holds `atoms/`, `molecules/`, `organisms/` and `templates/`, with `src/views/` as the pages above them and a feature's own components outside the tree entirely. A tier holds exactly two shapes: a **primitive** — every atom (`atoms/AtomButton.vue`), plus the compound form, a directory with an `index.ts` barrel holding a provider and its parts (`molecules/dialog/`) — and a **composite**, a flat `.vue` in a tier above atoms (`molecules/MoleculePageHeader.vue`, `organisms/OrganismAppShell.vue`). A directory is for the compound form only: a primitive that is one component is one file, and `primitives.test.ts` fails a directory holding one part. Every component is named for its tier, singular and without exceptions — `AtomButton`, `MoleculeDialogContent`, `OrganismAppShell`, `TemplatePageLayout` — so the tier is visible in a template, where no import path is. The filename, the tag, and the barrel export where there is a barrel, are one string; a barrel that aliases the prefix away is a build failure. Which tier something belongs to is not about size but about what it stops working without — props alone is an atom, a place in the app is an organism — and imports point one way: a component may import its own tier and everything below it, never a tier above. A same-tier import is composition, not a leak. Enforced twice: a `no-restricted-imports` scope per tier in `eslint.config.ts`, built from the exported `TIERS` array, and `src/__tests__/architecture/atomicDesign.test.ts` for the three things lint cannot see — a component loose in `src/components/` that no scope matches at all, the relative spelling of an upward import, which carries no `components/` segment for a specifier pattern to match, and the tier prefix on the filename. Full reasoning: [atomic-design.md](atomic-design.md).
- **A primitive is a shadcn-vue-style wrapper over reka-ui, and the pattern is copied rather than installed**: one file when it is one component (`atoms/AtomButton.vue`), and for the compound form one directory, one file per part, plus an `index.ts` barrel that is the only way in. `src/components/molecules/dialog/` is the worked example, where `MoleculeDialog` provides and `MoleculeDialogContent`/`Header`/`Footer`/`Title`/`Description`/`Close` compose. Inside a wrapper the unprefixed name is reka's, which is how `MoleculeDialogTitle.vue` renders reka's `DialogTitle` without a collision. `reka-ui` and `class-variance-authority` are private to the primitives — anywhere under `atoms/`, or inside a compound directory in any tier: importing either anywhere else is a lint error, as is reaching past a barrel, and a primitive may not import `@/db`, `@/stores/*`, or a feature. A composite may — that is what makes it a composite. Every part follows the same five moves. Accept the reka part's props plus `class`, `reactiveOmit(props, 'class')`, `useForwardProps`/`useForwardPropsEmits` for the rest, a `data-slot` naming the part, and `cn(defaults, props.class)` so the call site's classes win via `tailwind-merge`. The tree is the variant: a flag that changes _what_ renders (`mode`, `showHeader`) is a missing child component, not a prop. `variant`/`size`/`class` change _how_ and are fine, and belong in a `cva()` table — in the component's own script block when it is one file, in the barrel when several parts share it. A flat convenience wrapper (`<MoleculeConfirmDialog>`) is built on top of the primitives, never as flags on them. Skipping the primitive is a lint error too, not just reaching past it: `<button>`, `<input>`, `<textarea>` and `<label>` are banned in any `.vue` outside a primitive (`vue/no-restricted-html-elements`, the `app/no-raw-elements` scope), because a raw `<button>` has no touch floor, no press feedback and no focus ring and looks correct on a desktop review. That rule has to be ESLint: oxlint hands a JS plugin a `.vue` file as its `<script>` block alone, so a plugin rule cannot see markup at all. Enforced twice, like the db boundary: `no-restricted-imports` for the imports, `src/__tests__/architecture/primitives.test.ts` for file shape (a compound directory holding more than one part, barrel export, `data-slot`, `class` merged through `cn()`, at most three self-declared props beyond `class`). Full reasoning and the deliberate deviations from upstream: [ui-components.md](ui-components.md).
- **Features never import other features**; shared layers never import features. Enforced twice: ArchUnitTS in `src/__tests__/architecture/` reads the TypeScript module graph, and `no-restricted-imports` in `eslint.config.ts` covers `.vue` files, which ArchUnitTS does not parse.
- **Two-way binding**: `const open = defineModel<boolean>('open')`, except where a reka part already owns the model (`Switch` forwards `modelValue` to `SwitchRoot`), since two owners of one value drift.
- **i18n**: every user-facing string in `src/i18n/messages/en.ts` and `de.ts`; the schema type makes missing keys a compile error. Two things it cannot see are checked in the arch tier (`i18nKeys.test.ts`): a key nothing reads (deleted UI leaves its strings behind, and translators pay for them forever), and a key built at runtime. ``t(`notes.age.${unit}`)`` compiles whatever `unit` holds, so the typed-key guarantee lapses exactly where it is easiest to get wrong. Interpolation is allowed but has to be declared in that file's `INTERPOLATED` map, together with the keys it can produce, and both directions are checked.
- **Tests are not colocated**: they live in `src/__tests__/`, mirroring the source tree. Which tier a test belongs in: [testing-strategy.md](testing-strategy.md). How to write one once you are there: [vitest-practices.md](vitest-practices.md). Anything that drives the UI goes through a page object, `src/__tests__/pages/` for the browser tiers and `test/e2e/pages/` for e2e, so a spec reads as the journey and a locator exists once. A spec that writes its own `getByRole(...)` for an app screen belongs in the object instead. Both sides hand the objects over as fixtures (`src/__tests__/fixtures.ts`, `test/e2e/fixtures.ts`): a spec or step declares the screen it drives (`async ({ notes }) => …`) and never mounts, resets, or unmounts by hand. Assertion helpers, meaning the `expect*` members of a screen object and the axe helpers, are wrapped in `vi.defineHelper` so a failure reports at the spec line that called them.
- **Lint carries two rule sets worth knowing about**: `eslint-plugin-regexp` (flat/recommended) and `@e18e/eslint-plugin`'s modernization set. The first is there for `no-super-linear-backtracking`, a ReDoS check, since a pattern that is quadratic in its input is a hang rather than a style question, and for `no-misleading-capturing-group`. The second replaces a hand-rolled idiom with the platform one that has since landed (`Object.hasOwn`, `Array#at`, `toSorted`, `regex.test()`). e18e's `moduleReplacements` set is deliberately not enabled: swapping a dependency is a call for review, not for `--fix`.
- **Every control answers a touch, and every environment value is clamped**: a new control carries a press state (`active:scale-…`), `touch-manipulation` and `select-none`, and is sized touch-first with the fine-pointer size as the exception (`h-touch-target … pointer-fine:h-10`). A `hover:` alone is invisible on a phone, since Tailwind v4 gates it behind `@media (hover: hover)`. `env(safe-area-inset-*)` is 0 on most hardware and in all of CI, so it appears only inside the clamped `safe-area-*` utilities in `src/style.css`, and nothing else may declare the same padding beside one. App chrome is unselectable app-wide with prose opting back in via `select-text`, and the field exemption for `input`/`textarea` ships in the same commit as the global rule. Without it iOS refuses caret placement, which looks like a broken keyboard rather than a CSS bug. Enforced twice, like the other boundaries: `src/__tests__/touch/` and `components/touchConventions.spec.ts` for behaviour, `architecture/touchConventions.test.ts` for coverage. The `touch` tier is the only one with a coarse pointer. Every other browser project is a desktop Chromium, which is how a batch of these rotted unnoticed. Full reasoning, and the manual device checklist for what no tier can see: [touch-conventions.md](touch-conventions.md).
- **Keep logic in `.ts` modules, not `<script setup>`**. That is what makes it unit-testable and visible to the arch tests, and it is now enforced rather than asked for. Three layers: a core of pure decisions (`db/converters.ts`, `features/*/{catalog,domain,history,pace,progress,schedule,session,targets,types,week}.ts`, `lib/installPlatform.ts`, `lib/utils.ts` — the feature half is a per-module list rather than a `features/**` glob, so a new core module is a deliberate entry in `CORE` and a sibling shell module can never be swept in by accident), a reactive shell of components, composables, stores, atoms and repositories, and a platform edge of modules whose whole job is one fallible browser API (`lib/persistentStorage.ts`, `lib/swUpdateCheck.ts`, and the rest of the `PLATFORM_EDGE` list in `eslint.config.ts`). The shell stays thin: `max-depth: 1`, complexity 4, 7 statements, which are the measured maxima of the tree that was already here, so the limits only tighten from here and no refactor was needed to land them. The core stays deterministic, with no `Date.now()`, `new Date()`, `Math.random()`, no ambient reads (`localStorage`, `navigator`, `document`, `fetch`, …), and no `Effect.run*`: the core _builds_ programs and hands them up, and takes its inputs as parameters the way `detectInstallPlatform` takes `{ userAgent, maxTouchPoints }`. A composable is shell, not core. It owns _when_, a `.ts` module owns _what_; `useNoteAge` (every 30 s) over `noteAge` (a `Clock`-driven program) is the worked example, and "extract a composable" moves logic sideways where "extract a module" moves it down. The payoff is the tripwire: the unit tier may only use `vi.mock`/`vi.fn`/`vi.spyOn`/`vi.stubGlobal` in a platform-edge spec, so a double anywhere else means the code under test is shell. (`TestClock` is a seam, not a double, and is always fine.) Enforced twice, like the other boundaries: `eslint.config.ts` grades the code and covers `.vue`, `architecture/functionalCore.test.ts` grades what lint cannot see, namely that each layer glob still matches a real file, and the no-doubles property itself. Full reasoning: [functional-core.md](functional-core.md).
- **Composables follow VueUse's authoring conventions**, because `@vueuse/core` is already a dependency and half of ours are glue over one of its functions, so a call site cannot tell whose composable it is holding. Reactive arguments are `MaybeRefOrGetter` plus `toValue` and options go in an options object. One value is returned as the ref itself (`useTouchDevice()` → `ComputedRef<boolean>`, like the `useMediaQuery` it wraps), several as an object of refs, never as `void`. A composable that returns nothing can only be observed through what it touched on the way past. The return type is declared, which is where the per-key docs live, but exported only when something imports it, since knip grades dead exports. `shallowRef` is the default and `deepRef` is the opt-in; a Web API that might be missing also returns `isSupported`, and the composable still returns its whole shape when it is false. Effects clean themselves up through `useEventListener`/`tryOnScopeDispose`. A bare `addEventListener` inside a composable is a lint error, while one at _module_ scope is the deliberate singleton case (`useInstallPrompt`). A per-caller timer or listener that should be one is shared with `createSharedComposable`, as `useNoteAge`'s 30 s ticker is. That shares an _effect_, and is not a licence to keep shared _state_ outside an atom. The four module-scoped singletons here each export a `reset…State()` wired into `__tests__/helpers/reset.ts`; that is the price of the deviation and it is enforced. Enforced twice, like the other boundaries: the `app/composables` block in `eslint.config.ts` grades the bodies, `architecture/composables.test.ts` grades what lint cannot see. Full reasoning, and the four deliberate deviations from upstream: [composables.md](composables.md).

## Git workflow

Conventional Commits with scope (`feat(notes): …`). The husky pre-commit gate (~15 s) runs lint-staged, type-check, test:unit, and knip on every commit. Do not bypass it with `--no-verify`. Browser/a11y/visual/e2e tiers are CI's job (`.github/workflows/`); run the ones your change touches before pushing.

## Conventions in this bundle

- Every non-index file carries `type`, `title`, `description`, `tags`, and `status`. `type` is one of `Playbook`, `Architecture Decision`, `Convention`, or `Reference`.
- Content vendored from elsewhere carries a `sources` entry naming where it came from. That is the provenance record, so there is no separate lockfile.
- Links are relative, so they resolve both on GitHub and for a consumer walking the directory.
