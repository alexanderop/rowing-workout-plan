/**
 * Which a11y sweep covers which component.
 *
 * The a11y tier sweeps whole *screens*, not components in isolation, so
 * "this component has an a11y test" is not something the tier can be asked
 * directly — a component only gets swept if some sweep actually renders it,
 * and a component behind a conditional (a toast, an install banner) is not
 * rendered by the default screen sweeps at all.
 *
 * This file is the answer written down: every component in the app names the
 * sweep that renders it, or names why it is not swept. `architecture/
 * a11yCoverage.test.ts` holds it to that — add a component without an entry
 * here and the arch tier fails, which is the whole point. Adding the entry is
 * a deliberate act; adding it dishonestly is on you.
 */

/**
 * The sweeps `a11y.spec.ts` runs, as ids so the maps below cannot name one
 * that does not exist — that check is the type system's, not a string match.
 * The values are noun phrases: the spec appends "has no violations".
 */
export const SWEEPS = {
  plans: 'plans',
  plansWithoutBenchmark: 'plans before a 2k is set',
  benchmarkSheet: 'the benchmark sheet',
  planWeek: 'a plan week',
  session: 'a session',
  today: 'today',
  log: 'the log',
  logSheet: 'the log-a-row sheet',
  settings: 'settings',
  toast: 'a toast',
  installBanner: 'the install banner',
  installDialog: 'the install dialog',
  updateBanner: 'the update banner',
} as const

export type SweepId = keyof typeof SWEEPS

/**
 * Component path (relative to `src/`) → the sweep that renders it.
 *
 * Where more than one sweep renders a component, name the one whose state is
 * the interesting one: `ToastViewport` is mounted in every sweep, but only
 * the `toast` sweep has a toast *in* it, and an empty live region is not what
 * anyone wants checked.
 */
export const A11Y_COVERAGE = {
  'App.vue': 'settings',
  'features/training/components/ActivePlanCard.vue': 'plans',
  'features/training/components/PlanCard.vue': 'plans',
  'features/training/components/BenchmarkSheet.vue': 'benchmarkSheet',
  'features/training/components/SessionRow.vue': 'planWeek',
  'features/training/components/WeekStrip.vue': 'planWeek',
  'features/training/components/TargetsCard.vue': 'session',
  'features/training/components/LogRow.vue': 'log',
  'features/training/components/LogWorkoutSheet.vue': 'logSheet',
  'views/PlanWeekView.vue': 'planWeek',
  'views/TodayView.vue': 'today',
  'views/LogView.vue': 'log',
  'views/SessionView.vue': 'session',
  'views/PlansView.vue': 'plans',
  'components/organisms/OrganismAppShell.vue': 'settings',
  'components/molecules/MoleculePageHeader.vue': 'settings',
  'components/templates/TemplatePageLayout.vue': 'settings',
  'components/organisms/OrganismPwaInstallDialog.vue': 'installDialog',
  'components/organisms/OrganismPwaInstallPrompt.vue': 'installBanner',
  'components/molecules/MoleculePwaUpdatePrompt.vue': 'updateBanner',
  'components/molecules/MoleculeToastViewport.vue': 'toast',
  'views/SettingsView.vue': 'settings',
} satisfies Readonly<Record<string, SweepId>>

/**
 * Components deliberately left out of the a11y tier, each with the reason.
 *
 * A reason is not "it is hard to mount". If a component renders for a user,
 * it can be swept — the entries that belong here are the ones where the sweep
 * would grade something other than the shipped UI. Keep this map short; a
 * growing skip list is the finding, not the fix.
 */
export const A11Y_SKIPPED = {
  'views/DevCaptureView.vue':
    'The PM5 capture harness. Its route is spread in behind `import.meta.env.DEV`, so Rollup drops it from every production build — verified by grepping dist/ for the service UUID. This tier grades what ships to a user, and nothing here does. Sweep it the day it becomes a screen.',
} satisfies Readonly<Record<string, string>>
