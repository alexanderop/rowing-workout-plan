import { describe, expect, it } from '@effect/vitest'

/**
 * The catalogue is built once, at module load, which puts its construction
 * somewhere no ordinary spec can assert about: a module that throws while
 * loading fails the *suite*, and a suite that fails to load reports zero
 * failing tests. `catalog.spec.ts` imports the plans at the top of the file,
 * so if the build ever returned nothing, every assertion in it would simply
 * never run — and "no test failed" is indistinguishable from "every test
 * passed" to anything reading the results, `pnpm test:mutation` included.
 *
 * Importing inside the test body moves the load into a test, where a throw is
 * a failure like any other. One file, one import, so nothing above it can
 * fail first.
 */
describe('building the catalogue', () => {
  it('constructs every plan at import time without throwing', async () => {
    // Iterating `PLANS` rather than naming the plans: a third one is covered
    // the moment it is registered, and the counts that would go here are the
    // pins each plan already carries in its own spec.
    const { PLANS } = await import('@/features/training/catalog')

    expect(PLANS.length).toBeGreaterThan(0)

    for (const plan of PLANS) {
      expect(plan.weeks.length, plan.id).toBeGreaterThan(0)
      expect(plan.weeks.flatMap((week) => week.sessions).length, plan.id).toBeGreaterThan(0)
    }
  })
})
