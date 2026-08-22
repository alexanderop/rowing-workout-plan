import { existsSync, readdirSync } from 'node:fs'
import type { Linter } from 'eslint'
import e18e from '@e18e/eslint-plugin'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import oxlint from 'eslint-plugin-oxlint'
import regexp from 'eslint-plugin-regexp'
import pluginVue from 'eslint-plugin-vue'

/**
 * Architecture boundaries, enforced twice.
 *
 * `src/__tests__/architecture/` (ArchUnitTS) reads the TypeScript module
 * graph — which means it is blind to `<script setup>` blocks in .vue files.
 * Most of this app's imports live in .vue files, so the arch tier alone
 * would let a component reach straight into another feature or into the
 * database internals. These `no-restricted-imports` configs close that hole:
 * ESLint lints .vue and .ts alike.
 *
 * Patterns are gitignore-style, matched against the import *specifier*, so
 * they cover the `@/…` alias this codebase uses for every cross-directory
 * import. A relative import that escapes its own directory would slip past
 * them — that case is what the ArchUnitTS tier still covers for .ts files.
 *
 * One caveat drives the shape of the code below: flat config does not merge
 * rule options, it replaces them. Two configs that both set
 * `no-restricted-imports` on the same file means the last one silently wins,
 * so every scope here is disjoint and carries the full set of patterns that
 * applies to it.
 */
// The directory may legitimately be gone: the README tells you to delete the
// example feature, and git does not track empty directories — so a fresh
// clone of a featureless app has no src/features/ at all. Lint must not
// crash on that; the feature-isolation rules simply have nothing to guard.
const featuresDir = new URL('src/features/', import.meta.url)
const FEATURES = existsSync(featuresDir)
  ? readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : []

const SOURCES = '**/*.{ts,mts,tsx,vue}'

/** Reusable layers — they may never point at a feature. */
const SHARED_LAYERS = ['components', 'composables', 'stores', 'lib', 'types'] as const

// `**/…` rather than `@/…` so the relative spelling of the same import is
// caught too. `ignore` applies gitignore's parent-directory rule, so the
// groups below must not exclude `features/` or `db/` wholesale — a broader
// pattern would make the `!` re-includes below dead letters.
const ANY_FEATURE = ['**/features/*', '**/features/*/**']

const NO_FEATURES = {
  group: ANY_FEATURE,
  message:
    'Shared layers may not depend on a feature — the arrow points the other way. Views and the app shell are where features get composed.',
}

/** A feature may import itself; every sibling is off limits. */
const onlyOwnFeature = (feature: string) => ({
  group: [...ANY_FEATURE, `!**/features/${feature}`, `!**/features/${feature}/**`],
  message:
    'Features are independent: move the shared part into src/lib, src/components or src/stores instead of importing another feature.',
})

/** Everything below src/db is internal; `@/db` (src/db/index.ts) is the door. */
const NO_DB_INTERNALS = {
  group: ['**/db/*', '**/db/*/**'],
  message:
    'The database has one public surface: import from @/db. Add the operation to a repository and re-export it there.',
}

/**
 * The component tree, tiered by atomic design, and enforced the same way as
 * the db layer.
 *
 * `src/components/<tier>/` is one directory per tier, and there are exactly
 * two shapes:
 *
 * - a **primitive** — everything in `atoms/`, plus a directory with an
 *   `index.ts` barrel in any tier (`molecules/dialog/`, the compound form).
 *   These are the shadcn-style wrappers over reka-ui: presentational, no db,
 *   no stores, no feature.
 * - a **composite** — a flat `.vue` in a tier above atoms
 *   (`molecules/MoleculePageHeader.vue`, `organisms/OrganismAppShell.vue`).
 *   Ordinary app components, which may read a store or a composable, and
 *   which compose primitives rather than wrap reka.
 *
 * reka-ui and cva are the substrate a primitive is built from, not an API the
 * app codes against — an app component reaching for `<DialogContent>` straight
 * from reka-ui gets no `data-slot`, none of our styling, and no single place
 * to restyle later. Same reasoning as the db rule above: one public surface
 * per layer.
 *
 * The tiers are in docs/atomic-design.md; how a primitive is written is in
 * docs/ui-components.md.
 *
 * Exported because `src/__tests__/architecture/atomicDesign.test.ts` asserts
 * what ESLint cannot: that every shared component sits in exactly one of
 * these, and that the direction below holds for a relative import too.
 */
