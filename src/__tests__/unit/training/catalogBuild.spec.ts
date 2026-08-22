import { describe, expect, it } from '@effect/vitest'

/**
 * The catalogue is built once, at module load, which puts its construction
 * somewhere no ordinary spec can assert about: a module that throws while
 * loading fails the *suite*, and a suite that fails to load reports zero
 * failing tests. `catalog.spec.ts` imports the plans at the top of the file,
 * so if `buildPlan` ever returned nothing, every assertion in it would simply
 * never run — and "no test failed" is indistinguishable from "every test
 * passed" to anything reading the results, `pnpm test:mutation` included.
 *
 * Importing inside the test body moves the load into a test, where a throw is
 * a failure like any other. One file, one import, so nothing above it can
 * fail first.
 */
describe('building the catalogue', () => {
  it('constructs both plans at import time without throwing', async () => {
    const { pete5k, pete5kLite } = await import('@/features/training/catalog')

    expect(pete5k.weeks.flatMap((week) => week.sessions)).toHaveLength(71)
    expect(pete5kLite.weeks.flatMap((week) => week.sessions)).toHaveLength(36)
  })
})
