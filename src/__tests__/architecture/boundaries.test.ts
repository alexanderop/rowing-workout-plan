/**
 * The negative half of the architecture tier.
 *
 * `architecture.test.ts` asserts the codebase currently obeys the rules —
 * which is exactly the assertion that passes when nothing is being enforced.
 * With a single feature checked in, its feature-isolation loop builds zero
 * rules; and ArchUnitTS never parses .vue files, so a violation written in a
 * `<script setup>` block was invisible to it.
 *
 * These tests come at it from the other side: feed ESLint a file that breaks
 * each boundary and assert it is rejected. ESLint is the layer that covers
 * .vue, so this is also the proof that the SFC hole is closed.
 */
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const RULE = 'no-restricted-imports'

let eslint: ESLint

beforeAll(() => {
  // Not the cached instance the CLI uses: these files never exist on disk.
  eslint = new ESLint({ cwd: new URL('../../../', import.meta.url).pathname })
})

/** Rule ids reported for `code` if it lived at `filePath`. */
async function lint(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((message) => message.ruleId ?? 'fatal')
}

const sfc = (importLine: string) =>
  `<script setup lang="ts">\n${importLine}\n</script>\n\n<template>\n  <div />\n</template>\n`

describe('feature isolation', () => {
  it('rejects a feature importing another feature', async () => {
    const rules = await lint(
      'src/features/notes/atoms.ts',
      `import { thing } from '@/features/other/thing'\nexport const x = thing\n`,
    )
    expect(rules).toContain(RULE)
  })

  it('rejects it from a .vue file too — the case ArchUnitTS cannot see', async () => {
    const rules = await lint(
      'src/features/notes/components/NoteCard.vue',
      sfc(`import { thing } from '@/features/other/thing'\nvoid thing`),
    )
    expect(rules).toContain(RULE)
  })

  it('allows a feature to import itself', async () => {
    const rules = await lint(
      'src/features/notes/components/NoteCard.vue',
      sfc(`import { sortNotes } from '@/features/notes/domain'\nvoid sortNotes`),
    )
    expect(rules).not.toContain(RULE)
  })
})

describe('shared layers', () => {
  it.each([
    [
      'src/components/organisms/OrganismAppShell.vue',
      sfc(`import { x } from '@/features/notes/atoms'\nvoid x`),
    ],
    ['src/composables/useThing.ts', `export { x } from '@/features/notes/atoms'\n`],
    ['src/stores/thing.ts', `export { x } from '@/features/notes/atoms'\n`],
    ['src/lib/thing.ts', `export { x } from '@/features/notes/atoms'\n`],
    ['src/db/thing.ts', `export { x } from '@/features/notes/atoms'\n`],
  ])('rejects %s depending on a feature', async (filePath, code) => {
    expect(await lint(filePath, code)).toContain(RULE)
  })

  it('allows a view to compose a feature', async () => {
    const rules = await lint(
      'src/views/NotesView.vue',
      sfc(`import { x } from '@/features/notes/atoms'\nvoid x`),
    )
    expect(rules).not.toContain(RULE)
  })
})

describe('db encapsulation', () => {
  it.each([
    'src/features/notes/atoms.ts',
    'src/components/organisms/OrganismAppShell.vue',
    'src/composables/useThing.ts',
    'src/stores/thing.ts',
    'src/views/SettingsView.vue',
  ])('rejects %s reaching past @/db', async (filePath) => {
    const importLine = `import { listNotes } from '@/db/repositories/notes'\nvoid listNotes`
    const code = filePath.endsWith('.vue') ? sfc(importLine) : `${importLine}\n`
    expect(await lint(filePath, code)).toContain(RULE)
  })

  it('rejects the schema as well as the repositories', async () => {
    const rules = await lint(
      'src/views/SettingsView.vue',
      sfc(`import { db } from '@/db/schema'\nvoid db`),
    )
    expect(rules).toContain(RULE)
  })

  it('allows the public surface', async () => {
    const rules = await lint('src/features/notes/atoms.ts', `export { listNotes } from '@/db'\n`)
    expect(rules).not.toContain(RULE)
  })

  it('lets the migration spec reach the schema directly', async () => {
    const rules = await lint(
      'src/__tests__/db/migration.spec.ts',
      `export { db } from '@/db/schema'\n`,
    )
    expect(rules).not.toContain(RULE)
  })
})

/**
 * Functional core, imperative shell — the lint half.
 *
 * `functionalCore.test.ts` asserts the layers still exist and that the core
 * needs no test doubles; neither of those can catch a component that quietly
 * grows a decision tree, or a domain module that reads the clock. These do,
 * and — like the boundary rules above — they cover `.vue`, which is where the
 * shell actually lives.
 *
 * Both directions are asserted for every rule. A rule that rejects everything
 * is as useless as one that rejects nothing, and the "allowed" cases here are
 * the ones that would make the rule unlivable if they failed: a guard clause
 * in a component, and a core function that genuinely branches a lot.
 *
 * See docs/functional-core.md for why the thresholds are what they are.
 */
