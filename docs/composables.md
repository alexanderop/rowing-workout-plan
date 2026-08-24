---
type: Convention
title: Writing composables
description: The VueUse authoring conventions this app adopts (what a composable takes, what it hands back, how its effects clean up), plus the four deliberate deviations and where each rule is enforced.
tags: [composables, vue, vueuse, reactivity, conventions]
status: stable
sources:
  - resource: https://github.com/vueuse/vueuse/blob/main/packages/guidelines.md
    id: vueuse-guidelines
    title: VueUse, Guidelines (read at e9fe32c, 2026-08-08)
  - resource: https://github.com/vueuse/vueuse/blob/main/packages/guide/best-practice.md
    id: vueuse-best-practice
    title: VueUse, Best Practice
  - resource: https://antfu.me/posts/composable-vue-vueday-2021
    id: composable-vue
    title: Anthony Fu, Composable Vue (VueDay 2021)
    author: antfu
---

# Writing composables

`@vueuse/core` is already a dependency, and half the composables in this app
are three lines of glue over one of its functions. So the house style is not
invented here. It is [VueUse's own authoring
guidelines](https://github.com/vueuse/vueuse/blob/main/packages/guidelines.md),
adopted wholesale except where an app can do something a library cannot. The
payoff is that `useTouchDevice` and `useMediaQuery` behave the same way at a
call site, with the same argument shapes, the same return shapes and the same
cleanup story, so there is nothing to remember about which one you are holding.

A composable is shell, not core: it owns _when_ something is evaluated, a
plain `.ts` module owns _what_ the answer is. That split, and the budget that
enforces it, is [functional-core.md](functional-core.md). This file is about
what a composable presents to a caller once the decisions have moved down.
Speccing one is [testing-composables.md](testing-composables.md), which covers
which kind needs a component instance to test at all, and the `mountComposable`
harness for the ones that do.

## The four kinds in this app

Naming them is worth doing, because three of the rules below apply to only one
kind and reading a composable starts with knowing which you are looking at.

| Kind                        | Shape                                                                               | Worked example                                              |
| --------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Browser API wrapper**     | Subscribes to something the platform owns; returns the reading and an `isSupported` | `useKeyboardInset`, `useTouchDevice`                        |
| **Derived value**           | Takes a reactive argument, returns a `computed` over it                             | `useNoteAge`                                                |
| **Module-scoped singleton** | State at module scope, one per document; the function is just the accessor          | `useTheme`, `useLocale`, `usePwaUpdate`, `useInstallPrompt` |
| **Injection factory**       | Calls `inject`-flavoured setup, returns a plain function                            | `useReportFailure`, `useDbWrite`                            |

## Arguments

**Reactive in, via `MaybeRefOrGetter` plus `toValue`.** A caller should be able to
pass a value, a ref, or a getter and have the result follow. `useNoteAge` is
the worked example; `NoteCard.vue` passes `() => note.updatedAt`, so an edit
re-ages the card without re-mounting it.

```ts
export function useNoteAge(updatedAt: MaybeRefOrGetter<number>): ComputedRef<NoteAge> {
  // toValue() unwraps all three shapes, inside the computed so it stays tracked
}
```

**Options go in an options object, always.** Even for one option, even the
first time. Adding a second positional parameter later is a breaking change at
every call site; adding a key is not. No composable here has needed one yet.
When one does, it is `useThing(source, { interval })`, not
`useThing(source, interval)`.

## Returns

**One value: return the ref.** `useTouchDevice()` returns
`ComputedRef<boolean>` rather than `{ isTouchDevice }`. Same shape as the
`useMediaQuery` it wraps, and it lets the call site pick the name. Wrapping a
single value in an object only adds a layer to unwrap.

**Several: return an object of refs.** Destructurable, and `reactive()`-able by
a caller who would rather write `state.inset` than `inset.value`. Never return
a plain unwrapped value where a ref belongs. It snapshots, and the caller has
no way to tell until the UI stops updating.

**Declare the return type.** Not inferred: the return value is the composable's
API, and an inferred one changes shape whenever the body does, silently, for
every caller at once. It is also where the per-key documentation goes:

```ts
interface UseKeyboardInsetReturn {
  /** Keyboard height in CSS pixels. 0 when closed, zoomed, or unsupported. */
  inset: ShallowRef<number>
  /** Whether this browser has a `visualViewport` to measure. */
  isSupported: ComputedRef<boolean>
}
```

The interface is not exported unless a consumer names it. VueUse exports
every `UseXReturn` because it is a library with a public API; here an exported
type nothing imports is dead weight, and `pnpm knip` says so. `ReturnType<typeof useThing>`
covers the rare case.

**Never `void`.** A composable that returns nothing can only be observed
through whatever it touched on the way past, a CSS variable, a global, the
DOM, which makes it a side effect with a `use` prefix. `useKeyboardInset` used
to be exactly that; it now returns the same number it writes to
`--keyboard-inset`, and the CSS variable is still the product. Callers that
only want the effect ignore the return, which costs them nothing.

## Reactivity

**`shallowRef` is the default.** `ref()` deep-proxies its contents, which for a
DOM node, an event object, or a decoded row is both wasted work and a wrapper
the platform will not accept back. `useInstallPrompt` holds the deferred
`beforeinstallprompt` event in a `shallowRef` for precisely that reason:
`prompt()` and `userChoice` have to be called on the real instance. When nested
mutation genuinely _is_ the point, use `deepRef` from `@vueuse/core`. Same
behaviour as `ref`, but it says so.

**`isSupported` for anything the platform might not have.** And the composable
still returns its whole shape when unsupported, rather than bailing early
with a different one, since a caller destructuring the result should not have to
know. `useKeyboardInset` returns a permanently-zero `inset` on a browser with
no `visualViewport`, and sheets fall through to `var(--keyboard-inset, 0px)`.

## Effects

**Every effect cleans itself up, without the caller asking.** In practice that
means `useEventListener`, `useIntervalFn`, `watch` and friends, all of which
register their teardown with the active effect scope, and `tryOnScopeDispose`
for anything hand-rolled. A bare `addEventListener` inside a composable is a
listener that outlives its caller, and it is a lint error here.

Lint can see the bare `addEventListener`; it cannot see whether the scope-aware
version actually let go. Nothing does, unless a spec says so, and a spec that
calls the composable directly _never_ can, because with no active scope the
teardown registration is a silent no-op and every other assertion still passes.
That is the one test each of these owes:
[testing-composables.md](testing-composables.md#what-a-dependent-composables-spec-has-to-assert).

The exception is module scope, and it is a real one: `useInstallPrompt`
registers `beforeinstallprompt` on `window` at import time because the event
fires once, when the browser decides the app is installable, which may be
before any component has mounted. A listener with no caller cannot outlive one.

**Share the effect, do not duplicate it.** A list of 30 notes calls
`useNoteAge` 30 times; if each started its own `useTimestamp`, that is 30
intervals firing at 30 different offsets. `createSharedComposable` runs the
body once in a detached scope, hands every caller the same ref, and stops the
interval when the last one unmounts:

```ts
const useAgeTicker = createSharedComposable(
  (): ShallowRef<number> => useTimestamp({ interval: 30_000 }),
)
```

Worth knowing before reaching for it: arguments are only honoured on the
first call, since later callers get the state the first one built. That is
why the interval above is fixed rather than offered as an option.

**No `console`.** Inside an Effect program, log with `Effect.logError` plus
`Effect.annotateLogs`. See `useReportFailure`, which exists so the log schema
cannot drift. Outside one, a composable that wants to say something returns a
value saying it.

## Deviations from VueUse, and why

Four of VueUse's rules are deliberately not adopted. They are all cases where
the library is solving a problem an app does not have, and each is written
down here because a reader coming from the VueUse source will otherwise assume
it was forgotten.

**No `configurableWindow` / `ConfigurableDocument`.** VueUse takes `window` and
`document` through options so it can serve iframes, multi-window setups, SSR
and test mocks. This app has one window, no SSR, and reads `globalThis.…`
directly. The seam a test needs is `vi.stubGlobal`, in the browser tier, where
stubbing the platform is already the convention. See
`__tests__/composables/useKeyboardInset.spec.ts` and
[testing-composables.md](testing-composables.md#fake-timers-doubles-and-where-the-tier-line-is).

**Shared _state_ is an atom, not `createGlobalState`.** That rule predates this
file and is not up for revision: shared state lives in a registry-held `Atom`
(see [the index](index.md)), which is what makes it resettable per test and
inspectable in one place. `createSharedComposable` is not the same thing and is
allowed. It shares an _effect_ whose lifetime is tied to its subscribers, not
a value the app reasons about.

**Module scope is allowed, for one-per-document flows.** Four composables here
keep state at module scope rather than in a scope-aware wrapper: one theme, one
locale, one service-worker registration, one `beforeinstallprompt`. The event
sources really are singletons, and a per-caller registration would mean two
hourly update checks the moment a second component mounts.

The cost is that this state outlives every test, and `localStorage.clear()`
fires no storage event in the document that called it, so each of them exports
a `reset…State()` wired into `__tests__/helpers/reset.ts`. That is the price of
the deviation, and it is enforced: a composable that parks reactive state at
module scope without the seam fails the arch tier.

**No `controls` option, no `PromiseLike` returns, no renderless components.**
Library conveniences for consumers this app does not have. Add one when a
second caller needs it, not before.

## Where each rule lives

Enforced twice, the way every other boundary in this repo is, because a
convention that only exists in a document is a convention that rots.

| Rule                                                                | Enforced by                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Return type declared                                                | `@typescript-eslint/explicit-module-boundary-types`, `app/composables` scope         |
| `shallowRef` over `ref`                                             | `no-restricted-syntax`, same scope                                                   |
| `useEventListener` over bare `addEventListener` inside a composable | `no-restricted-syntax`, same scope                                                   |
| Those three actually reject                                         | `__tests__/architecture/boundaries.test.ts`                                          |
| The scope still matches real files                                  | `__tests__/architecture/composables.test.ts`                                         |
| No composable hiding outside the scope                              | same                                                                                 |
| One composable per file, named after it                             | same                                                                                 |
| Return type is not `void`                                           | same                                                                                 |
| Module-scoped state has a reset, and the reset is wired up          | same                                                                                 |
| Thinness: complexity 4, 7 statements, `max-depth: 1`                | `app/functional-core/shell-stays-thin`, see [functional-core.md](functional-core.md) |

What none of them can see is whether a composable should have been a plain
`.ts` module in the first place. The question to ask: does it own _when_
something happens? If the answer is no, it is a function, and it belongs in
`src/lib/` where it can be tested on values.
