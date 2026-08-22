/**
 * docs/composables.md, in the places ESLint cannot reach.
 *
 * The `app/composables` block in `eslint.config.ts` grades *code*: the return
 * type is declared, `ref` gives way to `shallowRef`, a listener registered
 * inside a composable goes through `useEventListener`. Three things it
 * structurally cannot see:
 *
 * 1. **Whether the scope still matches anything.** Every rule there hangs off
 *    the `COMPOSABLES` globs. Move `src/composables/` and the rules stop
 *    grading — silently, and green. Same lesson as `functionalCore.test.ts`:
 *    a rule with nothing to grade passes hardest.
 *
 * 2. **Whether a composable is inside the scope at all.** A `useThing.ts`
 *    dropped in `src/lib/` or beside a component is a composable by every
 *    measure except the one the config uses, and no rule scoped by path can
 *    report a file it was never handed.
 *
 * 3. **Whether a module-scoped composable brought its escape hatch.** State
 *    that outlives a component needs a `reset…State()` for the test tier,
 *    because `localStorage.clear()` fires no storage event in the document
 *    that called it. That is a fact about two files agreeing — the composable
 *    and `helpers/reset.ts` — which is not a shape lint can match.
 *
 * The globs are defined once, in `eslint.config.ts`, and read from here as
 * text rather than imported: that file belongs to `tsconfig.node` while this
 * one belongs to `tsconfig.vitest`, so an import would not survive
 * `vue-tsc --build`. Deliberately text-level rather than a full parse, like
 * `functionalCore.test.ts`, `touchConventions.test.ts` and
 * `primitives.test.ts` — and every helper is exercised against synthetic
 * input as well as the real tree.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const ESLINT_CONFIG = readFileSync(`${ROOT}eslint.config.ts`, 'utf8')

// --- reading the scope out of eslint.config.ts ----------------------------

/** The string literals of `export const COMPOSABLES = [...]`. */
export function composableGlobs(source: string): Array<string> {
  const start = source.indexOf('export const COMPOSABLES = [')
  if (start === -1) return []

  const body = source.slice(start, source.indexOf(']', start))
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

/** Matches one path segment against one `*` wildcard — `use*.ts`, `*.ts`, `*`. */
function segmentMatcher(segment: string): (name: string) => boolean {
  const [prefix, suffix] = segment.split('*')
  return (name) =>
    name.length >= prefix.length + suffix.length && name.startsWith(prefix) && name.endsWith(suffix)
}

function walk(segments: ReadonlyArray<string>, prefix: string, root: string): Array<string> {
  const [head, ...rest] = segments
  if (head === undefined) return []

  if (!head.includes('*')) {
    const path = `${prefix}${head}`
    if (rest.length > 0) return walk(rest, `${path}/`, root)
    return existsSync(`${root}${path}`) ? [path] : []
  }

  if (!existsSync(`${root}${prefix}`)) return []
  const matches = segmentMatcher(head)

  return readdirSync(`${root}${prefix}`, { withFileTypes: true }).flatMap((entry) => {
    if (!matches(entry.name)) return []
    const path = `${prefix}${entry.name}`
    if (rest.length > 0) return entry.isDirectory() ? walk(rest, `${path}/`, root) : []
    return entry.isFile() ? [path] : []
  })
}

/**
 * Files a glob resolves to. One `*` per segment, in any segment — which
 * covers both shapes the scope uses, `src/composables/*.ts` and
 * `src/features/<dir>/use*.ts`, and resolves anything else to nothing rather
 * than half-matching it.
 */
export function resolveGlob(glob: string, root = ROOT): Array<string> {
  return walk(glob.split('/'), '', root)
}

const GLOBS = composableGlobs(ESLINT_CONFIG)
const COMPOSABLES = GLOBS.flatMap((glob) => resolveGlob(glob))

// --- the checks -----------------------------------------------------------

/** `src/composables/useTheme.ts` → `useTheme`. */
function composableName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.ts'.length)
}

/**
 * Does `export function <name>` declare a `void` return?
 *
 * Deliberately not a return-type parser: the only question is whether the
 * annotation ESLint already forces is `void`, and walking the parameter list
 * to its closing paren is enough to ask it without being fooled by a `{}`
 * inside a parameter type — `useReportFailure` has exactly that.
 */