describe('functional core, imperative shell', () => {
  describe('the shell stays thin', () => {
    it('rejects a component that nests a conditional', async () => {
      const rules = await lint(
        'src/views/NotesView.vue',
        sfc(`function pick(a: number, b: number) {
  if (a > 0) {
    if (b > 0) return 'both'
  }
  return 'neither'
}
void pick`),
      )
      expect(rules).toContain('max-depth')
    })

    it('allows a guard clause — one level is how a shell says "not my job"', async () => {
      const rules = await lint(
        'src/views/NotesView.vue',
        sfc(`function pick(a: number) {
  if (a < 0) return 'none'
  return 'some'
}
void pick`),
      )
      expect(rules).not.toContain('max-depth')
      expect(rules).not.toContain('complexity')
    })

    it('rejects a composable that grows a decision tree', async () => {
      const rules = await lint(
        'src/composables/useThing.ts',
        `export function pick(a: number) {
  return a > 1 ? 1 : a > 2 ? 2 : a > 3 ? 3 : a > 4 ? 4 : 5
}`,
      )
      expect(rules).toContain('complexity')
    })

    it('applies to a feature component too, not just views', async () => {
      const rules = await lint(
        'src/features/notes/components/NoteCard.vue',
        sfc(`function pick(a: number, b: number) {
  if (a > 0) {
    if (b > 0) return 'both'
  }
  return 'neither'
}
void pick`),
      )
      expect(rules).toContain('max-depth')
    })
  })

  describe('the core stays deterministic', () => {
    it.each([
      ['Date.now()', `export const at = () => Date.now()`, 'no-restricted-properties'],
      ['Math.random()', `export const r = () => Math.random()`, 'no-restricted-properties'],
      ['new Date()', `export const at = () => new Date()`, 'no-restricted-syntax'],
      [
        'localStorage',
        `export const read = () => localStorage.getItem('x')`,
        'no-restricted-globals',
      ],
      ['navigator', `export const ua = () => navigator.userAgent`, 'no-restricted-globals'],
      ['fetch', `export const get = () => fetch('/x')`, 'no-restricted-globals'],
    ])('rejects %s in a domain module', async (_label, code, rule) => {
      expect(await lint('src/features/notes/domain.ts', code)).toContain(rule)
    })

    it('rejects a core module running its own program', async () => {
      // The core builds programs and hands them up; running one is the shell's
      // job, and a core module that does it takes the runtime choice — and
      // TestClock — away from every caller.
      const rules = await lint(
        'src/features/notes/domain.ts',
        `import { Effect } from 'effect'\nexport const now = () => Effect.runSync(Effect.succeed(1))`,
      )
      expect(rules).toContain('no-restricted-syntax')
    })

    it('lets the core branch as hard as it needs to', async () => {
      // No complexity budget on the core, deliberately: pushing decisions down
      // here is the point of the pattern, so the layer that receives them must
      // not be the layer that punishes them. detectInstallPlatform is already
      // past what the shell is allowed.
      const rules = await lint(
        'src/lib/installPlatform.ts',
        `export function pick(a: number) {
  return a > 1 ? 1 : a > 2 ? 2 : a > 3 ? 3 : a > 4 ? 4 : a > 5 ? 5 : a > 6 ? 6 : 7
}`,
      )
      expect(rules).not.toContain('complexity')
    })

    it('still lets the core take ambient values as parameters', async () => {
      // The escape hatch that makes the ban livable, and the shape
      // detectInstallPlatform already has: name the signal in the signature.
      const rules = await lint(
        'src/lib/installPlatform.ts',
        `export const isIpad = (signals: { userAgent: string }) => signals.userAgent.includes('iPad')`,
      )
      expect(rules).not.toContain('no-restricted-globals')
    })
  })

  describe('the platform edge is exempt from both', () => {
    it('lets the edge nest conditionals', async () => {
      const rules = await lint(
        'src/lib/swUpdateCheck.ts',
        `export function check(a: number, b: number) {
  if (a > 0) {
    if (b > 0) return 'both'
  }
  return 'neither'
}`,
      )
      expect(rules).not.toContain('max-depth')
    })

    it('lets the edge touch the platform — that is what it is for', async () => {
      const rules = await lint(
        'src/lib/persistentStorage.ts',
        `export const persist = () => navigator.storage.persist()`,
      )
      expect(rules).not.toContain('no-restricted-globals')
    })
  })
})

