/**
 * docs/functional-core.md, in the places ESLint cannot reach.
 *
 * The lint rules in `eslint.config.ts` grade *code*: the shell stays thin, the
 * core stays deterministic. Two things they structurally cannot see:
 *
 * 1. **Whether the layers still exist.** Every rule there is scoped by a path
 *    glob. Rename `src/lib/installPlatform.ts` and the rule that guards it
 *    stops matching anything — silently, and green. The `a11yCoverage` lesson:
 *    a rule with nothing to grade passes hardest.
 *
 * 2. **Whether the split actually paid off.** Bernhardt's claim for functional
 *    core / imperative shell is not "purity is nice" — it is falsifiable:
 *    *the core is testable with no test doubles*. That is a fact about the
 *    test tier, not about the source, so no lint rule can assert it. It is the
 *    reason this file exists, and the assertion below is the whole pattern in
 *    one line.
 *
 * The three layers are defined once, in `eslint.config.ts`, and read from
 * there as text rather than imported: that file belongs to `tsconfig.node`
 * while this one belongs to `tsconfig.vitest`, so an import would not survive
 * `vue-tsc --build`. Reading it also means a layer edited there and not here
 * fails loudly instead of drifting.
 *
 * Deliberately text-level rather than a full parse, like `touchConventions.test.ts`
 * and `primitives.test.ts`, and every helper is exercised against synthetic
 * input as well as the real tree.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const ESLINT_CONFIG = readFileSync(`${ROOT}eslint.config.ts`, 'utf8')
const UNIT_TIER = 'src/__tests__/unit'

// --- reading the layer definitions out of eslint.config.ts ----------------

/**
 * The string literals of one `export const <name> = [...]` array.
 *
 * Scoped to the first `]` after the opening bracket, which is sound because
 * every entry is a flat path string — an array of objects would need a real
 * parser, and if these ever become that, this should fail loudly rather than
 * half-read them.
 */