export function returnsVoid(source: string, name: string): boolean {
  const start = source.indexOf(`export function ${name}(`)
  if (start === -1) return false

  let depth = 0
  let index = source.indexOf('(', start)
  for (; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1
    else if (source[index] === ')' && --depth === 0) break
  }

  return /^\s*:\s*void\b/.test(source.slice(index + 1))
}

/**
 * Lines that park reactive state at module scope — the thing that survives an
 * unmount and so has to be resettable.
 *
 * Anchored at column 0, because that is what "module scope" looks like in a
 * formatted file, and a binding named `use…` is exempt: a module-scoped
 * `const useAgeTicker = createSharedComposable(…)` is a composable, and it
 * disposes itself when its last subscriber goes away.
 */
export function holdsModuleState(source: string): boolean {
  return /^(?:const|let) +(?!use[A-Z])(?:\{[^}]*\}|\w)[^=\n]*=[^\n]*\b(?:ref|shallowRef|deepRef|computed|use[A-Z]\w*)\(/m.test(
    source,
  )
}

const RESET_SEAM = /export function reset\w*State\(/

// --- the rules ------------------------------------------------------------

describe('the scope still matches the tree', () => {
  it('reads the composable globs out of eslint.config.ts', () => {
    // Every rule in the `app/composables` block, and every assertion below,
    // is vacuous if this returns nothing.
    expect(GLOBS.length).toBeGreaterThan(0)
  })

  it('finds composables to grade', () => {
    expect(COMPOSABLES.length).toBeGreaterThan(0)
  })

  it('resolves the shared home and the feature-owned one', () => {
    // Named individually so deleting one glob's tree cannot be hidden by the
    // other still matching. The example feature is deletable, so its glob is
    // allowed to resolve to nothing — the shared directory is not.
    expect(COMPOSABLES.some((path) => path.startsWith('src/composables/'))).toBe(true)
    expect(GLOBS).toContain('src/features/*/use*.ts')
  })

  it('has every composable in the tree inside the scope', () => {
    const stray = sourceFiles(`${ROOT}src/`, 'src/').filter(
      (path) => /\/use[A-Z]\w*\.ts$/.test(path) && !COMPOSABLES.includes(path),
    )

    expect(
      stray,
      `A composable outside the COMPOSABLES globs is a composable no rule grades — it can return\n` +
        `an inferred shape, deep-proxy a DOM node, and leak a listener, all green. Move it to\n` +
        `src/composables/ (shared) or src/features/<name>/ (feature-owned), or widen the globs in\n` +
        `eslint.config.ts. docs/composables.md:\n${list(stray)}`,
    ).toEqual([])
  })
})

describe('each composable is one named, callable thing', () => {
  it.each(COMPOSABLES)('%s exports the composable it is named after', (path) => {
    const name = composableName(path)
    expect(
      readFileSync(`${ROOT}${path}`, 'utf8'),
      `${path} should export \`${name}\` — one composable per file, named after it, so an import\n` +
        `site and a stack frame agree with the filename. docs/composables.md`,
    ).toContain(`export function ${name}(`)
  })

  it.each(COMPOSABLES)('%s hands its state back', (path) => {
    const name = composableName(path)
    expect(
      returnsVoid(readFileSync(`${ROOT}${path}`, 'utf8'), name),
      `${name} returns void, so the only way to observe it is through whatever it touched on the\n` +
        `way past — the DOM, a global, a store. Return the state it computes and let the caller\n` +
        `ignore it; that is the difference between a composable and a side effect with a \`use\`\n` +
        `prefix. useKeyboardInset is the worked example. docs/composables.md`,
    ).toBe(false)
  })
})

describe('module-scoped state carries its reset seam', () => {
  const moduleScoped = COMPOSABLES.filter((path) =>
    holdsModuleState(readFileSync(`${ROOT}${path}`, 'utf8')),
  )

  it('finds the singletons', () => {
    // The app has several by design — one theme, one locale, one service
    // worker. If this ever hits zero the rule below is grading nothing.
    expect(moduleScoped.length).toBeGreaterThan(0)
  })

  it('every one of them exports a reset', () => {
    const missing = moduleScoped.filter(
      (path) => !RESET_SEAM.test(readFileSync(`${ROOT}${path}`, 'utf8')),
    )

    expect(
      missing,
      `State at module scope outlives every component that reads it, and \`localStorage.clear()\`\n` +
        `fires no storage event in the document that called it — so a test tier cannot put these\n` +
        `back on its own. Export a \`reset…State()\` and call it from src/__tests__/helpers/reset.ts,\n` +
        `the way useTheme and useLocale do. docs/composables.md:\n${list(missing)}`,
    ).toEqual([])
  })

  it('wires each reset into the shared helper', () => {
    // The export is half of it: a seam nothing calls resets nothing.
    const helper = readFileSync(`${ROOT}src/__tests__/helpers/reset.ts`, 'utf8')
    const unwired = moduleScoped.filter((path) => !helper.includes(composableName(path)))

    expect(
      unwired,
      `These export a reset that resetAppState never calls, so the state still leaks between\n` +
        `tests. Import it in src/__tests__/helpers/reset.ts:\n${list(unwired)}`,
    ).toEqual([])
  })
})

// --- the checks catch what they claim to catch ----------------------------

describe('the checks reject a tree written the wrong way', () => {
  it('reads the globs out of config source', () => {
    const source = `export const COMPOSABLES = [\n  'src/composables/*.ts',\n  'src/features/*/use*.ts',\n]\n`
    expect(composableGlobs(source)).toEqual(['src/composables/*.ts', 'src/features/*/use*.ts'])
  })

  it('returns nothing when the scope was renamed away', () => {
    expect(composableGlobs(`export const SOMETHING_ELSE = ['a']`)).toEqual([])
  })

  it('expands both glob shapes against the real tree', () => {
    expect(resolveGlob('src/composables/*.ts')).toContain('src/composables/useTheme.ts')
    expect(resolveGlob('src/features/*/use*.ts')).toContain('src/features/notes/useNoteAge.ts')
  })

  it('resolves to nothing when the directory is gone', () => {
    expect(resolveGlob('src/nonexistent/*.ts')).toEqual([])
    expect(resolveGlob('src/nonexistent/*/use*.ts')).toEqual([])
  })

  it('spots a void composable, single-line and wrapped', () => {
    expect(returnsVoid(`export function useThing(): void {}`, 'useThing')).toBe(true)
    expect(returnsVoid(`export function useThing(\n  a: string,\n): void {}`, 'useThing')).toBe(
      true,
    )
  })

  it('does not read a returned function type as void', () => {
    // useReportFailure's shape: a `{}` inside a parameter type, and `void`
    // buried in the returned Effect. Neither is the annotation being asked about.
    const source = `export function useReportFailure(\n  boundary: string,\n): (e: { readonly _tag: string }) => Effect.Effect<void> {\n  return null!\n}`
    expect(returnsVoid(source, 'useReportFailure')).toBe(false)
  })

  it('finds each flavour of module-scoped state', () => {
    expect(holdsModuleState(`const open = shallowRef(false)\n`)).toBe(true)
    expect(holdsModuleState(`const dismissed = useStorage('k', false)\n`)).toBe(true)
    expect(holdsModuleState(`const { needRefresh } = useRegisterSW({ immediate: true })\n`)).toBe(
      true,
    )
    expect(holdsModuleState(`let count = computed(() => 1)\n`)).toBe(true)
    expect(holdsModuleState(`const eager: Ref<number> = deepRef(0)\n`)).toBe(true)
  })

  it('does not read a constant or a local as module state', () => {
    expect(holdsModuleState(`const HINT_DELAY_MS = 2000\n`)).toBe(false)
    expect(holdsModuleState(`const KEY = 'vueuse-color-scheme'\n`)).toBe(false)
    expect(holdsModuleState(`let timer: ReturnType<typeof setTimeout>\n`)).toBe(false)
    // Indented, so it belongs to whatever function encloses it.
    expect(holdsModuleState(`function useThing() {\n  const open = shallowRef(false)\n}\n`)).toBe(
      false,
    )
  })

  it('does not read a shared composable as state', () => {
    // It owns an effect, not a value, and `createSharedComposable` stops it
    // when the last subscriber unmounts — there is nothing to reset.
    expect(
      holdsModuleState(`const useTicker = createSharedComposable(() => useTimestamp())\n`),
    ).toBe(false)
  })
})

/** Every `.ts` under a directory, as repository-relative paths. */
function sourceFiles(directory: string, prefix: string): Array<string> {
  if (!existsSync(directory)) return []

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__') return []
    if (entry.isDirectory())
      return sourceFiles(`${directory}${entry.name}/`, `${prefix}${entry.name}/`)
    return entry.name.endsWith('.ts') ? [`${prefix}${entry.name}`] : []
  })
}

function list(items: ReadonlyArray<string>): string {
  return items.map((item) => `  - ${item}`).join('\n')
}
