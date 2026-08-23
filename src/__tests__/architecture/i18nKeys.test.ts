/**
 * Keeps the message catalogue and the code that reads it in step.
 *
 * Parity between locales is already the type system's job — `de.ts` is
 * annotated `MessageSchema`, so a missing or misspelt German key is a compile
 * error and needs no test. What types cannot see is the other two ways a
 * catalogue rots:
 *
 * 1. **Keys nothing uses.** Deleting a control leaves its strings behind, and
 *    every translator pays for them forever. Nothing fails, so nobody notices.
 * 2. **Keys built at runtime.** ``t(`plans.kind.${kind}`)`` compiles whatever
 *    `kind` is, so the typed-key guarantee that makes `t('nav.typo')` a
 *    compile error stops applying exactly where it is easiest to get wrong.
 *
 * Interpolation is not banned — it is the honest way to say "one of these
 * four" — but it has to be declared, and the declaration is checked against
 * the catalogue in both directions.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'

const SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** Not scanned: the catalogues themselves, and the tests. */
const EXCLUDED = ['i18n/messages/', '__tests__/']

/**
 * The `t()` calls whose key is not a literal, and the keys each one can
 * produce.
 *
 * Both halves are enforced: a call site missing from here fails the dynamic
 * check, and a key listed here that the catalogue does not have fails the
 * next one. Adding a case to the template without adding it here therefore
 * shows up as an unused key, which is the point.
 */
const INTERPOLATED = {
  'App.vue': {
    reason:
      'The tab labels come from NAV_ITEMS (router/navigation.ts), which holds the keys as literals — so the usage check below still sees them.',
    keys: [],
  },
  'features/training/components/PlanCard.vue': {
    reason:
      'A plan carries its own description key (features/training/catalog.ts holds them as literals, and the Plan type makes one mandatory), so a plan cannot ship without a description and the usage check below still sees the keys.',
    keys: [],
  },
  'features/training/components/SessionRow.vue': {
    reason:
      'A session is written as one of three sentences (features/training/session.ts picks the style) and labelled with its kind, so both keys are built from data the catalogue owns.',
    keys: [
      'plans.session.steady',
      'plans.session.intervals',
      'plans.session.piece',
      'plans.kind.steady',
      'plans.kind.shortRest',
      'plans.kind.longRest',
      'plans.kind.pacedTwoK',
      'plans.kind.distancePiece',
    ],
  },
  'features/training/components/LogRow.vue': {
    reason:
      'A log row reuses the plan sentences declared for SessionRow — a session reads the same in the log as it did on the day it was set.',
    keys: [],
  },
  'views/LogView.vue': {
    reason:
      'The filter chips and the week headings are both closed sets that history.ts owns (WORKOUT_FILTERS, HistoryBucket), so the keys are built from them.',
    keys: [
      'log.filter.all',
      'log.filter.plan',
      'log.filter.free',
      'log.bucket.thisWeek',
      'log.bucket.lastWeek',
      'log.bucket.earlier',
    ],
  },
  'views/TodayView.vue': {
    reason:
      "Today names the next session with the same sentence and kind keys the week list uses; both sets are declared on SessionRow's entry.",
    keys: [],
  },
  'views/SessionView.vue': {
    reason:
      "The title reuses the session sentences declared above and the kind line reuses the kind labels; both sets are declared on SessionRow's entry. The coaching note moved to useRotationText.",
    keys: [],
  },
  'features/training/useRotationText.ts': {
    reason:
      'One rotation note, said two ways: described on the week screen and coached on the session screen. Both are the same four positions `rotationNote` chooses between — first, middle, last, or the end of the plan.',
    keys: [
      'plans.rotation.first',
      'plans.rotation.middle',
      'plans.rotation.last',
      'plans.rotation.final',
      'plans.coach.first',
      'plans.coach.middle',
      'plans.coach.last',
      'plans.coach.final',
    ],
  },
} as const satisfies Record<string, { reason: string; keys: ReadonlyArray<string> }>

/**
 * A `t()` or `$t()` whose first argument is not a quoted string.
 *
 * The lookbehind is what keeps this from matching the `t(` inside `format(`,
 * `await(`, or a `.t(` method call — only a `t` that starts an identifier
 * counts.
 *
 * No `g` flag: this is only ever asked yes-or-no, and a global regex reused
 * across `.test()` calls carries `lastIndex` from one file into the next,
 * which makes the answer depend on the order the files were read in.
 */
