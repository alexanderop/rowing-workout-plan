/**
 * The tiers, and the one direction imports may run between them.
 *
 * `src/components/` is organised by atomic design: `atoms/`, `molecules/`,
 * `organisms/`, `templates/`, with the views above them as the pages. A
 * directory inside a tier is a compound primitive (a barrel plus its parts);
 * every atom, and a flat `.vue` above them, is one file. `primitives.test.ts`
 * grades the primitive side of that. Full reasoning: docs/atomic-design.md.
 *
 * Enforced twice, like the other boundaries. `eslint.config.ts` builds a
 * `no-restricted-imports` scope per tier out of the same `TIERS` array read
 * below, which covers `.vue` files and is what a developer sees first. Two
 * things it cannot see are here:
 *
 * 1. **Placement.** A component dropped straight into `src/components/` sits
 *    outside every scope, so no rule applies to it at all — the failure mode
 *    of a lint-only boundary is silence.
 * 2. **The relative spelling.** ESLint matches the import *specifier*, so
 *    `@/components/organisms/OrganismAppShell.vue` is caught and
 *    `../organisms/OrganismAppShell.vue`
 *    from inside `molecules/` is not: it has no `components/` segment to match
 *    against. Resolving the path first is what closes that.
 *
 * Text-level rather than a full parse, like `primitives.test.ts` and
 * `touchConventions.test.ts`, and every helper is exercised against a
 * synthetic violation as well as the real tree.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TIERS } from '../../../eslint.config'

type Tier = (typeof TIERS)[number]

const COMPONENTS_DIR = fileURLToPath(new URL('../../components/', import.meta.url))

// SAFETY: `TIERS` is a tuple of string literals, so widening it to
// `readonly string[]` only forgets which literals it holds — which is exactly
// what `includes` needs in order to accept an arbitrary directory name. The
// narrowing back to `Tier` is the runtime check's own result.
const isTier = (name: string): name is Tier => (TIERS as readonly string[]).includes(name)

interface Component {
  /** Path relative to `src/components/`, e.g. `atoms/AtomButton.vue`. */
  id: string
  source: string
}

/** Every source file under `src/components/`, however deeply nested. */
function componentFiles(directory = COMPONENTS_DIR, prefix = ''): Component[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const id = `${prefix}${entry.name}`
    if (entry.isDirectory()) return componentFiles(join(directory, entry.name), `${id}/`)
    if (!/\.(?:vue|ts)$/.test(entry.name)) return []
    return [{ id, source: readFileSync(join(directory, entry.name), 'utf8') }]
  })
}

const COMPONENTS = componentFiles()

// --- text helpers, exercised against synthetic input further down ----------

/** The tier a path under `src/components/` belongs to, if it is in one. */
export function tierOf(id: string): Tier | undefined {
  const [head] = id.split('/')
  return head !== undefined && isTier(head) ? head : undefined
}

/** Every module specifier the source imports, static and dynamic alike. */
export function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/\bfrom\s*'([^']+)'|\bimport\s*\(\s*'([^']+)'/g)].map(
    (match) => match[1] ?? match[2] ?? '',
  )
}

/**
 * Which tier a specifier points into, resolving `@/components/…` and the
 * relative spelling of the same import to the same answer. Anything outside
 * `src/components/` — a composable, a store, a feature — is not a tier and
 * this rule has nothing to say about it.
 */
export function targetTier(specifier: string, fromDirectory: string): Tier | undefined {
  const alias = /^@\/components\/(.*)$/.exec(specifier)
  const path = alias?.[1] ?? (specifier.startsWith('.') ? posix.join(fromDirectory, specifier) : '')
  return path.startsWith('..') ? undefined : tierOf(path)
}

/**
 * The prefix a component in `tier` must carry: `atoms` → `Atom`. Singular,
 * because it prefixes one component rather than naming the directory.
 */
export function prefixFor(tier: Tier): string {
  return `${tier.charAt(0).toUpperCase()}${tier.slice(1, -1)}`
}

/** The tiers `id` imports that sit above `id`'s own. Empty is the pass. */
export function reachesUp(component: Component): Tier[] {
  const own = tierOf(component.id)
  if (own === undefined) return []

  const fromDirectory = posix.dirname(component.id)
  return importSpecifiers(component.source)
    .map((specifier) => targetTier(specifier, fromDirectory))
    .filter((tier): tier is Tier => tier !== undefined && TIERS.indexOf(tier) > TIERS.indexOf(own))
}

