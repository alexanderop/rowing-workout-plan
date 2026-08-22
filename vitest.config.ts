import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import { VitePWA } from 'vite-plugin-pwa'
import { configDefaults, defineConfig } from 'vitest/config'

// Shared resolve config for path aliases
const resolve = {
  alias: {
    '@': fileURLToPath(new URL('src', import.meta.url)),
  },
}

// Pre-bundle dependencies to avoid Vite reloads during browser tests
const optimizeDependencies = {
  include: ['web-vitals', 'workbox-window'],
}

/**
 * What a *failing* browser action or assertion costs.
 *
 * Without it, Playwright waits forever and the failure is capped by
 * `testTimeout` instead: every red assertion costs 8s locally and 15s in CI,
 * whatever it was actually waiting for. Setting it makes the provider return
 * early, so a failing action stops at this number and a failing
 * `expect.element` falls back to `expect.poll`'s own 1s default. Measured
 * here: a failing assertion 8123ms → 1162ms, a failing action 7985ms →
 * 2099ms, with the green suite unchanged. It buys nothing on a green run; it
 * is the inner debugging loop that gets ~7× cheaper.
 *
 * 2000 is not a universal constant — it is this suite's slowest legitimate
 * wait plus margin, and the ladder that found it is the thing to re-run when
 * a tier starts flaking: temporarily set this to 300, 500, 1000 and note
 * where it goes red. Today that is 300ms → 3 failures (a router push and two
 * install-prompt handoffs), 500ms → green. So the slowest real wait is
 * somewhere in 300–500ms, and 2000 keeps 4–6× headroom for CI hardware that
 * is slower than this laptop.
 */
const ACTION_TIMEOUT = 2000

function browserConfig(name: string) {
  const config = {
    enabled: true,
    provider: playwright({ actionTimeout: ACTION_TIMEOUT }),
    instances: [{ browser: 'chromium' as const, name }],
    headless: true,
    // Substring matching is the default in Vitest 4 and the source of a whole
    // family of tests that pass against a component that never works:
    // `getByText('checked')` matches `unchecked`, `getByRole('option', { name:
    // 'Apple' })` matches *Pineapple*. Exact is Vitest 5's default, so turning
    // it on now is that migration done early, and it means a spec only spells
    // out `{ exact: true }` where it is saying something.
    locators: { exact: true },
  }

  // Traces are a debugging tool, not a suite mode. Playwright records a chunk
  // per test and throws the zip away again when the test passes, so a green
  // run pays for artifacts nobody reads. Measured on a 97-file browser suite:
  // 2.85× wall clock, and it brought its own failures with it — 13–15
  // spurious ones across two runs, plus `tracing.stopChunk: file data stream
  // has unexpected number of bytes`. Turn it on for the one file you are
  // debugging: `VITEST_TRACE=1 pnpm test <file>`, then open the zip under
  // `.vitest/traces` at https://trace.playwright.dev/.
  if (!process.env.VITEST_TRACE) return config

  return { ...config, trace: { mode: 'retain-on-failure' as const, tracesDir: '.vitest/traces' } }
}

// Shared plugins for all browser projects
const plugins = [vue(), tailwindcss(), VitePWA({ devOptions: { enabled: true } })]

// Shared base configuration: component/feature/a11y/visual tests all run in
// Playwright browser mode for real-browser behavior (real CSS, real events,
// real IndexedDB APIs — no jsdom approximations).
const sharedTestConfig = {
  root: fileURLToPath(new URL('./', import.meta.url)),
  exclude: [...configDefaults.exclude, 'test/**'],
  fileParallelism: true,
  // Keep local feedback quick, but let CI report every failure.
  bail: process.env.CI ? 0 : 1,
  // Stricter locally for fast feedback, generous in CI (shared runners are slower).
  testTimeout: process.env.CI ? 15_000 : 8000,
  // A blanket retry hides regressions: a failed assertion fails the same way
  // the second time, so all a retry buys is a slower red. `condition` (4.1)
  // narrows it to the errors that are the browser rather than the app —
  // a lazy chunk that did not arrive, a page torn down mid-run. Locally,
  // where a flake is a thing to look at, there is no retry at all.
  retry: process.env.CI
    ? {
        count: 2,
        delay: 250,
        condition:
          /Failed to fetch dynamically imported module|has been closed|Execution context was destroyed|net::ERR/i,
      }
    : 0,
  slowTestThreshold: 1000,
  includeTaskLocation: true,
  chaiConfig: { truncateThreshold: 999 },
  // Prevent mocks and stubbed platform state leaking into later tests.
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
  // Required for ArchUnitTS custom matchers
  globals: true,
  setupFiles: ['./src/__tests__/setup.ts'],
}

