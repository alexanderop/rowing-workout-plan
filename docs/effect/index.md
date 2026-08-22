# Effect

Effect v4 practices for this codebase. `effect` is pinned to exactly `4.0.0-beta.105`; the matching source is checked out at `~/Projects/opensource/effect` on branch `pinned/4.0.0-beta.105`.

Read only the concepts that match the task. If a task spans several, read all the matching ones before editing.

## Start here

- [Effect v4 conventions](conventions.md): core defaults, quick selection guide, boundary rules, and do-nots. Read this one for any Effect work.

## Branch chooser

- [Schema and data modeling](schema.md): data models, schemas, brands, variants, optional keys, or decoders.
- [Services, layers, and modules](services-layers.md): services, a module's public API, layers, runtime wiring, errors, `Effect.fn`, or test services.
- [Config](config.md): runtime config, env variables, `ConfigProvider`, or `layerConfig`.
- [Scheduling and retry](scheduling.md): retry, repeat, polling, backoff, jitter, rate-limit-aware policies, or pass loops.
- [Caching, memoization, and request dedupe](caching.md): memoization, per-key TTL caches, deduplicating concurrent lookups, or request batching.
- [Streams](streams.md): streams, event sources, async iterables, queues/pubsubs, pagination, backpressure, or stream consumers.
- [HTTP clients](http-clients.md): outgoing HTTP calls, Effect HttpClient, status handling, or HTTP rate limiting.
- [Testing Effect code](testing.md): Effect tests, time, sleeps, concurrency synchronization, or fakes.

## Where Effect lives in this project

The project-specific boundary is in the [knowledge index](../index.md), not here: which code is Effect and which stays plain async TypeScript, and how Effect meets Vue at atoms. These concepts describe Effect; the index describes this codebase's use of it, and wins where they differ.

Some concepts here cover ground this browser-only app does not currently use (HTTP clients, config providers, long-lived streams). They are kept because the starter is meant to be copied into apps that grow into them.