export const TIERS = ['atoms', 'molecules', 'organisms', 'templates'] as const

type Tier = (typeof TIERS)[number]

/**
 * The primitives: every atom, plus the parts of a compound primitive — a
 * directory with a barrel, in whichever tier it was filed. An atom is
 * presentational and works on props alone, which is the primitive contract
 * itself, so `atoms/` has no composite half.
 */
const primitiveFiles = (tier: Tier): string[] => [
  `src/components/${tier}/*/${SOURCES}`,
  ...(tier === 'atoms' ? [`src/components/atoms/${SOURCES}`] : []),
]

/** The composites: a flat `.vue` sitting directly in a tier above atoms. */
const compositeFiles = (tier: Tier): string[] =>
  tier === 'atoms' ? [] : [`src/components/${tier}/*.vue`]

const NO_HEADLESS_DIRECT = {
  group: ['reka-ui', 'reka-ui/**', 'class-variance-authority', 'class-variance-authority/**'],
  message:
    'reka-ui and cva are the private substrate of the primitives (src/components/atoms/, and a compound primitive directory in any tier). Import the wrapped primitive instead (@/components/atoms/AtomButton.vue, @/components/molecules/dialog), or add the primitive there first — docs/ui-components.md.',
}

/** Each compound primitive has one door: its index.ts. */
const NO_UI_INTERNALS = {
  group: TIERS.map((tier) => `**/components/${tier}/*/*`),
  message:
    'Import a primitive from its barrel (@/components/molecules/dialog), not from the file inside it — the barrel is what keeps a part swappable.',
}

/**
 * Atomic design points one way. Atoms compose into molecules, molecules into
 * organisms, organisms into templates, and a template is placed by a view.
 *
 * An import going the other way is the tier collapsing: the moment `AtomButton`
 * knows about `OrganismAppShell`, it can only be used where an app shell
 * exists, and the tier it was filed under stops meaning anything. A same-tier
 * import is fine — that is composition, and it is how
 * `OrganismPwaInstallPrompt` opens `OrganismPwaInstallDialog`.
 */
const noHigherTiers = (tier: Tier) => {
  const above = TIERS.slice(TIERS.indexOf(tier) + 1)
  if (above.length === 0) return []
  const named =
    above.length === 1 ? above[0] : `${above.slice(0, -1).join(', ')} or ${above.at(-1)}`
  return [
    {
      group: above.flatMap((higher) => [`**/components/${higher}`, `**/components/${higher}/**`]),
      message: `${tier} may not import ${named} — atomic design points one way, so a lower tier never depends on the layout it happens to sit in. Move the shared part down a tier, or move this component up. docs/atomic-design.md.`,
    },
  ]
}

/**
 * We write these components rather than install them. Vendoring the upstream
 * package back in would put a second, differently-styled Dialog in the app.
 */
const NO_SHADCN = {
  group: ['shadcn-vue', 'shadcn-vue/**', 'radix-vue', 'radix-vue/**'],
  message:
    'This project writes its own primitives in the shadcn-vue style rather than depending on it — copy the pattern into src/components/ instead. docs/ui-components.md.',
}

/**
 * The same boundary as NO_HEADLESS_DIRECT, one level down: the raw HTML
 * elements a primitive already wraps.
 *
 * `no-restricted-imports` stops an app component reaching past `AtomButton`
 * to reka-ui. It cannot stop the cheaper way around, which is to skip the
 * primitive entirely and write `<button>` — no import to restrict, so nothing
 * fires. That is the version that actually happens, and it is the more
 * expensive one: `buttonVariants` carries the 44px touch floor, the
 * `active:scale` press feedback, `touch-manipulation`, and the focus ring
 * (see the comment above `buttonVariants` in AtomButton.vue, every line of it
 * hard-won). A bare `<button>` has none of them and looks fine on a desktop
 * review.
 *
 * Only elements a primitive genuinely owns are listed. `<select>` is absent
 * because there is no AtomSelect to send anyone to — add the element here the
 * day the primitive exists, not before.
 */