const INTERPOLATED_CALL = /(?<![\w$.])\$?t\(\s*[^'"\s)]/u

function sourceFiles(directory: string, prefix = ''): Array<string> {
  const found: Array<string> = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = `${prefix}${entry.name}`

    if (entry.isDirectory()) {
      found.push(...sourceFiles(`${directory}${entry.name}/`, `${relativePath}/`))
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
      found.push(relativePath)
    }
  }

  return found.filter((file) => !EXCLUDED.some((excluded) => file.startsWith(excluded)))
}

const FILES = sourceFiles(SOURCE_ROOT).map((path) => ({
  path,
  source: readFileSync(`${SOURCE_ROOT}${path}`, 'utf8'),
}))

/**
 * The catalogue as this file walks it: a string is a leaf, anything else is a
 * subtree. `en` is far more precisely typed than this — the point here is to
 * recurse over *any* catalogue shape without the traversal knowing the keys.
 */
type MessageTree = { readonly [key: string]: string | MessageTree }

function isSubtree(value: string | MessageTree): value is MessageTree {
  return typeof value !== 'string'
}

/** Every leaf of the catalogue, as the dotted path `t()` is given. */
function messageKeys(messages: MessageTree, prefix = ''): Array<string> {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return isSubtree(value) ? messageKeys(value, path) : [path]
  })
}

const KEYS = messageKeys(en)

/**
 * Whether a key is named anywhere in the source, as a quoted string.
 *
 * Deliberately not "appears inside a `t()` call": keys legitimately travel as
 * data before they are translated — `NAV_ITEMS` carries one per tab. What
 * matters is that some literal in the app still names it.
 */
function isNamedInSource(key: string): boolean {
  return FILES.some(
    ({ source }) =>
      source.includes(`'${key}'`) || source.includes(`"${key}"`) || source.includes(`\`${key}\``),
  )
}

// `Set<string>`, not the literal union `as const` infers: these are compared
// against catalogue keys, which are plain strings computed at runtime.
const interpolatedKeys: ReadonlySet<string> = new Set<string>(
  Object.values(INTERPOLATED).flatMap((entry) => entry.keys),
)

describe('i18n keys', () => {
  it('reads the catalogue and the source at all', () => {
    expect(KEYS.length).toBeGreaterThan(0)
    expect(FILES.length).toBeGreaterThan(0)
  })

  it('has no message nobody asks for', () => {
    const unused = KEYS.filter((key) => !interpolatedKeys.has(key) && !isNamedInSource(key))

    expect(
      unused,
      `${unused.length} message key(s) that no code names:\n${list(unused)}\n\n` +
        'Delete them from src/i18n/messages/, or — if a t() call builds them at\n' +
        'runtime — add them to INTERPOLATED in this file.',
    ).toEqual([])
  })

  it('declares every t() call that builds its key', () => {
    const undeclared = FILES.filter(
      ({ path, source }) => INTERPOLATED_CALL.test(source) && !(path in INTERPOLATED),
    ).map(({ path }) => path)

    expect(
      undeclared,
      `t() called with a non-literal key in:\n${list(undeclared)}\n\n` +
        'A built key is invisible to the typed-key check, so it has to be\n' +
        'declared in INTERPOLATED (with the keys it can produce) or rewritten\n' +
        'to name its keys literally.',
    ).toEqual([])
  })

  it('only declares interpolated keys the catalogue actually has', () => {
    const known = new Set(KEYS)
    const missing = [...interpolatedKeys].filter((key) => !known.has(key))

    expect(
      missing,
      `INTERPOLATED names keys that are not in the catalogue:\n${list(missing)}\n\n` +
        'Either the key was renamed and the t() call is now broken at runtime,\n' +
        'or this list is stale.',
    ).toEqual([])
  })

  it('has no stale INTERPOLATED entry', () => {
    const paths = new Set(FILES.map(({ path }) => path))
    const gone = Object.keys(INTERPOLATED).filter((path) => !paths.has(path))

    expect(gone, `INTERPOLATED names files that no longer exist:\n${list(gone)}`).toEqual([])
  })
})

function list(items: ReadonlyArray<string>): string {
  return items.map((item) => `  - ${item}`).join('\n')
}
