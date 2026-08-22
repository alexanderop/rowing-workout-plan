import { Layer } from 'effect'
import { ObservabilityLayer } from '@/lib/observability'
import { NotesRepo } from './repositories/notes'

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
export const dbLayer = Layer.merge(NotesRepo.layer, ObservabilityLayer)

/**
 * Everything dbLayer provides — the services a db program may require.
 * `ObservabilityLayer` deliberately does not widen it: a tracer is something
 * the runtime installs, not something a program asks for.
 */
export type DbServices = NotesRepo