/**
 * The same encapsulation argument as `db`, applied to the primitives: the
 * atoms and the compound directories wrap reka-ui in our own parts, and the
 * rest of the app talks to the wrappers. See docs/ui-components.md.
 */
describe('ui encapsulation', () => {
  it.each([
    'src/views/SettingsView.vue',
    'src/components/organisms/OrganismAppShell.vue',
    'src/features/notes/components/NoteCard.vue',
  ])('rejects %s importing reka-ui directly', async (filePath) => {
    const rules = await lint(filePath, sfc(`import { DialogRoot } from 'reka-ui'\nvoid DialogRoot`))
    expect(rules).toContain(RULE)
  })

  it('rejects cva outside the primitives', async () => {
    const rules = await lint(
      'src/features/notes/components/NoteCard.vue',
      sfc(`import { cva } from 'class-variance-authority'\nvoid cva`),
    )
    expect(rules).toContain(RULE)
  })

  it('rejects reaching past a compound primitive’s barrel', async () => {
    const rules = await lint(
      'src/views/SettingsView.vue',
      sfc(
        `import Content from '@/components/molecules/dialog/MoleculeDialogContent.vue'\nvoid Content`,
      ),
    )
    expect(rules).toContain(RULE)
  })

  it('allows the barrel', async () => {
    const rules = await lint(
      'src/views/SettingsView.vue',
      sfc(
        `import { MoleculeDialogContent } from '@/components/molecules/dialog'\nvoid MoleculeDialogContent`,
      ),
    )
    expect(rules).not.toContain(RULE)
  })

  // An atom has no barrel to reach past: it is one file, imported the way any
  // other component is. docs/atomic-design.md.
  it('allows importing an atom by its file', async () => {
    const rules = await lint(
      'src/views/SettingsView.vue',
      sfc(`import AtomButton from '@/components/atoms/AtomButton.vue'\nvoid AtomButton`),
    )
    expect(rules).not.toContain(RULE)
  })

  it('lets an atom use cva — a flat file is still a primitive', async () => {
    const rules = await lint(
      'src/components/atoms/AtomButton.vue',
      sfc(`import { cva } from 'class-variance-authority'\nvoid cva`),
    )
    expect(rules).not.toContain(RULE)
  })

  it('keeps an atom out of app state', async () => {
    const rules = await lint(
      'src/components/atoms/AtomButton.vue',
      sfc(`import { useToastStore } from '@/stores/toast'\nvoid useToastStore`),
    )
    expect(rules).toContain(RULE)
  })

  it('lets a primitive use reka-ui and cva — that is what the layer is for', async () => {
    const rules = await lint(
      'src/components/molecules/dialog/MoleculeDialogTitle.vue',
      sfc(`import { DialogTitle } from 'reka-ui'\nvoid DialogTitle`),
    )
    expect(rules).not.toContain(RULE)
  })

  it('keeps a primitive out of the data layer', async () => {
    const rules = await lint(
      'src/components/molecules/dialog/MoleculeDialogContent.vue',
      sfc(`import { listNotes } from '@/db'\nvoid listNotes`),
    )
    expect(rules).toContain(RULE)
  })

  it('keeps a primitive out of app state', async () => {
    const rules = await lint(
      'src/components/molecules/dialog/MoleculeDialogContent.vue',
      sfc(`import { useToastStore } from '@/stores/toast'\nvoid useToastStore`),
    )
    expect(rules).toContain(RULE)
  })

  it('still lets a primitive use a composable', async () => {
    const rules = await lint(
      'src/components/molecules/dialog/MoleculeDialogContent.vue',
      sfc(`import { useTouchDevice } from '@/composables/useTouchDevice'\nvoid useTouchDevice`),
    )
    expect(rules).not.toContain(RULE)
  })
})

/**
 * The atomic tiers — the lint half.
 *
 * `atomicDesign.test.ts` walks the real tree and resolves relative imports,
 * which is what catches `../organisms/AppShell.vue` from inside `molecules/`;
 * ESLint matches the specifier, which is what catches the same violation
 * written the way people actually write it, in a .vue file, before a test run.
 * See docs/atomic-design.md.
 */
