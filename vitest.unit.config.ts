import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Node `unit` tier: pure logic specs that need no DOM and no browser.
 * Kept as its own config file (rather than only an inline project in
 * vitest.config.ts) so it can run in isolation without paying for the
 * plugin/browser setup the other tiers require — this is what makes it
 * fast enough for the pre-commit hook.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    name: 'unit',
    root: fileURLToPath(new URL('./', import.meta.url)),
    include: ['src/__tests__/unit/**/*.spec.ts'],
    globals: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
})