// --- the rules ------------------------------------------------------------

describe('every shared component is filed under a tier', () => {
  it('finds components to check at all', () => {
    expect(COMPONENTS.length).toBeGreaterThan(0)
  })

  it('has no directory under src/components that is not a tier', () => {
    const strays = readdirSync(COMPONENTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !isTier(entry.name))
      .map((entry) => entry.name)

    expect(
      strays,
      `src/components/ holds one directory per atomic tier (${TIERS.join(', ')}). ${strays.join(', ')} is none of them — file the components inside it under the tier they belong to. docs/atomic-design.md`,
    ).toEqual([])
  })

  it.each(COMPONENTS.map((component) => component.id))('%s sits in a tier', (id) => {
    expect(
      tierOf(id),
      `${id} is loose in src/components/. Nothing is scoped to it, so no boundary rule applies to it — put it in atoms, molecules, organisms or templates. docs/atomic-design.md`,
    ).toBeDefined()
  })
})

describe('a component is named for its tier', () => {
  it.each(COMPONENTS.filter((component) => component.id.endsWith('.vue')).map(({ id }) => id))(
    '%s carries its tier prefix',
    (id) => {
      const tier = tierOf(id)
      if (tier === undefined) return

      const prefix = prefixFor(tier)
      expect(
        posix.basename(id).startsWith(prefix),
        `${id} should be named ${prefix}${posix.basename(id)}. The import path says which tier a component is in; the *name* is what a reader sees at the call site, in a template where no path appears. docs/atomic-design.md`,
      ).toBe(true)
    },
  )
})

describe('the tiers point one way', () => {
  it.each(COMPONENTS.map((component) => [component.id, component] as const))(
    '%s imports nothing above its own tier',
    (_id, component) => {
      const above = reachesUp(component)
      expect(
        above,
        `${component.id} imports ${above.join(', ')}, which sits above its own tier. A lower tier that knows about a higher one can only be used where that higher one exists. Move the shared part down, or move this component up. docs/atomic-design.md`,
      ).toEqual([])
    },
  )
})

// --- the rules catch what they claim to catch -----------------------------

describe('the checks reject a tree written the wrong way', () => {
  it('reads both the alias and the relative spelling of the same import', () => {
    expect(targetTier('@/components/organisms/OrganismAppShell.vue', 'molecules')).toBe('organisms')
    expect(targetTier('../organisms/OrganismAppShell.vue', 'molecules')).toBe('organisms')
    expect(targetTier('./MoleculePageHeader.vue', 'molecules')).toBe('molecules')
    expect(targetTier('../../organisms/OrganismAppShell.vue', 'molecules/dialog')).toBe('organisms')
  })

  it('has nothing to say about an import that leaves src/components', () => {
    expect(targetTier('@/stores/toast', 'molecules')).toBeUndefined()
    expect(targetTier('vue', 'molecules')).toBeUndefined()
    expect(targetTier('../../stores/toast', 'molecules')).toBeUndefined()
  })

  it('finds a dynamic import as well as a static one', () => {
    const source = `
import AtomButton from '@/components/atoms/AtomButton.vue'
const Dialog = defineAsyncComponent(() => import('@/components/organisms/OrganismPwaInstallDialog.vue'))
`
    expect(importSpecifiers(source)).toEqual([
      '@/components/atoms/AtomButton.vue',
      '@/components/organisms/OrganismPwaInstallDialog.vue',
    ])
  })

  it('derives the prefix from the tier, singular', () => {
    expect(TIERS.map(prefixFor)).toEqual(['Atom', 'Molecule', 'Organism', 'Template'])
  })

  it('rejects an atom that reaches for an organism', () => {
    const violation = {
      id: 'atoms/AtomButton.vue',
      source: `import OrganismAppShell from '@/components/organisms/OrganismAppShell.vue'`,
    }
    expect(reachesUp(violation)).toEqual(['organisms'])
  })

  it('accepts a same-tier import — that is composition, not a leak', () => {
    const sibling = {
      id: 'organisms/OrganismPwaInstallPrompt.vue',
      source: `import OrganismPwaInstallDialog from './OrganismPwaInstallDialog.vue'`,
    }
    expect(reachesUp(sibling)).toEqual([])
  })

  it('accepts a template composing everything below it', () => {
    const template = {
      id: 'templates/TemplatePageLayout.vue',
      source: `import MoleculePageHeader from '@/components/molecules/MoleculePageHeader.vue'`,
    }
    expect(reachesUp(template)).toEqual([])
  })
})
