import { Layer } from 'effect'
import { ObservabilityLayer } from '@/lib/observability'
import { BenchmarksRepo } from './repositories/benchmarks'
import { EnrolmentsRepo } from './repositories/enrolments'
import { TrainingStore } from './repositories/store'
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
  TrainingStore.layer,
  ObservabilityLayer,
)

/**
 * Everything dbLayer provides — the services a db program may require.
 *
 * `ObservabilityLayer` deliberately does not widen it: a tracer is something
 * the runtime installs, not something a program asks for.
 */
export type DbServices = BenchmarksRepo | EnrolmentsRepo | WorkoutsRepo | TrainingStore

/**
 * The same services backed by in-memory Refs instead of IndexedDB, so a full
 * program — `exportData`, `importData`, `deleteAllData`, anything composed
 * over a repo — runs in the Node unit tier. Assembled here for the same
 * reason the production stack is: one definition, so a service added to one
 * and forgotten in the other is a type error rather than a missing service at
 * run time.
 */
const testRepos = Layer.mergeAll(
  BenchmarksRepo.testLayer,
  EnrolmentsRepo.testLayer,
  WorkoutsRepo.testLayer,
)

// `provideMerge` rather than `mergeAll`: the fake store is *built from* the
// three fakes (it empties their maps), so it needs them as a dependency and
// the tests need all four out the other side.
export const dbTestLayer = TrainingStore.testLayer.pipe(Layer.provideMerge(testRepos))
