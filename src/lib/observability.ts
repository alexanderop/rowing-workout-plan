import { Layer } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import { OtlpLogger, OtlpSerialization, OtlpTracer } from 'effect/unstable/observability'

/**
 * Telemetry export for the Effect runtimes — development only, opt-in.
 *
 * The instrumentation itself is already in the code and costs nothing extra:
 * every `Effect.fn('WorkoutsRepo.list')` opens a named span, `Effect.withSpan`
 * wraps the backup programs, and `useReportFailure` emits annotated log
 * records on the fiber inside them. Without a tracer installed those spans are
 * built and dropped. This layer is what gives them somewhere to go.
 *
 * `effect/unstable/observability` is the reason this is affordable in a PWA
 * with a size budget: the OTLP exporters ship inside the `effect` package and
 * post plain JSON over `fetch`, so there are no `@opentelemetry/*` SDK
 * dependencies to install or bundle.
 *
 * Local-first is why it stops at development. The user's training log never
 * leaves their device, and neither should spans naming the operations they
 * ran on it. `import.meta.env.DEV` is a literal `false` in a production build, so
 * the whole branch — and the exporters it references — is dead code Rollup
 * drops; `pnpm size-limit` is the check that keeps that true.
 */

/**
 * Where to POST OTLP payloads, or nothing to export nothing.
 *
 * Unset by default on purpose: most people running `pnpm dev` have no
 * collector, and a background POST failing every few seconds is noise in the
 * one console they are trying to read. Turn it on per-checkout in `.env.local`
 * — `.env.example` has the line and the collector command to pair it with.
 */
const endpoint = import.meta.env.VITE_OTLP_URL

const resource = { serviceName: 'vue-pwa-starter' }

/**
 * Tracer and logger over one shared OTLP transport.
 *
 * `OtlpLogger.layer` merges with the existing loggers rather than replacing
 * them, so the browser console keeps printing while records also reach the
 * collector — during development you want both, not a choice.
 *
 * Both exporters batch (5 s / 1000 records by default) and, after three failed
 * attempts, disable themselves for 60 seconds with a debug log. A collector
 * that is down therefore degrades to a quiet line, not a request storm.
 */
const otlpLayer = (url: string): Layer.Layer<never> =>
  Layer.merge(
    OtlpTracer.layer({ url: `${url}/v1/traces`, resource }),
    OtlpLogger.layer({ url: `${url}/v1/logs`, resource }),
  ).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer))

/**
 * Merged into `dbLayer`, so every program the db runtimes execute is traced.
 * `Layer.empty` when telemetry is off — a layer that provides nothing, which
 * is exactly what "no observability" means to the runtime above it.
 */
export const ObservabilityLayer: Layer.Layer<never> =
  import.meta.env.DEV && endpoint ? otlpLayer(endpoint) : Layer.empty
