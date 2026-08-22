import { afterEach, beforeEach, expect, vi } from 'vitest'

/**
 * Fails any browser-tier test that logs an unexpected `console.warn` or
 * `console.error`.
 *
 * Vue reports a whole class of mistake this way and nothing else: a missing
 * required prop, a prop of the wrong type, an invalid `v-model` target, a
 * component resolved to nothing, a duplicate key in a `v-for`, a hydration or
 * reactivity misuse. None of it throws, so a test can render a broken
 * component, assert on the text that still made it to the screen, and pass. So
 * can the next twenty. Installing this once here is what turns those warnings
 * into the failure they already were.
 *
 * It applies to every browser tier (the shared `setupFiles`), not just one
 * spec, because the point is that no spec can opt out by forgetting.
 *
 * The console is left passing through — `vi.spyOn` wraps the method rather
 * than replacing it, so output still reaches the terminal. Only the assertion
 * is new.
 */

/**
 * Messages that are expected, with the reason each one is not a defect.
 *
 * Every entry is a specific pattern, never a broad one: `/Vue warn/` would
 * switch the gate off while looking like configuration. If a warning is the
 * app's own, fix the app — an allowlist is for noise from the harness and from
 * libraries whose behaviour is out of reach.
 */
const ALLOWED = [
  // vite-plugin-pwa serves a dev service worker whose sourcemap references
  // files that are not on disk. Logged by Vite, once per browser-tier file,
  // and unrelated to anything under test.
  /Sourcemap for .* points to missing source files/,
] as const

/**
 * Structurally typed rather than as a `MockInstance`: all this needs is the
 * recorded arguments, and spelling the spy's own generics out here means
 * restating them every time vitest's mock types move.
 */
interface RecordedCalls {
  mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> }
}

function unexpected(spy: RecordedCalls): Array<string> {
  return spy.mock.calls
    .map((call) => call.map((argument) => String(argument)).join(' '))
    .filter((message) => !ALLOWED.some((allowed) => allowed.test(message)))
}

export function installConsoleGate(): void {
  let warn: RecordedCalls
  let error: RecordedCalls

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn')
    error = vi.spyOn(console, 'error')
  })

  afterEach(() => {
    // Read before asserting: the first failed expectation throws, and the
    // second spy's calls would never be looked at — a test with both a warning
    // and an error would be fixed twice.
    const warnings = unexpected(warn)
    const errors = unexpected(error)

    expect(errors, 'Unexpected console.error during this test').toEqual([])
    expect(warnings, 'Unexpected console.warn during this test').toEqual([])
  })
}
