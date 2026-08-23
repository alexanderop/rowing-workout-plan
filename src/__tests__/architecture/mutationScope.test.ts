/**
 * The mutation scope still covers the functional core.
 *
 * `stryker.config.mjs`'s `mutate` list is a hand-written copy of `CORE` from
 * `eslint.config.ts`, plus the two db programs the unit tier drives. Two lists
 * of the same thing drift, and this one drifts *quietly*: a core module left
 * out is not an error, it is simply never mutated, and the run stays at 100%
 * because the mutants that would have survived were never generated. The
 * `a11yCoverage` lesson again — a gate with nothing to grade passes hardest.
 * `week.ts` was exactly this: added to `CORE`, specced in the unit tier, and
 * invisible to `pnpm test:mutation` until this file existed.
 *
 * Read as text rather than imported, for the reason `functionalCore.test.ts`
 * gives: `eslint.config.ts` belongs to `tsconfig.node` and this file to
 * `tsconfig.vitest`, so an import would not survive `vue-tsc --build`.
 * `stryker.config.mjs` is read the same way, so the two are compared as the
 * strings a human edits.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { layerGlobs } from './functionalCore.test'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const ESLINT_CONFIG = readFileSync(`${ROOT}eslint.config.ts`, 'utf8')
const STRYKER_CONFIG = readFileSync(`${ROOT}stryker.config.mjs`, 'utf8')

/**
 * The quoted entries of `stryker.config.mjs`'s `mutate` array.
 *
 * Same shape and same caveat as `layerGlobs`: scoped to the first `]` after
 * the opening bracket, which holds because every entry is a flat path string.
 */
export function mutateGlobs(source: string): Array<string> {
  const start = source.indexOf('mutate: [')
  if (start === -1) return []

  const body = source.slice(start, source.indexOf(']', start))
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

/**
 * Core modules deliberately outside the mutation scope, each with the reason —
 * the `UNTESTED_CORE` idiom. An exemption with no justification is a hole with
 * a comment shape.
 */
const UNMUTATED_CORE = {
  'src/lib/utils.ts':
    'cn() has no unit spec at all (see UNTESTED_CORE in functionalCore.test.ts), so every mutant in it would survive by construction and bury the signal.',
} satisfies Readonly<Record<string, string>>

const CORE_GLOBS = layerGlobs(ESLINT_CONFIG, 'CORE')
const MUTATE_GLOBS = mutateGlobs(STRYKER_CONFIG)

describe('the mutation scope', () => {
  it('reads both lists at all', () => {
    // Every assertion below is vacuous if either read comes back empty.
    expect(CORE_GLOBS.length).toBeGreaterThan(0)
    expect(MUTATE_GLOBS.length).toBeGreaterThan(0)
  })

  it.each(CORE_GLOBS.filter((glob) => !(glob in UNMUTATED_CORE)))(
    '%s is graded by pnpm test:mutation',
    (glob) => {
      expect(MUTATE_GLOBS).toContain(glob)
    },
  )

  it('has a reason for every core module it leaves out', () => {
    const undeclared = CORE_GLOBS.filter(
      (glob) => !MUTATE_GLOBS.includes(glob) && !(glob in UNMUTATED_CORE),
    )

    expect(undeclared, 'Add it to stryker.config.mjs, or to UNMUTATED_CORE with why').toEqual([])
  })

  it('does not carry an exemption for a module that is now graded', () => {
    // The other direction: an exemption left behind after the module was
    // added to the scope reads as a hole that is no longer there.
    const stale = Object.keys(UNMUTATED_CORE).filter((glob) => MUTATE_GLOBS.includes(glob))

    expect(stale, 'Remove it from UNMUTATED_CORE — it is in the scope now').toEqual([])
  })

  it('does not carry an exemption for a module that is no longer core', () => {
    const orphaned = Object.keys(UNMUTATED_CORE).filter((glob) => !CORE_GLOBS.includes(glob))

    expect(orphaned, 'Remove it from UNMUTATED_CORE — it is not in CORE any more').toEqual([])
  })
})

describe('the check rejects a config written the wrong way', () => {
  it('reads the entries out of a mutate array', () => {
    expect(mutateGlobs("mutate: [\n  'src/a.ts',\n  'src/b.ts',\n],")).toEqual([
      'src/a.ts',
      'src/b.ts',
    ])
  })

  it('returns nothing when the key was renamed away', () => {
    expect(mutateGlobs("mutated: ['src/a.ts']")).toEqual([])
  })
})