const WRAPPED_ELEMENTS = [
  {
    element: 'button',
    primitive: 'AtomButton',
    loses: 'the 44px touch floor, the active:scale press, touch-manipulation and the focus ring',
  },
  {
    element: 'input',
    primitive: 'AtomInput',
    loses: 'the touch-height field, the focus ring and the disabled styling',
  },
  {
    element: 'textarea',
    primitive: 'AtomTextarea',
    loses: 'the min-height, the focus ring and the disabled styling',
  },
  {
    element: 'label',
    primitive: 'AtomLabel',
    loses: "reka's click-to-focus wiring and the peer-disabled styling",
  },
] as const

const NO_RAW_ELEMENTS = WRAPPED_ELEMENTS.map(({ element, primitive, loses }) => ({
  element,
  message: `<${element}> is what ${primitive} is for. Use it (@/components/atoms/${primitive}.vue) — writing the element directly loses ${loses}, and none of that is visible in a desktop review. If the primitive genuinely cannot express this case, disable the rule on the line and say which part it cannot express. docs/ui-components.md`,
}))

/**
 * Where the raw element is still the right answer: inside the primitives
 * themselves, which is where the wrapping happens. `AtomInput` writing
 * `<input>` is the rule working, not the rule failing.
 */
const PRIMITIVES = TIERS.flatMap((tier) => primitiveFiles(tier))

/** Primitives are presentational: no data layer, no app state, no features. */
const NO_APP_STATE = {
  group: ['**/db', '**/db/**', '**/stores/**', ...ANY_FEATURE],
  message:
    'A UI primitive stays presentational — no database, no stores, no features. Bind the data in a feature component and pass it in.',
}

/**
 * Functional core, imperative shell — the three layers, as globs.
 *
 * Exported because `src/__tests__/architecture/functionalCore.test.ts` asserts
 * things about the same three sets that ESLint cannot: that every glob still
 * matches a file, and that the specs for each layer look the way the layer
 * claims. One definition, two enforcers — the pattern the boundaries above
 * already use. Full reasoning: docs/functional-core.md.
 *
 * The split is not invented here. Three independent signals already agreed on
 * it before a rule existed: the only two modules that nest a conditional two
 * deep are the only two whose unit specs need test doubles, and are the two
 * docs/index.md already calls out as "browser-platform plumbing with no domain
 * content". That is the edge. Everything above is reactive glue; what is left
 * is the core.
 */

/** Pure decisions. No clock, no platform, no reactivity — and no cap on how hard they think. */
export const CORE = [
  'src/features/*/domain.ts',
  'src/db/converters.ts',
  'src/lib/installPlatform.ts',
  'src/lib/utils.ts',
]

/**
 * The outermost shell: modules whose entire job is to talk to a browser API
 * that can fail. Imperative on purpose — try/catch, `navigator`, `fetch` — so
 * the conditional budget below does not apply, and their specs are the only
 * ones allowed to reach for a test double.
 */
export const PLATFORM_EDGE = [
  'src/lib/persistentStorage.ts',
  'src/lib/swUpdateCheck.ts',
  'src/lib/backupFile.ts',
  'src/lib/download.ts',
  'src/lib/themeColor.ts',
  'src/lib/webVitals.ts',
  'src/lib/observability.ts',
  'src/main.ts',
]

/**
 * Everything between: components, composables, stores, atoms, repositories.
 * Reactivity is mutation, so none of this is ever pure — the constraint is not
 * purity but *thinness*. A decision that grows here belongs in CORE, and the
 * budget is what makes "grows" a build failure instead of a code review.
 */
export const REACTIVE_SHELL = [
  'src/**/*.vue',
  'src/composables/**/*.ts',
  'src/stores/**/*.ts',
  'src/features/*/atoms.ts',
  'src/features/*/use*.ts',
  'src/db/**/*.ts',
  'src/router/**/*.ts',
]

