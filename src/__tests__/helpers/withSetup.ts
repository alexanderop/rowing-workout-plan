import { AtomRegistry, registryKey } from '@effect/atom-vue'
import type { InjectionKey } from 'vue'
import { createApp, defineComponent } from 'vue'

/**
 * A value to hand the composable through `provide`/`inject`.
 *
 * The key is typed loosely on purpose: a list of injections is heterogeneous,
 * so the alternative is a generic tuple type that buys nothing — the value a
 * composable pulls back out is checked by its own `InjectionKey` at the
 * `inject` call, which is where the guarantee belongs.
 */
export interface Injection {
  readonly key: InjectionKey<unknown> | string
  readonly value: unknown
}

/** A composable running inside a component instance, and the way to end it. */
export interface MountedComposable<T> {
  readonly result: T
  /** Idempotent, and already registered with the fixture's cleanup. */
  readonly unmount: () => void
}

/**
 * Runs a composable inside a real component's `setup`, so the half of it that
 * only exists there actually runs: lifecycle hooks, `inject`, and — the one
 * that bites quietly — the effect scope every VueUse cleanup hangs off.
 *
 * A composable called bare from a spec still *returns* the right values, which
 * is why the gap is easy to miss. What it does not do is ever stop:
 * `useEventListener`, `useIntervalFn` and `watchEffect` all register their
 * teardown with `onScopeDispose`, and with no active scope that registration
 * is a silent no-op. The listener stays on `window`, the interval keeps
 * firing, and the spec passes. See docs/testing-composables.md for which
 * composables in this app need this and which genuinely do not.
 *
 * ```ts
 * const { result: locale } = mountComposable(() => useLocale())
 * ```
 *
 * Prefer the `mountComposable` fixture in `../fixtures.ts`, which registers
 * the unmount for you. Reach for this directly only outside a test body.
 */
export function withSetup<T>(
  composable: () => T,
  injections: ReadonlyArray<Injection> = [],
): MountedComposable<T> {
  let result!: T

  const app = createApp(
    defineComponent({
      setup() {
        result = composable()
        // Nothing to render: this harness is for the script half of a
        // component. A spec that needs a template is a component spec.
        return () => null
      },
    }),
  )

  // A fresh registry per mount, mirroring renderApp — otherwise `useAtom`
  // falls back to the package's module-scoped `defaultRegistry` and every
  // spec in the file shares one set of atom values. Provided before the
  // caller's own injections, so a spec can still override it.
  app.provide(registryKey, AtomRegistry.make())
  for (const { key, value } of injections) app.provide(key, value)

  // Vue reports a setup failure through its error handler and then *warns*
  // before rethrowing — and the console gate turns that warning into a second,
  // confusing failure. Capturing it here means a composable that throws on a
  // missing injection fails at the spec line that mounted it, with its own
  // error, and nothing on the console.
  let setupError: unknown
  app.config.errorHandler = (error) => {
    setupError = error
  }

  // Detached on purpose: the harness renders nothing, so attaching it would
  // only leave a stray node behind whenever an unmount is missed. A composable
  // that measures layout needs a component spec, not this.
  app.mount(document.createElement('div'))
  app.config.errorHandler = undefined

  let unmounted = false
  const unmount = (): void => {
    if (unmounted) return
    unmounted = true
    app.unmount()
  }

  if (setupError !== undefined) {
    unmount()
    throw setupError
  }

  return { result, unmount }
}
