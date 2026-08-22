---
type: Convention
title: Testing composables
description: The two kinds of composable, why the dependent kind passes its tests while leaking, and the withSetup harness plus mountComposable fixture that close the gap.
tags: [testing, composables, vue, vitest, lifecycle, provide-inject]
status: stable
---

# Testing composables

[testing-strategy.md](testing-strategy.md) decides _which tier_ a test belongs
in, [vitest-practices.md](vitest-practices.md) decides _how it is written_, and
[composables.md](composables.md) decides what the composable itself looks like.
This decides what to do about the one thing a composable spec has that no other
spec does: half of what a composable does only happens inside a component
instance, and the half that does not is the half you get for free when you call
it directly.

The split below, and the `withSetup` helper, come from Alexander Opalic's _How
to Test Vue Composables: A Comprehensive Guide with Vitest_. What follows is
that pattern reconciled with this project's tiers, fixtures and console gate,
including the two places the naive version of it goes wrong here.

## Two kinds, and only one of them needs a harness

A composable is a function over Vue's reactivity. Some of them are _only_ that:

- **Independent.** Reactivity APIs and nothing else: `ref`, `computed`,
  `watch`, module-scoped state. Call it, assert on what it returned.
- **Dependent.** Needs a component instance, for one of three reasons:
  lifecycle hooks (`onMounted`), `inject`, or the one that does the damage
  here, an effect scope for something to clean up against.

That last reason is why this document exists, because it is the one that does
not announce itself. `onMounted` never firing shows up as a wrong value on the
first assertion. A missing effect scope shows up as _nothing at all_:

```ts
// Passes. Also leaves a resize listener on the visual viewport forever.
const { inset } = useKeyboardInset()
expect(inset.value).toBe(0)
```

`useEventListener`, `useIntervalFn`, `useTimestamp`, `createSharedComposable`
and `watchEffect` all hang their teardown off the active effect scope. With no
active scope that registration is a silent no-op: VueUse's
`tryOnScopeDispose` returns `false` and says nothing. Subscribing worked, so
every assertion about the subscription passes. Only the unsubscribing is gone,
and no test that calls the composable bare can ever see it.

## Which is which here

