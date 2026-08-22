import { test } from 'vitest'
import { resetAppState } from './helpers/reset'
import type { Injection, MountedComposable } from './helpers/withSetup'
import { withSetup } from './helpers/withSetup'
import { SettingsScreen } from './pages/settingsScreen'

/**
 * The browser tiers' `it`, with the screen objects handed over as fixtures —
 * the counterpart of `test/e2e/fixtures.ts`, so a spec and a Gherkin step
 * declare the screen they drive rather than constructing one:
 *
 * ```ts
 * it('exports a backup', async ({ settings }) => { … })
 * ```
 *
 * A fixture owns the whole lifecycle — reset the app state, mount, unmount
 * when the test ends — which is what removes the `let screen: … | undefined`
 * plus `beforeEach`/`afterEach` pair every browser spec used to carry. It is
 * also lazy: a test that never names `settings` never mounts it, so a spec
 * file can mix screens without paying for the ones it does not use.
 *
 * Written with the builder syntax (`.extend(name, fn)`, Vitest 4.1) rather
 * than the Playwright-compatible object form: the fixture type is inferred
 * from what the function returns, so there is no second copy of it to keep
 * in step. `onCleanup` may be called **once** per fixture — a fixture that
 * needs two teardowns is two fixtures.
 *
 * Only app-wide screens live here. A harness specific to one spec (the stub
 * router in `components/appShell.spec.ts`, the tall sheet in
 * `dialogContent.spec.ts`) is a fixture in that spec, extending this one.
 */
export const it = test
  .extend('settings', async ({}, { onCleanup }) => {
    // Mounting is what the fixture is for, so the reset that has to precede
    // it belongs here too — ordering by dependency rather than by hook
    // registration order.
    await resetAppState()
    const settings = await SettingsScreen.open()
    onCleanup(() => settings.close())
    return settings
  })
  /**
   * Dark mode as a fixture, so the visual tier can switch appearance without
   * an `afterEach` that remembers to switch it back. `resetAppState` returns
   * the color-scheme preference to `auto`; the class is what a test sets
   * directly, and what this puts back.
   *
   * `dark()` is async because the app animates the change: the tab bar carries
   * `transition-colors`, so for ~150ms after the class lands every colour on
   * screen is a blend of the two themes. Anything that reads colour in that
   * window — a screenshot, an axe contrast check — grades a frame that no user
   * ever sees, and does it differently each run. Awaiting the transitions is
   * what makes both tiers deterministic; it is not a sleep dressed up.
   */
  .extend('theme', async ({}, { onCleanup }) => {
    onCleanup(() => document.documentElement.classList.remove('dark'))
    return {
      async dark(): Promise<void> {
        document.documentElement.classList.add('dark')
        await settleTransitions()
      },
    }
  })
  /**
   * Runs a composable inside a component instance — the harness for everything
   * a composable only does when it has one: lifecycle hooks, `inject`, and the
   * effect scope its cleanups hang off. See
   * [docs/testing-composables.md](../../docs/testing-composables.md) for which
   * composables need it, and `helpers/withSetup.ts` for what it mounts.
   *
   * It hands back the harness rather than the bare result, because a spec
   * about teardown has to be able to say when:
   *
   * ```ts
   * const { result: locale, unmount } = mountComposable(() => useLocale())
   * ```
   *
   * Calling `unmount` is optional and idempotent — the fixture unmounts
   * whatever is still standing when the test ends, so the usual rule holds:
   * the spec never has to clean up, and can when that *is* the test.
   *
   * `onCleanup` may be called once per fixture, so the unmounts are collected
   * rather than registered one by one. Innermost first, mirroring the order a
   * component tree tears down in.
   *
   * Deliberately does **not** reset the app state, unlike the screen fixtures:
   * mounting one composable is not mounting the app, and a spec whose
   * composable reads the shared preferences says so with
   * `beforeEach(resetAppState)`, which is the convention
   * [testing-strategy.md](../../docs/testing-strategy.md) already sets for a
   * test that needs the reset without a screen. Keeping it out also keeps this
   * fixture free of the database, so it composes with fake timers.
   */
  .extend('mountComposable', async ({}, { onCleanup }) => {
    const mounted: Array<() => void> = []
    onCleanup(() => {
      for (const unmount of mounted.reverse()) unmount()
    })

    return <T>(
      composable: () => T,
      injections?: ReadonlyArray<Injection>,
    ): MountedComposable<T> => {
      const harness = withSetup(composable, injections)
      mounted.push(harness.unmount)
      return harness
    }
  })

/**
 * Waits out every CSS transition currently running.
 *
 * Filtered to `CSSTransition` on purpose: `getAnimations()` also returns
 * keyframe animations, and a looping one (a spinner, anything from
 * tw-animate-css) has a `finished` promise that never resolves — awaiting the
 * unfiltered list is a hang waiting for the first infinite animation to ship.
 */
async function settleTransitions(): Promise<void> {
  // One frame first: a transition provoked by a class change does not exist
  // until style is recalculated, so without this there is nothing to await.
  await new Promise((resolve) => requestAnimationFrame(resolve))

  await Promise.all(
    document
      .getAnimations()
      .filter((animation) => animation instanceof CSSTransition)
      // A transition cancelled mid-flight rejects; that it is over is all we
      // are waiting for, and why it ended does not change the answer.
      .map((animation) => animation.finished.catch(() => undefined)),
  )
}
