# vue-pwa-starter

A **local-first Vue 3 PWA starter** with the part most starters skip: a complete, tiered testing strategy and the mobile app-shell boilerplate you otherwise rebuild every time.

Everything lives on the device (IndexedDB via Dexie). No backend, no accounts, no spinners. Built for apps you use on a phone, offline, mid-task.

## Quickstart

Use this repository as a GitHub template (or clone it), then:

```bash
pnpm install
pnpm dev
```

All gates should be green out of the box:

```bash
pnpm check                                        # everything below that needs no browser, in parallel (~8 s)
pnpm test && pnpm test:a11y && pnpm test:visual   # browser + a11y + visual tiers
pnpm test:e2e                                     # production build in a real browser
pnpm test:mutation                                # mutation score over the unit tier (~10 s)
pnpm build && pnpm size-limit                     # bundle budget
```

`pnpm check` is the one to reach for while you work: it runs lint, formatting,
types, dead-code, the unit tier and the architecture tier concurrently, keeps
going after the first failure, and prints each task's output under its own
label — so one run tells you everything that is broken.

## What you get

| Area             | What is in the box                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell        | Config-driven bottom nav ([`OrganismAppShell.vue`](src/components/organisms/OrganismAppShell.vue)), optional center FAB slot, `meta.hideNav` escape hatch, safe-area insets, `TemplatePageLayout`/`MoleculePageHeader`, keyboard-aware bottom sheet (`MoleculeDialogContent`), toast viewport                                                      |
| UI components    | shadcn-vue-style primitives over [Reka UI](https://reka-ui.com/), copied rather than installed — compound parts, `cn()` class merging, `data-slot` targeting, `as-child`. The layer boundary is lint- and test-enforced. See [docs/ui-components.md](docs/ui-components.md)                                                                        |
| Local-first data | Dexie schema with a worked v1→v2 migration, converter pattern for reading old data forever, repository layer, zod-validated JSON export/import                                                                                                                                                                                                     |
| Example feature  | `src/features/notes` — one deliberately boring feature that touches every layer, with a test in every tier. Copy it, then delete it                                                                                                                                                                                                                |
| Testing          | Six tiers: unit (Node, ~100 ms), browser (Vitest browser mode), a11y (axe-core), visual (screenshots), architecture (ArchUnitTS), e2e (playwright-bdd against the production build). See [docs/testing-strategy.md](docs/testing-strategy.md)                                                                                                      |
| Test quality     | Stryker mutation testing scoped to the unit tier — grades whether the assertions would notice a bug, not whether the lines ran. Runs in ~10 s, own CI job. See [docs/mutation-testing.md](docs/mutation-testing.md)                                                                                                                                |
| Quality gates    | oxlint + ESLint + Prettier + markdownlint, knip (dead exports), size-limit (bundle budget), husky pre-commit gate (~15 s)                                                                                                                                                                                                                          |
| PWA              | vite-plugin-pwa with update prompt, icons generated from one SVG at build time, offline precache, web-vitals seam                                                                                                                                                                                                                                  |
| Observability    | Every db operation is a named Effect span already; opt into OTLP export in development with one env var — no `@opentelemetry/*` dependency, nothing in the production bundle. See [Tracing in development](#tracing-in-development)                                                                                                                |
| CI               | Sharded GitHub Actions pipeline, actions pinned by SHA, zizmor-clean                                                                                                                                                                                                                                                                               |
| i18n             | vue-i18n with typed message keys, English + German                                                                                                                                                                                                                                                                                                 |
| Agent-ready      | No `CLAUDE.md`, no `AGENTS.md` — [`docs/`](docs/index.md) is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundle of concept files (including a full Effect v4 reference), and a `SessionStart` hook injects its index into every agent session. Humans and agents read the same file |

## Stack

Vue 3.5 · TypeScript (strict) · Vite · Tailwind CSS v4 · reka-ui · VueUse · Dexie · vue-router · vue-i18n · zod · Vitest 4 (browser mode) · Playwright · pnpm (with catalogs — pnpm is required)

## Philosophy: local-first

Design tie-breakers, borrowed from [Ink & Switch's local-first ideals](https://www.inkandswitch.com/local-first/):

1. **No spinners** — instant input, never block on network
2. **Network optional** — fully offline
3. **The Long Now** — data readable after the app dies (export, schema stability, converters)
4. **Ownership & control** — user owns the data, no accounts, exportable any time

How the data layer implements this: [docs/local-first.md](docs/local-first.md)

## Project structure

```text
src/features/      Feature-owned UI, state, and domain logic (features never import features)
src/db/            Dexie schema, converters, repositories — the only place that touches storage
src/stores/        Shared app-wide state (@effect/atom-vue atoms, not Pinia)
src/composables/   Shared reactive logic (2+ consumers)
src/views/         Route-level pages; may compose multiple features
src/components/    Shared components, tiered by atomic design — docs/atomic-design.md
                   atoms/ molecules/ organisms/ templates/; every atom is a styled
                   primitive (shadcn-style, yours to edit — docs/ui-components.md),
                   as is a directory with a barrel; a flat .vue above atoms/ is a
                   composite
src/__tests__/     All tests, mirroring the source tree — not colocated
test/e2e/          playwright-bdd features + steps
```

These boundaries are not just documentation — they are enforced by [architecture tests](src/__tests__/architecture/architecture.test.ts) over the module graph and by `no-restricted-imports` rules in [eslint.config.ts](eslint.config.ts), which also cover `.vue` files. [A negative test](src/__tests__/architecture/boundaries.test.ts) proves the enforcement actually fires.

## Tracing in development

The instrumentation is already there: every repository operation is wrapped in `Effect.fn('NotesRepo.list')`, the backup programs add `Effect.withSpan`, and every reported failure emits a log record annotated with `boundary` / `operation` / `failure`. What is missing by default is somewhere to send it.

Start a collector and point the app at it:

```bash
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one
cp .env.example .env.local
pnpm dev
```

Open <http://localhost:16686>, pick the `vue-pwa-starter` service, and you get a span per db operation — including the `NotesRepo.create` → `NotesRepo.list` pair that shows a write invalidating `NOTES_KEY` and the read atom re-reading from disk.

Three things make this cheap enough to ship in a starter:

- The OTLP exporters live in `effect/unstable/observability` and post JSON over `fetch`, so there is no `@opentelemetry/*` SDK to install or bundle.
- The dev server proxies `/_otlp` to `localhost:4318`, keeping the request same-origin — a stock collector rejects the CORS preflight an OTLP payload would otherwise trigger.
- `import.meta.env.DEV` is a literal `false` in a production build, so the exporter is dead code. `pnpm size-limit` is what keeps that honest, and telemetry about a user's own notes never has the chance to leave their device.

## Adding your first feature

Follow the walkthrough in [docs/adding-a-feature.md](docs/adding-a-feature.md). Short version: copy how `src/features/notes` does it, tier by tier.

## Deleting the example

The notes feature is scaffolding. To remove it:

1. Delete `src/features/notes`, `src/views/NotesView.vue`, and the notes specs under `src/__tests__` and `test/e2e`.
2. Remove the notes entries from `src/router/index.ts`, `src/router/navigation.ts`, and the `notes`/`quickAdd` keys from `src/i18n/messages/*`.
3. Replace the `notes` table in `src/db/schema.ts` (and `repositories/`, `backup.ts`) with your own.
4. Remove the `QuickAddNoteSheet` wiring from `src/App.vue` (keep the `#center-action` slot if you want a FAB).
5. Run `pnpm check` — the gates will point at anything you missed.

## License

[MIT](LICENSE)
