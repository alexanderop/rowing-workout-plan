/**
 * Architecture tests using ArchUnitTS. These are the codified versions of
 * the conventions in docs/index.md:
 *
 * 1. No circular dependencies inside any layer.
 * 2. Features never import from other features.
 * 3. Shared layers (components, composables, stores, db, lib, types) never
 *    depend on features or views.
 * 4. The database is only reached through its public surface (src/db/index)
 *    — nobody imports the repositories directly.
 *
 * Note: ArchUnitTS analyzes TypeScript imports. <script setup> blocks in
 * .vue files are not parsed, so keep feature logic in .ts modules (where it
 * belongs anyway — that is what makes it unit-testable).
 *
 * That blind spot, and the fact that these rules all assert the *absence* of
 * a violation, is why boundaries.test.ts exists next to this file: it feeds
 * ESLint deliberate violations — .vue included — and asserts they are caught.
 * Read the two together; neither is sufficient alone.
 */
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { projectFiles } from 'archunit'
import { describe, expect, it } from 'vitest'

// `src/features/` is absent, not empty, while the app has no features: the
// notes worked example was the only one and git does not track a bare
// directory. Reading it unguarded would throw at import and take every rule
// in this file down with it.
const FEATURES_DIR = fileURLToPath(new URL('../../features/', import.meta.url))

const FEATURES = existsSync(FEATURES_DIR)
  ? readdirSync(FEATURES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : []

const SHARED_FOLDERS = ['components', 'composables', 'stores', 'db', 'lib', 'types'] as const

// `dependOnFiles().inFolder(x)` fails when *x* matches nothing, so a rule
// about a directory that is not there yet reports as a violation rather than
// as vacuous. Both of these are true between removing the notes worked
// example and adding the first training feature and repository, and skipping
// is the honest reading: there is nothing to hold to the rule, and the rule
// comes back with the code it guards. `boundaries.test.ts` still proves
// ESLint rejects both imports, from a .vue file included.
const REPOSITORIES_DIR = fileURLToPath(new URL('../../db/repositories/', import.meta.url))

const describeWithFeatures = FEATURES.length > 0 ? describe : describe.skip
const describeWithRepositories = existsSync(REPOSITORIES_DIR) ? describe : describe.skip

describe('circular dependencies', () => {
  for (const folder of ['features', 'components', 'composables', 'stores', 'db'] as const) {
    it(`${folder} should be free of cycles`, async () => {
      const rule = projectFiles().inFolder(`src/${folder}/**`).should().haveNoCycles()
      await expect(rule).toPassAsync()
    })
  }
})

describeWithFeatures('feature isolation', () => {
  for (const feature of FEATURES) {
    it(`${feature} should not depend on other features`, async () => {
      const otherFeatures = FEATURES.filter((other) => other !== feature)

      for (const otherFeature of otherFeatures) {
        const rule = projectFiles()
          .inFolder(`src/features/${feature}/**`)
          .shouldNot()
          .dependOnFiles()
          .inFolder(`src/features/${otherFeature}/**`)
        await expect(rule).toPassAsync()
      }
    })
  }
})

describeWithFeatures('layer dependencies', () => {
  // No "should not depend on views" rules here: views are pure .vue files,
  // which ArchUnitTS does not parse, so those rules would match zero files
  // and fail as empty. The import direction into views is enforced by the
  // feature/shared rules above covering everything views could re-export.
  for (const folder of SHARED_FOLDERS) {
    it(`${folder} should not depend on features`, async () => {
      const rule = projectFiles()
        .inFolder(`src/${folder}/**`)
        .shouldNot()
        .dependOnFiles()
        .inFolder('src/features/**')
      await expect(rule).toPassAsync()
    })
  }
})

describeWithRepositories('db encapsulation', () => {
  for (const folder of ['features', 'components', 'composables', 'stores'] as const) {
    it(`${folder} should not import db repositories directly`, async () => {
      const rule = projectFiles()
        .inFolder(`src/${folder}/**`)
        .shouldNot()
        .dependOnFiles()
        .inFolder('src/db/repositories/**')
      await expect(rule).toPassAsync()
    })
  }
})
