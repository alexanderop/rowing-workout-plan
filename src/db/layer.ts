import { Layer } from 'effect'
import { ObservabilityLayer } from '@/lib/observability'
import { BenchmarksRepo } from './repositories/benchmarks'
import { EnrolmentsRepo } from './repositories/enrolments'
import { WorkoutsRepo } from './repositories/workouts'

/**
 * The layer stack both db runtimes are built from — the atom runtime in
 * `./atoms.ts` (reads and writes that drive the UI) and the ManagedRuntime in
 * `./runtime.ts` (the imperative `runDb` edge).
 *
 * It lives in its own module because they are two separate runtimes with two
 * separate contexts: a service — or a tracer — merged into one is invisible to
 * the other. Defining the stack once is what stops them drifting apart. Merge
 * new repository layers in here, and nowhere else.
 */
export const dbLayer = Layer.mergeAll(
  BenchmarksRepo.layer,
  EnrolmentsRepo.layer,
  WorkoutsRepo.layer,
  ObservabilityLayer,
)

/**
 * Everything dbLayer provides — the services a db program may require.
 *
 * `ObservabilityLayer` deliberately does not widen it: a tracer is something
 * the runtime installs, not something a program asks for.
 */
export type DbServices = BenchmarksRepo | EnrolmentsRepo | WorkoutsRepo

/**
 * The same three repositories backed by in-memory Refs instead of IndexedDB,
 * so a full program — `exportData`, `importData`, anything composed over a
 * repo — runs in the Node unit tier. Assembled here for the same reason the
 * production stack is: one definition, so a repository added to one and
 * forgotten in the other is a type error rather than a missing service at
 * run time.
 */
export const dbTestLayer = Layer.mergeAll(
  BenchmarksRepo.testLayer,
  EnrolmentsRepo.testLayer,
  WorkoutsRepo.testLayer,
)