This axis is not the same as the four kinds in
[composables.md](composables.md#the-four-kinds-in-this-app). That one is about
the shape a composable presents, this one is about whether a spec can reach it
without a component. They line up almost, but not quite, and the exception is
the interesting part:

| Composable                                                  | Kind ([composables.md](composables.md)) | Testing     | What makes it so                                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `useLocale`, `useTheme`, `useInstallPrompt`, `usePwaUpdate` | Module-scoped singleton                 | Independent | The ref, the watcher and the listener are created once at import, outside any component. Calling the function only hands them out. |
| `useKeyboardInset`                                          | Browser API wrapper                     | Dependent   | `useEventListener` on `visualViewport`, detached from the scope.                                                                   |
| `useTouchDevice`                                            | Browser API wrapper                     | Dependent   | `useMediaQuery` is a listener like any other.                                                                                      |
| `useNoteAge`                                                | Derived value                           | Dependent   | The shared ticker's interval is refcounted, and the refcount drops from `tryOnScopeDispose`.                                       |
| `useReportFailure`                                          | Injection factory                       | Dependent   | `useToastStore` → `useAtom` → `inject(registryKey)`, plus a `watchEffect`.                                                         |

The first row is worth reading twice: four of this app's composables are
independent _because module-scoped state was a deliberate choice_, made for
reasons that have nothing to do with testing (one service worker registration,
one `beforeinstallprompt` listener, one source of truth). Their specs call them
directly and are right to; `useLocale.spec.ts` is the worked example. The
harness is not the default. It is what the second group needs.

The fourth row is the one that does not follow from the shape. A "derived
value" that is only `computed` plus `toValue` would be independent, and
`useNoteAge` reads like one at the call site. It is dependent because of a
decision made for an unrelated reason, namely `createSharedComposable` so a
list of 30 cards is not 30 intervals, and that decision moved the cleanup
somewhere a bare call cannot reach. Read the body, not the signature.

## The harness

`src/__tests__/helpers/withSetup.ts` mounts a component whose only job is to
run the composable in `setup`, and hands back the result plus a way to end it.
Specs do not call it directly. `mountComposable` in
`src/__tests__/fixtures.ts` wraps it and registers the unmount, so the usual
rule holds: the spec never has to clean up.

```ts
import { it } from '../fixtures'

it('ages a note that is already on screen', ({ clock, mountComposable }) => {
  const { result: age } = mountComposable(() => useNoteAge(() => updatedAt))

  expect(age.value).toEqual({ unit: 'justNow' })
  clock.advance(60_000)
  expect(age.value).toEqual({ unit: 'minutes', count: 1 })
})
```

It returns the harness (`{ result, unmount }`) rather than the bare result,
because a spec about teardown has to be able to say _when_. `unmount` is
idempotent and also registered with the fixture, so calling it is a choice
rather than an obligation.

Two things it does that the article's version does not, both because of
decisions made elsewhere in this repo:

- **It provides a fresh atom registry**, mirroring `renderApp`. Without one,
  `useAtom` falls back to `@effect/atom-vue`'s module-scoped `defaultRegistry`,
  which is shared by every spec in the process, so a toast raised in one test
  is still there in the next. This is also why the article's second helper
  (`useInjectedSetup`) is not a separate function here: injections are an
  optional second argument to the same one, and the registry is simply the
  injection every composable in this app needs.
- **It captures a setup failure instead of letting Vue report it.** Vue logs
  `Unhandled error during execution of setup function` through `console.warn`
  before rethrowing, and the console gate turns that into a second, confusing
  failure beside the real one. The harness installs an `errorHandler` for the
  duration of the mount and rethrows at the call site, so a composable that
  throws on a missing injection fails once, at the line that mounted it.

App-level `provide` is enough for both, so there is no Provider/Child pair:
`app.provide(key, value)` is visible to the root component, which
self-`provide` inside one `setup` would not be.

## What a dependent composable's spec has to assert

Mounting is not the point. The point is the claim that only holds inside a
scope, and it needs its own test. The three `useKeyboardInset` tests that
existed before this harness all passed against the leaking version.

**The evidence is the scheduler, not the value.** The obvious shape for
`useNoteAge`, unmount then advance a minute then assert the age did not move,
fails even when the interval _is_ cleared. A `computed` that nothing subscribes
to any more is not frozen; it simply recomputes on the next read, and `noteAge`
then sees the advanced clock. A leaked interval is a fact about what is still
scheduled, so that is what the spec asserts:

```ts
expect(clock.scheduled()).toBe(1)
unmount()
expect(clock.scheduled()).toBe(0)
```

Where the composable's effect is observable in the document, assert _that_
instead. `useKeyboardInset` stops writing `--keyboard-inset` after unmount, so
its teardown test dispatches a resize and reads the variable. Prefer the
observable form when there is one; reach for the scheduler when there is not.

The rule in [composables.md](composables.md#returns) that a composable never
returns `void` is what makes the observable form available at all. Assert the
returned ref for the readings, since it is the API and it needs no round-trip
through `getComputedStyle`, and keep one assertion on the side effect that is
the actual product, which for `useKeyboardInset` is the CSS variable a sheet
positions against.

## Fake timers, doubles, and where the tier line is

A composable spec is browser tier (`src/__tests__/composables/`, or
mirroring the source tree for a feature-local one like
`src/__tests__/features/notes/useNoteAge.spec.ts`). It needs a DOM to mount
into, and `useIntervalFn` will not even start without `isClient`.

That means `vi.stubGlobal` and `vi.useFakeTimers` are available. The ban in
[functional-core.md](functional-core.md) is on the unit tier, and it is the
_core_ that has to be reachable without a double. Using one here is not a
loophole, but it is a question worth asking: if a composable's spec needs to
fake something in order to say anything interesting, the interesting part is
probably a decision that belongs one layer down.

`useNoteAge` is the shape to copy. The bucket boundaries are not tested in the
composable's spec at all. They belong to `noteAge`, and
`src/__tests__/unit/notes/domain.spec.ts` walks every one of them with
`TestClock` in milliseconds. What is left for the browser tier is the only
thing the composable adds: _when_ the program is re-run, and whether it stops.
A composable spec that is doing arithmetic is testing the wrong file.

Keep `toFake` narrow (`['setInterval', 'clearInterval', 'Date']` for
`useNoteAge`). It names which clocks the composable actually sits between, and
it is what makes `vi.getTimerCount()` mean "ours" rather than "the runner's".

## Effect logging trips the console gate

A composable that calls `Effect.logError` reaches `console.error` through the
default logger, and [the gate](vitest-practices.md#the-console-is-asserted-on)
fails the test. Do not widen the allowlist. Provide a capturing logger for the
length of the program:

```ts
const logger = Logger.make<unknown, void>((options) => {
  entries.push({
    level: options.logLevel,
    annotations: { ...options.fiber.getRef(References.CurrentLogAnnotations) },
  })
})
await Effect.runPromise(recover(error).pipe(Effect.provide(Logger.layer([logger]))))
```

`Logger.layer` _replaces_ the logger set rather than adding to it, so this both
keeps the entry off the console and makes it assertable, which is the better
test anyway. `useReportFailure` exists so the log schema cannot drift between
components; the only way to say that is to read `boundary`, `operation` and
`failure` back out. `src/__tests__/composables/useReportFailure.spec.ts` is the
worked example.

## Checklist for a new composable spec

1. **Which kind?** Only reactivity and module-scoped state means you call it
   directly. Lifecycle, `inject`, or anything with a cleanup means
   `mountComposable`.
2. **Does it read shared preferences?** Add `beforeEach(resetAppState)`. The
   fixture deliberately does not do this, because mounting one composable is not
   mounting the app, and keeping the database out is what lets it compose with
   fake timers.
3. **Write the teardown test.** It is the one test the bare-call style cannot
   write, and therefore the only one that justifies the harness.
4. **Check the arithmetic is not here.** If the spec computes an expected
   value, the decision belongs in a `.ts` module and its test in the unit tier.