/**
 * Thresholds are the measured maxima of the tree that was already here, not
 * round numbers: .vue peaked at complexity 4 / 6 statements, composables at
 * 7 statements, and *nothing* in this layer nested two deep. So none of this
 * is a refactor — it is a ratchet on a shape the code already had.
 *
 * `max-depth: 1` is the load-bearing one. Bernhardt's claim is that a real
 * core/shell split leaves the shell with few conditionals; a second level of
 * nesting in a component is the first observable sign that a decision failed
 * to move down. Line count is deliberately *not* capped: an Effect pipeline is
 * long but flat (`save` in QuickAddNoteSheet is 25 lines at complexity 2), so
 * max-lines-per-function would only punish the style we want.
 */
const SHELL_BUDGET: Linter.RulesRecord = {
  'max-depth': ['error', 1],
  complexity: ['error', { max: 4 }],
  'max-statements': ['error', 7],
}

/**
 * What makes the core the core: the same input gives the same answer, forever,
 * on any machine. Every entry below is a way to read something that is not an
 * argument. `noteAge` is the worked example of the alternative — it takes
 * "now" from Effect's `Clock` service, so TestClock can drive every bucket
 * boundary instead of fake timers guessing at them.
 */
const AMBIENT_READS = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'fetch',
  'navigator',
  'document',
  'window',
  'location',
  'history',
  'crypto',
  'performance',
  'alert',
  'confirm',
  'prompt',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
]

const CORE_IS_DETERMINISTIC: Linter.RulesRecord = {
  'no-restricted-globals': [
    'error',
    ...AMBIENT_READS.map((name) => ({
      name,
      message: `The core reads its inputs from its arguments. \`${name}\` is ambient state, so a function that touches it answers differently depending on when and where it ran — which is the definition of the shell. Take it as a parameter, or move this module to the edge. docs/functional-core.md`,
    })),
  ],

  'no-restricted-properties': [
    'error',
    {
      object: 'Date',
      property: 'now',
      message:
        "The core does not read the clock. Take the timestamp as a parameter, or yield Effect's `Clock.currentTimeMillis` — see `noteAge` in src/features/notes/domain.ts, which is testable at every bucket boundary because it did. docs/functional-core.md",
    },
    {
      object: 'Math',
      property: 'random',
      message:
        'The core is deterministic. Take the value as a parameter, or put the generator behind a service default the way src/db/generateId.ts does. docs/functional-core.md',
    },
  ],

  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message:
        '`new Date()` reads the clock. Pass the timestamp in, or yield `Clock.currentTimeMillis`. docs/functional-core.md',
    },
    {
      selector: "MemberExpression[object.name='Effect'][property.name=/^run/]",
      message:
        "Running a program is the shell's job — the core *builds* programs and hands them up. A core module that runs its own has swallowed the shell, and with it the caller's ability to choose a runtime or a TestClock. docs/functional-core.md",
    },
  ],
}

/**
 * Composables — the reusable half of the reactive shell.
 *
 * A subset of REACTIVE_SHELL, scoped separately because the rules below are
 * about a *public surface* rather than about thinness: these are the modules
 * other modules call, so what they take and what they hand back is an API.
 * Both globs, because a composable is either shared (`src/composables/`) or
 * owned by one feature (`src/features/<name>/use*.ts`) — there is no third
 * home, and `src/__tests__/architecture/composables.test.ts` reads this array
 * out of here to assert both still resolve to real files.
 *
 * `.vue` is deliberately absent. A `<script setup>` block is a composable's
 * caller, not a composable; logic that wants these rules belongs in a `.ts`
 * module, which is what docs/functional-core.md already asks for.
 *
 * Full reasoning, and the VueUse conventions these encode: docs/composables.md.
 */
export const COMPOSABLES = ['src/composables/*.ts', 'src/features/*/use*.ts']