export function layerGlobs(source: string, name: string): Array<string> {
  const start = source.indexOf(`export const ${name} = [`)
  if (start === -1) return []

  const body = source.slice(start, source.indexOf(']', start))
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

/**
 * Files a layer glob resolves to. Supports a single wildcard path segment,
 * which is all the layer definitions use — `src/features/<name>/domain.ts`.
 * (Spelled with a placeholder rather than the literal glob on purpose: the
 * glob's own `*` followed by `/` would close this comment.)
 */
export function resolveGlob(glob: string, root = ROOT): Array<string> {
  const star = glob.indexOf('*')
  if (star === -1) return existsSync(`${root}${glob}`) ? [glob] : []

  const prefix = glob.slice(0, glob.lastIndexOf('/', star) + 1)
  const suffix = glob.slice(glob.indexOf('/', star) + 1)
  if (!existsSync(`${root}${prefix}`)) return []

  return readdirSync(`${root}${prefix}`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${prefix}${entry.name}/${suffix}`)
    .filter((path) => existsSync(`${root}${path}`))
}

const CORE_GLOBS = layerGlobs(ESLINT_CONFIG, 'CORE')
const EDGE_GLOBS = layerGlobs(ESLINT_CONFIG, 'PLATFORM_EDGE')

const CORE_MODULES = CORE_GLOBS.flatMap((glob) => resolveGlob(glob))
const EDGE_MODULES = EDGE_GLOBS.flatMap((glob) => resolveGlob(glob))

/**
 * Where a module's unit spec lives.
 *
 * The unit tier mirrors the source tree with `features/` elided —
 * `src/features/training/domain.ts` is specced at
 * `unit/training/domain.spec.ts`, not `unit/features/training/…`.
 */
export function unitSpecFor(module: string): string {
  const withoutSrc = module.replace(/^src\//, '').replace(/^features\//, '')
  return `${UNIT_TIER}/${withoutSrc.replace(/\.ts$/, '.spec.ts')}`
}

function unitSpecs(directory = `${ROOT}${UNIT_TIER}/`, prefix = `${UNIT_TIER}/`): Array<string> {
  if (!existsSync(directory)) return []

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return unitSpecs(`${directory}${entry.name}/`, `${prefix}${entry.name}/`)
    return entry.name.endsWith('.spec.ts') ? [`${prefix}${entry.name}`] : []
  })
}

/**
 * Does this spec stand something up in place of a real collaborator?
 *
 * `@effect/vitest`'s `TestClock` is deliberately *not* a double by this
 * definition, and must not be: swapping a service implementation is the seam
 * the core is built around, not a hole punched in one. A program yielding
 * `Clock.currentTimeMillis` is what a testable core looks like — the spec that
 * drives it is doing the opposite of mocking.
 */
export function usesTestDoubles(source: string): boolean {
  return /\bvi\.(?:mock|fn|spyOn|stubGlobal|stubEnv)\b/.test(source)
}

/**
 * Core modules with no unit spec, each with the reason — the `HOVER_ONLY_ALLOWED`
 * idiom. An exemption with no justification is a hole with a comment shape.
 */
const UNTESTED_CORE = {
  'src/lib/utils.ts':
    'cn() is a two-line composition of clsx and tailwind-merge; a spec here would assert what those two packages do, not what we do.',
} satisfies Readonly<Record<string, string>>

// --- the rules ------------------------------------------------------------

describe('the layers still exist', () => {
  it('reads all three layer definitions out of eslint.config.ts', () => {
    // Every assertion below, and every lint rule scoped by these globs, is
    // vacuous if this returns nothing.
    expect(CORE_GLOBS.length).toBeGreaterThan(0)
    expect(EDGE_GLOBS.length).toBeGreaterThan(0)
    expect(layerGlobs(ESLINT_CONFIG, 'REACTIVE_SHELL').length).toBeGreaterThan(0)
  })

  it.each([...CORE_GLOBS, ...EDGE_GLOBS].filter((glob) => !glob.includes('*')))(
    '%s still names a real file',
    (glob) => {
      // Literal entries only. A wildcard entry is allowed to resolve to
      // nothing: the README tells you to delete the example feature, so
      // `src/features/*/domain.ts` legitimately matches zero files in a fresh
      // app — while a renamed *literal* path would turn its rule off silently.
      expect(
        existsSync(`${ROOT}${glob}`),
        `eslint.config.ts scopes a functional-core rule to ${glob}, which no longer exists — the rule now grades nothing. Update the layer definition.`,
      ).toBe(true)
    },
  )

  it('finds core modules to grade', () => {
    expect(CORE_MODULES.length).toBeGreaterThan(0)
  })
})

describe('the core is testable without doubles', () => {
  const specs = unitSpecs()
  const edgeSpecs = new Set(EDGE_MODULES.map(unitSpecFor))

  it('finds unit specs at all', () => {
    expect(specs.length).toBeGreaterThan(0)
  })

  it('only the platform edge reaches for a test double', () => {
    const offenders = specs.filter(
      (spec) => usesTestDoubles(readFileSync(`${ROOT}${spec}`, 'utf8')) && !edgeSpecs.has(spec),
    )

    expect(
      offenders,
      `A spec that needs vi.mock / vi.fn / vi.spyOn / vi.stubGlobal is describing a collaborator it\n` +
        `cannot call for real — which means the code under test is shell, not core. Either move the\n` +
        `decision into a core module and test it on values, or move the module into PLATFORM_EDGE in\n` +
        `eslint.config.ts and say why. docs/functional-core.md:\n${list(offenders)}`,
    ).toEqual([])
  })

  it('has core specs, and they use no doubles', () => {
    // The rule above passes trivially if every unit spec happens to be an edge
    // spec. Name the other side: the core is specced, and specced clean.
    const coreSpecs = CORE_MODULES.map(unitSpecFor).filter((spec) => existsSync(`${ROOT}${spec}`))

    expect(coreSpecs.length).toBeGreaterThan(0)
    for (const spec of coreSpecs) {
      expect(
        usesTestDoubles(readFileSync(`${ROOT}${spec}`, 'utf8')),
        `${spec} mocks something`,
      ).toBe(false)
    }
  })

  it('every core module has a unit spec', () => {
    const missing = CORE_MODULES.filter(
      (module) => !existsSync(`${ROOT}${unitSpecFor(module)}`) && !(module in UNTESTED_CORE),
    ).map((module) => `${module} → ${unitSpecFor(module)}`)

    expect(
      missing,
      `The core is the half that is cheap to test — that is the entire return on putting it there.\n` +
        `A core module with no unit spec is core in name only. Add the spec, or add the module to\n` +
        `UNTESTED_CORE with the reason:\n${list(missing)}`,
    ).toEqual([])
  })

  it('has no stale entries in UNTESTED_CORE', () => {
    const stale = Object.keys(UNTESTED_CORE).filter(
      (module) => !CORE_MODULES.includes(module) || existsSync(`${ROOT}${unitSpecFor(module)}`),
    )

    expect(
      stale,
      `These are no longer untested core — they have a spec now, or are no longer core. Drop them:\n${list(stale)}`,
    ).toEqual([])
  })
})

// --- the checks catch what they claim to catch ----------------------------

describe('the checks reject a tree written the wrong way', () => {
  it('reads a layer definition out of config source', () => {
    const source = `export const CORE = [\n  'src/features/*/domain.ts',\n  'src/lib/utils.ts',\n]\n`
    expect(layerGlobs(source, 'CORE')).toEqual(['src/features/*/domain.ts', 'src/lib/utils.ts'])
  })

  it('returns nothing for a layer that was renamed away', () => {
    expect(layerGlobs(`export const SOMETHING_ELSE = ['a']`, 'CORE')).toEqual([])
  })

  it('does not read past the end of the array', () => {
    const source = `export const CORE = [\n  'src/lib/utils.ts',\n]\nconst OTHER = ['nope']\n`
    expect(layerGlobs(source, 'CORE')).toEqual(['src/lib/utils.ts'])
  })

  it('expands a wildcard segment against the real tree', () => {
    // A shipped glob shape against a directory that actually has one.
    // `src/features/*/domain.ts` is deliberately not the example: it resolves
    // to nothing until the first feature lands, which the rule above already
    // allows.
    expect(resolveGlob('src/components/*/TemplatePageLayout.vue')).toEqual([
      'src/components/templates/TemplatePageLayout.vue',
    ])
  })

  it('resolves a wildcard to nothing when the directory is gone', () => {
    expect(resolveGlob('src/nonexistent/*/domain.ts')).toEqual([])
  })

  it('maps a module to its spec, eliding features/', () => {
    expect(unitSpecFor('src/features/training/domain.ts')).toBe(
      `${UNIT_TIER}/training/domain.spec.ts`,
    )
    expect(unitSpecFor('src/lib/installPlatform.ts')).toBe(
      `${UNIT_TIER}/lib/installPlatform.spec.ts`,
    )
    expect(unitSpecFor('src/db/backup.ts')).toBe(`${UNIT_TIER}/db/backup.spec.ts`)
  })

  it('finds each flavour of test double', () => {
    expect(usesTestDoubles(`const persist = vi.fn()`)).toBe(true)
    expect(usesTestDoubles(`vi.mock('@/db')`)).toBe(true)
    expect(usesTestDoubles(`vi.spyOn(console, 'debug')`)).toBe(true)
    expect(usesTestDoubles(`vi.stubGlobal('fetch', f)`)).toBe(true)
  })

  it('does not read a service implementation as a double', () => {
    // The distinction the whole pattern rests on: swapping the Clock is the
    // seam, not a hole in it.
    expect(
      usesTestDoubles(`it.effect('ages', () => Effect.gen(function* () {
        yield* TestClock.adjust('2 minutes')
        expect(yield* elapsedSince(0)).toEqual({ unit: 'minutes', count: 2 })
      }))`),
    ).toBe(false)
  })
})

function list(items: ReadonlyArray<string>): string {
  return items.map((item) => `  - ${item}`).join('\n')
}
