import { ObservabilityLayer } from '@/lib/observability'

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
export const dbLayer = ObservabilityLayer

/**
 * Everything dbLayer provides — the services a db program may require.
 *
 * `never` while there are no repositories: the notes worked example is gone
 * and the training repositories land in their own slice, at which point this
 * becomes their union. `ObservabilityLayer` deliberately does not widen it: a
 * tracer is something the runtime installs, not something a program asks for.
 */
export type DbServices = never