const COMPOSABLE_CONVENTIONS: Linter.RulesRecord = {
  // A composable's return value is its API. Inferred, it changes shape
  // whenever the body does — silently, and for every caller at once. Naming it
  // is also where the per-key doc comments live: see UseInstallPromptReturn.
  '@typescript-eslint/explicit-module-boundary-types': 'error',

  'no-restricted-syntax': [
    'error',
    {
      // VueUse's rule, and the reason it is worth adopting: `ref()` deep-proxies
      // whatever it holds, which for a DOM node, an event, or a decoded row is
      // both wasted work and a wrapper the platform API will not accept —
      // `deferredPrompt` in useInstallPrompt is exactly that case. Reach for
      // `deepRef` (also from @vueuse/core) when nested mutation *is* the point;
      // it costs the same and says so.
      selector: "CallExpression[callee.name='ref']",
      message:
        '`shallowRef` is the default in a composable — a ref that deep-proxies its contents breaks any value the platform hands back by identity. Use `deepRef` from @vueuse/core when you genuinely need nested reactivity. docs/composables.md',
    },
    {
      // Scoped to calls *inside* a function, which is the whole distinction:
      // a listener registered at module scope lives as long as the document
      // and is a deliberate singleton (useInstallPrompt), while one registered
      // per call has a caller whose scope it must not outlive.
      selector: ":function CallExpression[callee.property.name='addEventListener']",
      message:
        '`useEventListener` from @vueuse/core, not a bare `addEventListener`: it hangs the removal off the calling effect scope, so the listener dies with whatever asked for it. A genuinely app-lifetime listener goes at module scope. docs/composables.md',
    },
  ],
}

type Boundary = { group: string[]; message: string }
type RestrictImports = ['error', { patterns: Boundary[] }]

const boundary = (name: string, files: string[], ignores: string[], patterns: Boundary[]) => {
  // SAFETY: both elements are checked by this function's own signature — the
  // literal 'error' and `patterns: Boundary[]`. The assertion only pins the
  // tuple that TypeScript would otherwise widen to an array; it claims
  // nothing the compiler has not already seen.
  const rules = { 'no-restricted-imports': ['error', { patterns }] as RestrictImports }
  const config = { name: `app/boundaries/${name}`, files, rules }
  // `ignores: []` is not the same as no `ignores` to every flat-config
  // consumer, so the key is added rather than spread in as an empty object.
  return ignores.length > 0 ? { ...config, ignores } : config
}

/** Applies everywhere outside a primitive directory — see NO_HEADLESS_DIRECT. */
const CONSUMES_UI = [NO_HEADLESS_DIRECT, NO_UI_INTERNALS, NO_SHADCN]