describe('atomic tiers point one way', () => {
  it.each([
    ['src/components/atoms/AtomButton.vue', '@/components/molecules/dialog'],
    ['src/components/atoms/AtomButton.vue', '@/components/organisms/OrganismAppShell.vue'],
    [
      'src/components/molecules/MoleculePageHeader.vue',
      '@/components/organisms/OrganismAppShell.vue',
    ],
    [
      'src/components/molecules/dialog/MoleculeDialogContent.vue',
      '@/components/templates/TemplatePageLayout.vue',
    ],
    [
      'src/components/organisms/OrganismAppShell.vue',
      '@/components/templates/TemplatePageLayout.vue',
    ],
  ])('rejects %s importing %s', async (filePath, specifier) => {
    const rules = await lint(filePath, sfc(`import X from '${specifier}'\nvoid X`))
    expect(rules).toContain(RULE)
  })

  it.each([
    ['src/components/molecules/MoleculePageHeader.vue', '@/components/atoms/AtomButton.vue'],
    ['src/components/organisms/OrganismPwaInstallDialog.vue', '@/components/molecules/dialog'],
    [
      'src/components/templates/TemplatePageLayout.vue',
      '@/components/molecules/MoleculePageHeader.vue',
    ],
    // Same tier is composition, not a leak — PwaInstallPrompt opens the dialog.
    [
      'src/components/organisms/OrganismPwaInstallPrompt.vue',
      '@/components/organisms/OrganismPwaInstallDialog.vue',
    ],
  ])('allows %s importing %s', async (filePath, specifier) => {
    const rules = await lint(filePath, sfc(`import { X } from '${specifier}'\nvoid X`))
    expect(rules).not.toContain(RULE)
  })

  it('keeps a composite out of the features it is shared by', async () => {
    const rules = await lint(
      'src/components/organisms/OrganismAppShell.vue',
      sfc(`import { notesAtom } from '@/features/notes/atoms'\nvoid notesAtom`),
    )
    expect(rules).toContain(RULE)
  })

  it('still lets a composite read a store — that is what makes it a composite', async () => {
    const rules = await lint(
      'src/components/molecules/MoleculeToastViewport.vue',
      sfc(`import { useToastStore } from '@/stores/toast'\nvoid useToastStore`),
    )
    expect(rules).not.toContain(RULE)
  })
})

/**
 * Composable conventions — the lint half.
 *
 * `composables.test.ts` asserts the scope still matches the tree and that a
 * module-scoped composable brought its reset seam; neither can catch what a
 * composable does *inside* its body. These do.
 *
 * Both directions for every rule, as above. The "allowed" cases are the ones
 * that would make the rules unlivable: the app-lifetime listener useInstallPrompt
 * genuinely needs, and a component using `ref` the way every Vue tutorial does.
 *
 * See docs/composables.md for where these come from.
 */
describe('composable conventions', () => {
  const SYNTAX = 'no-restricted-syntax'
  const RETURN_TYPE = '@typescript-eslint/explicit-module-boundary-types'

  it('rejects a deep ref', async () => {
    const rules = await lint(
      'src/composables/useThing.ts',
      `import { ref } from 'vue'\nexport function useThing() {\n  return ref(0)\n}`,
    )
    expect(rules).toContain(SYNTAX)
  })

  it.each([
    ['shallowRef', `import { shallowRef } from 'vue'\nexport const make = () => shallowRef(0)`],
    ['deepRef', `import { deepRef } from '@vueuse/core'\nexport const make = () => deepRef([])`],
  ])('allows %s — the ban is on the default, not on reactivity', async (_label, code) => {
    expect(await lint('src/composables/useThing.ts', code)).not.toContain(SYNTAX)
  })

  it('rejects a listener registered inside a composable', async () => {
    const rules = await lint(
      'src/composables/useThing.ts',
      `export function useThing(): void {\n  window.addEventListener('resize', () => {})\n}`,
    )
    expect(rules).toContain(SYNTAX)
  })

  it('allows one at module scope — that listener has no caller to outlive', async () => {
    // useInstallPrompt's shape: `beforeinstallprompt` fires once on window,
    // possibly before any component mounts, so the registration cannot wait
    // for one.
    const rules = await lint(
      'src/composables/useThing.ts',
      `window.addEventListener('beforeinstallprompt', (event) => {\n  event.preventDefault()\n})`,
    )
    expect(rules).not.toContain(SYNTAX)
  })

  it('rejects an inferred return type', async () => {
    const rules = await lint(
      'src/composables/useThing.ts',
      `import { shallowRef } from 'vue'\nexport function useThing() {\n  return { open: shallowRef(false) }\n}`,
    )
    expect(rules).toContain(RETURN_TYPE)
  })

  it('applies to a feature-owned composable too', async () => {
    const rules = await lint(
      'src/features/notes/useThing.ts',
      `import { ref } from 'vue'\nexport function useThing() {\n  return ref(0)\n}`,
    )
    expect(rules).toContain(SYNTAX)
    expect(rules).toContain(RETURN_TYPE)
  })

  it('leaves components alone — a caller is not a composable', async () => {
    const rules = await lint(
      'src/views/NotesView.vue',
      sfc(`import { ref } from 'vue'\nconst count = ref(0)\nvoid count`),
    )
    expect(rules).not.toContain(SYNTAX)
  })
})