const coverageConfig = {
  provider: 'v8' as const,
  reporter: ['text-summary', 'html', 'lcov'],
  include: ['src/**/*.{ts,vue}'],
  exclude: ['src/**/*.d.ts', 'src/__tests__/**', 'src/components/*/*/**'],
}

export default defineConfig({
  plugins,
  resolve,
  optimizeDeps: optimizeDependencies,
  test: {
    coverage: coverageConfig,

    // Tags (4.1) label a category that cuts across the tiers, and carry the
    // runner options that category needs. They are not a second tiering:
    // anything that follows a directory is already a project, and anything
    // that follows a name is `-t`. Defined once here and inherited by every
    // project; `strictTags` defaults to on, so a typo in a spec is an error
    // rather than a silently untagged test. Keep the list short, and keep
    // `src/__tests__/vitest.d.ts` in step.
    tags: [
      {
        name: 'flaky',
        description: 'Races the browser on purpose — retried on CI rather than deleted.',
        retry: process.env.CI ? { count: 3, delay: 250 } : 0,
        // Lower number wins, so this beats the project-level retry above for
        // the tests that have earned a more generous one.
        priority: 1,
      },
    ],

    // Tiered projects — see docs/testing-strategy.md for which tier a test
    // belongs in and why.
    projects: [
      // Unit: pure Node tier for logic with no DOM/browser dependency.
      './vitest.unit.config.ts',

      // Default: component + feature specs in a real browser.
      {
        plugins,
        resolve,
        optimizeDeps: optimizeDependencies,
        test: {
          ...sharedTestConfig,
          name: 'default',
          include: ['src/__tests__/**/*.spec.ts'],
          exclude: [
            ...sharedTestConfig.exclude,
            'src/__tests__/a11y/**',
            'src/__tests__/touch/**',
            'src/__tests__/visual/**',
            'src/__tests__/unit/**',
          ],
          browser: browserConfig('default-browser'),
        },
      },

      // Touch: the same specs' browser, emulating a phone. This is the only
      // tier where `pointer: coarse` and `hover: none` match — every other
      // browser project launches a stock desktop Chromium, so a control that
      // is only reachable with a mouse looks correct in all of them.
      // `matchMedia` is read-only from inside the page, so the condition has
      // to come from the browser context rather than from a spec.
      {
        plugins,
        resolve,
        optimizeDeps: optimizeDependencies,
        test: {
          ...sharedTestConfig,
          name: 'touch',
          include: ['src/__tests__/touch/**/*.spec.ts'],
          browser: {
            ...browserConfig('touch-browser'),
            // `hasTouch` alone gives the page touch events; `isMobile` is
            // what flips Chromium's primary pointer to coarse. Both, or the
            // tier is a desktop run with a touch API bolted on.
            // Rebuilt rather than spread, because a provider is a function
            // call: naming `provider` here replaces the one `browserConfig`
            // returned, options and all.
            provider: playwright({
              actionTimeout: ACTION_TIMEOUT,
              contextOptions: { hasTouch: true, isMobile: true },
            }),
          },
        },
      },

      // Accessibility: axe-core sweeps over rendered screens.
      {
        plugins,
        resolve,
        optimizeDeps: optimizeDependencies,
        test: {
          ...sharedTestConfig,
          name: 'a11y',
          include: ['src/__tests__/a11y/**/*.spec.ts'],
          browser: browserConfig('a11y-browser'),
        },
      },

      // Visual regression: screenshot comparisons (see the --update flow in
      // docs/testing-strategy.md).
      {
        plugins,
        resolve,
        optimizeDeps: optimizeDependencies,
        test: {
          ...sharedTestConfig,
          name: 'visual',
          include: ['src/__tests__/visual/**/*.spec.ts'],
          browser: {
            ...browserConfig('visual-browser'),
            expect: {
              toMatchScreenshot: {
                comparatorOptions: {
                  threshold: 0.2,
                  allowedMismatchedPixelRatio: 0.02,
                },
              },
            },
          },
        },
      },

      // Lint rules: the vendored oxlint plugin in tools/oxlint/. Runs in Node
      // and colocates its specs with the rules, unlike every tier above —
      // that is the price of keeping the tree a drop-in copy of upstream
      // anti-slop, so a rule and its RuleTester cases stay diffable against
      // it. See docs/oxlint-rules.md.
      {
        test: {
          name: 'lint-rules',
          globals: true,
          include: ['tools/oxlint/**/*.test.ts'],
        },
      },

      // Architecture: ArchUnitTS rules, runs in Node for filesystem analysis.
      {
        resolve,
        test: {
          name: 'arch',
          globals: true,
          restoreMocks: true,
          unstubEnvs: true,
          unstubGlobals: true,
          include: ['src/__tests__/architecture/**/*.test.ts'],
          // Each file parses the whole TypeScript project; running them
          // concurrently starves every worker on small CI runners.
          fileParallelism: false,
          testTimeout: 60_000,
        },
      },
    ],
  },
})