const boundaries = [
  ...FEATURES.map((feature) =>
    boundary(
      `features/${feature}`,
      [`src/features/${feature}/${SOURCES}`],
      [],
      [onlyOwnFeature(feature), NO_DB_INTERNALS, ...CONSUMES_UI],
    ),
  ),

  // src/db owns its own internals, but must stay ignorant of features.
  boundary('db', [`src/db/${SOURCES}`], [], [NO_FEATURES, ...CONSUMES_UI]),

  // The primitives themselves: the one place reka-ui and cva are in scope.
  // One scope per tier rather than one for all of them, because the layering
  // patterns differ per tier and flat config replaces rule options.
  ...TIERS.map((tier) =>
    boundary(
      `components/${tier}/primitives`,
      primitiveFiles(tier),
      [],
      [NO_APP_STATE, NO_UI_INTERNALS, NO_SHADCN, ...noHigherTiers(tier)],
    ),
  ),

  // The composites beside them: ordinary app components, which consume the
  // primitives like the rest of the app does. `atoms/` has none, and a scope
  // matching no files is a config ESLint would reject.
  ...TIERS.filter((tier) => compositeFiles(tier).length > 0).map((tier) =>
    boundary(
      `components/${tier}`,
      compositeFiles(tier),
      [],
      [NO_FEATURES, NO_DB_INTERNALS, ...CONSUMES_UI, ...noHigherTiers(tier)],
    ),
  ),

  boundary(
    'shared',
    SHARED_LAYERS.map((folder) => `src/${folder}/${SOURCES}`),
    ['src/components/**'],
    [NO_FEATURES, NO_DB_INTERNALS, ...CONSUMES_UI],
  ),

  // Everything else the app ships — views, router, i18n, the shell. These
  // compose features on purpose; the db surface still applies. Tests are
  // exempt: the migration spec has to talk to the schema directly, and a
  // component spec may mount a reka-ui part as a bare harness.
  boundary(
    'app',
    [`src/${SOURCES}`],
    [
      'src/__tests__/**',
      'src/features/**',
      'src/db/**',
      ...SHARED_LAYERS.map((folder) => `src/${folder}/**`),
    ],
    [NO_DB_INTERNALS, ...CONSUMES_UI],
  ),
]

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/.features-gen/**',
      '**/.vitest/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },

  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  /**
   * Regex correctness. Two of these rules are the reason the set is here
   * rather than left to review: `no-super-linear-backtracking` is a ReDoS
   * check — a pattern whose worst case is quadratic in the input, which on a
   * regex fed anything user-shaped is a hang, not a style question — and
   * `no-misleading-capturing-group` catches a group that cannot match what
   * its author plainly meant. The rest are the ordinary correctness and
   * simplification rules that come with them, and a regex is exactly the kind
   * of code where "it looked right" is not evidence.
   */
  regexp.configs['flat/recommended'],

  /**
   * `@e18e/eslint-plugin`, modernization set only.
   *
   * These replace a hand-rolled idiom with the platform one that has since
   * landed: `Object.hasOwn` over `hasOwnProperty.call`, `Array#at` over
   * `length - 1` indexing, `Date.now()` over `new Date().getTime()`,
   * `regex.test()` over `match() !== null`. Cheaper at runtime, and shorter to
   * read. Not enabled: `moduleReplacements`, which is about swapping
   * dependencies — a call for review, not for a lint rule with `--fix`.
   */
  e18e.configs.modernization,

  {
    name: 'app/rules',
    rules: {
      // Optional props in <script setup lang="ts"> are typed as possibly
      // undefined — forcing a default on every one adds noise, not safety.
      'vue/require-default-prop': 'off',

      // `interface Note extends Schema.Schema.Type<typeof Note> {}` is the
      // Effect idiom for giving a schema's decoded type the schema's own
      // name — a body would defeat the point. Still flag the genuinely empty
      // `interface Foo {}`, which means nothing.
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
    },
  },

  // oxlint runs first (fast, Rust); this disables the ESLint rules it
  // already covers so the two don't double-report.
  ...oxlint.configs['flat/recommended'],

  // Prettier owns formatting — keep ESLint out of it.
  skipFormatting,

  // --- Architecture boundaries (see the comment at the top of this file) ---
  ...boundaries,

  // --- The template half of the same boundary (see WRAPPED_ELEMENTS above) ---
  //
  // This has to be ESLint rather than the oxlint plugin next door: oxlint
  // hands a JS plugin a .vue file as its `<script>` block alone — no template
  // nodes, and `sourceCode.getText()` returns the script text only — so a
  // rule about markup has nothing to look at. vue-eslint-parser parses the
  // template, so this tier can. docs/oxlint-rules.md says the same thing from
  // the other side.
  {
    name: 'app/no-raw-elements',
    files: ['src/**/*.vue'],
    ignores: PRIMITIVES,
    rules: {
      'vue/no-restricted-html-elements': ['error', ...NO_RAW_ELEMENTS],
    },
  },

  // --- Functional core, imperative shell (see CORE / REACTIVE_SHELL above) ---
  //
  // Two disjoint scopes, because flat config *replaces* rule options rather
  // than merging them — the same caveat that shapes the boundaries above. The
  // shell block ignores CORE so `src/db/converters.ts`, which both globs
  // match, is graded as the core file it is.
  {
    name: 'app/functional-core/shell-stays-thin',
    files: REACTIVE_SHELL,
    ignores: [...CORE, ...PLATFORM_EDGE],
    rules: SHELL_BUDGET,
  },

  {
    name: 'app/functional-core/core-stays-deterministic',
    files: CORE,
    rules: CORE_IS_DETERMINISTIC,
  },

  // --- Composable conventions (see COMPOSABLES above, docs/composables.md) ---
  {
    name: 'app/composables',
    files: COMPOSABLES,
    rules: COMPOSABLE_CONVENTIONS,
  },
)
