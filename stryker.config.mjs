/**
 * Mutation testing — the gate on the unit tier's *assertions*, where the other
 * tiers gate its behavior. See docs/mutation-testing.md for the reasoning
 * behind every choice below.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],

  // The Node tier only. Stryker's runner adopts *every* project in the config
  // it is handed, so pointing this at vitest.config.ts would boot the three
  // Playwright projects once per Stryker worker.
  vitest: { configFile: 'vitest.unit.config.ts' },

  // Required, not optional: the default glob includes `vue`, and Stryker really
  // does mutate SFC script blocks. Every mutant outside the unit tier's reach
  // survives by construction and buries the signal.
  //
  // This list is the functional core plus the two db programs the unit tier
  // drives, and it is no longer kept in step by hand: `CORE` in
  // `eslint.config.ts` is the source of truth, and
  // `src/__tests__/architecture/mutationScope.test.ts` fails when a core
  // module is missing here without a declared reason. A gate with nothing to
  // grade passes hardest, and a new core module would have escaped this one
  // silently.
  //
  // Deliberately NOT here:
  //   - src/db/repositories/** — half the file is the Dexie layer (browser
  //     tier) and half is the in-memory fake; mutating a test double grades
  //     the double, not the product.
  //   - src/db/generateId.ts, src/lib/observability.ts — a crypto.randomUUID
  //     wrapper and a DEV-only gate. Equivalent mutants by construction.
  mutate: [
    'src/db/converters.ts',
    'src/db/backup.ts',
    'src/db/deleteAll.ts',
    'src/features/*/catalog.ts',
    'src/features/*/domain.ts',
    'src/features/*/entry.ts',
    'src/features/*/history.ts',
    'src/features/*/pace.ts',
    'src/features/*/progress.ts',
    'src/features/*/schedule.ts',
    'src/features/*/session.ts',
    'src/features/*/targets.ts',
    'src/features/*/types.ts',
    'src/features/*/week.ts',
    'src/lib/backupFile.ts',
    'src/lib/installPlatform.ts',
  ],

  // Reuse the previous run's verdicts for unchanged code+tests. The report
  // lives in reports/, which is gitignored — CI gets a cold run.
  incremental: true,

  reporters: ['html', 'clear-text', 'progress'],

  // The scope is at 100: every mutant in it is either killed or carries a
  // `// Stryker disable` with a reason. `break` sits at 90 rather than 100
  // because the unit tier is partly property-based — fast-check picks a fresh
  // seed per run, so a mutant that only some inputs distinguish can flicker.
  // Ten points is room for that, not room to delete a test.
  thresholds: { high: 100, low: 90, break: 90 },
}
