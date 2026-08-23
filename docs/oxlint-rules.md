---
type: Playbook
title: Writing oxlint rules
description: How the vendored anti-slop plugin is wired, how to add a rule of our own to it, and how to decide whether a rule is the right enforcement tier at all.
tags: [lint, oxlint, tooling, architecture, conventions]
status: stable
sources:
  - name: anti-slop
    url: https://github.com/dmmulroy/anti-slop
    license: MIT
    vendored: tools/oxlint/anti-slop/
    note: Copied from `src/` at the upstream commit current on 2026-08-22. Vendored by design, since upstream's own README says the rules are meant to be read and changed, not pinned as a dependency. Local deviations are listed under "What we changed".
---

# Writing oxlint rules

Most of this project's conventions are enforced by something. [The index](index.md)
names the tiers: types, oxlint, ESLint, the arch tier, the browser tiers. This
file is about the second one, and specifically about the rules we own, which live
in `tools/oxlint/anti-slop/` and are written in TypeScript against oxlint's JS
plugin API.

The reason to have them at all: oxlint's built-in rules and ESLint's plugins
grade _general_ JavaScript. A convention that only exists here, such as
"IndexedDB is untrusted input", "the tree is the variant" or "logic in `.ts`
modules", has no rule to switch on. Up to now those were caught by the arch
tier, which reads the module graph but not statements. A lint rule is the tier
that sees statements, runs in about a second over the whole repo, and fails the
pre-commit hook.

## Where things are

| Path                                          | What it is                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tools/oxlint/anti-slop/index.ts`             | The plugin. Its `rules` map is what `.oxlintrc.json` can name.                      |
| `tools/oxlint/anti-slop/rules/<name>.ts`      | One rule per file, exporting one `defineRule(...)`.                                 |
| `tools/oxlint/anti-slop/rules/<name>.test.ts` | Its `RuleTester` cases, colocated (see below).                                      |
| `tools/oxlint/anti-slop/shared/`              | Helpers more than one rule needs: AST type resolution, lexical scope walking.       |
| `tools/oxlint/anti-slop/effect/`              | A second plugin, `anti-slop-effect`, for rules that encode Effect architecture.     |
| `tools/oxlint/ast.ts`                         | `pnpm ast`, which prints the AST oxlint hands a rule. You will use this constantly. |
| `.oxlintrc.json`                              | Registers both plugins under `jsPlugins` and switches each rule on.                 |
| `tsconfig.tools.json`                         | Puts `tools/**` in `pnpm type-check`'s build.                                       |

Tests are colocated here and nowhere else in the repo. Everything under
`src/` puts its specs in `src/__tests__/`; this tree keeps `no-object-parameters.ts`
next to `no-object-parameters.test.ts` because it is a copy of an upstream
project and staying diffable against it is worth more than the local
convention. They run as their own Vitest project:

```bash
pnpm test:lint-rules      # 13 files, ~200 cases, ~1 s, part of pnpm check
```

`lint:oxlint:check` runs with `--max-warnings 0`, matching what
`lint:eslint:check` has always done. Without it oxlint exits 0 on a warning,
so `pnpm check` stayed green with findings sitting in the output — which is
how two of them (`unicorn(no-new-array)`, `typescript(no-this-alias)`) lived
in the tree unnoticed. A rule this project does not want to act on gets turned
off in `.oxlintrc.json`, where the decision is visible; it does not get to be
a warning nobody reads. The `--fix` scripts and the lint-staged hook keep the
flag off on purpose: fixing is not the gate.

## Before you write one: is a rule the right tier?

A lint rule is cheap to run and expensive to get right. Four things are usually
better, in this order:

1. **A type.** If the mistake can be made unrepresentable, do that. `SupportedLocale`
   is why nobody lints for a bad locale string.
2. **A shape the codebase already enforces.** "The tree is the variant" is not
   a lint rule because a missing child component simply does not render.
3. **An arch test** (`src/__tests__/architecture/`), when the rule is about the
   _module graph_ or about files as a set: who imports whom, which globs still
   match something, whether every declared key is read. A rule sees one file at
   a time and has no idea the others exist.
4. **`no-restricted-imports` in `eslint.config.ts`**, when the rule is "this
   directory may not import that one". That already covers `.vue` files, which
   this plugin does see but which ESLint parses more completely.

Write an oxlint rule when the thing you want to ban is a syntactic pattern,
visible in one file, that the type system permits. `as` with no justification,
`unknown` in a return contract, `vi.mock` outside the platform edge: none of
those are type errors and none of them are visible in the import graph.

Two hard limits worth knowing before you invest an afternoon:

- **No type information.** oxlint parses; it does not typecheck. A rule can see
  `value as User` but not what `value` was. Rules that need types belong in
  ESLint with `@typescript-eslint`'s typed linting, which costs a full program
  build per run.
- **`.vue` files are linted as their `<script>` block.** Not just "template
  expressions are not visited" — the template is not handed to the plugin at
  all. A `'*'` visitor over `<button>{{ label }}</button>` reports `Program`,
  `VariableDeclaration`, `VariableDeclarator`, `Identifier`, `Literal`: the
  script and nothing else. `context.sourceCode.getText()` returns the script
  text too, so there is not even a string to scan. oxlint also ships no Vue
  rules of its own. Anything about markup belongs in ESLint, which parses the
  template through `vue-eslint-parser` — `app/no-raw-elements` in
  `eslint.config.ts` is the worked example, banning a raw `<button>` outside
  the primitives — or in the arch tier, or a browser spec.

## Anatomy of a rule

The smallest useful rule, and every part of it that matters:

```ts
import { defineRule } from '@oxlint/plugins'

/** One line saying what is banned. This is what a reader sees first. */
export const noAmbientClockRule = defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Disallow Date.now() outside the platform edge.' },
    messages: {
      // The message is the whole user interface of a rule. Say what is wrong,
      // then what to do instead. An author who has to go read the rule source
      // to find out is an author who reaches for a disable comment.
      ambientClock:
        'A functional core must not read the ambient clock. Take the time as a parameter, or use Effect `Clock` and let the caller supply it.',
    },
    // Optional, JSON Schema. Only add options when a real second caller wants
    // a different answer. Every option is a fork in the rule's behaviour that
    // needs its own tests.
    schema: [
      {
        type: 'object',
        properties: { allowInTests: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowInTests: false }],
  },
  // `createOnce` builds the visitor once for the whole run; `create` rebuilds
  // it per file. Prefer `createOnce`, which is the faster path, and the plugin
  // is wrapped in `eslintCompatPlugin` so those rules still run under ESLint.
  // A `createOnce` rule that holds per-file state resets it in a `before()`
  // hook, or in `Program` the way the vendored rules do.
  createOnce(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type !== 'Identifier' ||
          node.object.name !== 'Date' ||
          node.property.type !== 'Identifier' ||
          node.property.name !== 'now'
        ) {
          return
        }
        context.report({ node, messageId: 'ambientClock' })
      },
    }
  },
})
```

The visitor keys are AST node types (`MemberExpression`, `TSAsExpression`,
`ImportDeclaration`), plus `NodeType:exit` for the way back up and `'*'` for
every node. What `context` gives you, in rough order of usefulness:

|                                             |                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `context.report({ node, messageId, data })` | The finding. `data` fills `{{placeholders}}` in the message.                                              |
| `context.sourceCode.getText(node)`          | The source behind a node, for quoting an identifier back in a message.                                    |
| `context.sourceCode.getAllComments()`       | Comments, which are not in the tree. This is how `require-safety-comment-for-type-assertion` works.       |
| `context.filename`                          | Path-based exemptions (`*.test.ts`, a platform-edge glob).                                                |
| `context.options`                           | Whatever `.oxlintrc.json` passed. Untyped, so validate it.                                                |
| `node.parent`                               | Every node has one. Walking up is how you ask "am I inside a type guard / a `defineSlots` / a test file". |

### Finding the node type you need

Guessing at TypeScript's ESTree node names is a waste of an hour. Ask:

```bash
pnpm ast "const user = payload as User"
# Program / VariableDeclaration / VariableDeclarator / Identifier
# TSAsExpression / Identifier / TSTypeReference / Identifier

pnpm ast "const user = payload as User" TSAsExpression
# the whole node, fields and all, with `parent` printed as its type
```

The second form is the one to reach for once you know roughly where you are:
it shows which field holds what, which is the part the `@oxlint/plugins` types
describe but never show applied to real code.

### Testing it

`RuleTester` comes from `oxlint/plugins-dev` and picks up Vitest's global
`describe`/`it`, so a rule test is a normal spec file:

```ts
import { RuleTester } from 'oxlint/plugins-dev'
import { noAmbientClockRule } from './no-ambient-clock.ts'

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } })
const error = { messageId: 'ambientClock' }

tester.run('anti-slop/no-ambient-clock', noAmbientClockRule, {
  valid: ['function age(now: number) {}', 'const d = new Date(iso)'],
  invalid: [{ code: 'const now = Date.now()', errors: [error] }],
})
```

The upstream cases are worth reading before writing your own. The good ones
are not the obvious violations but the near misses that have to stay valid:
a shadowed type parameter with the banned name, an alias that resolves to the
banned type through three hops, the same identifier used as a value rather than
a type. A rule with only obvious cases is a rule that will fire on real code
next week.

### Registering it

Three edits, all required. A rule that is not in all three is silently absent:

1. `tools/oxlint/anti-slop/index.ts`: import it, add it to the `rules` map.
2. `.oxlintrc.json`: `"anti-slop/no-ambient-clock": "error"`.
3. This file's table, if it is a convention worth naming.

Then `pnpm lint:oxlint:check` and see what it finds in the existing code. That
number is the real cost of the rule, and it is the moment to decide whether the
convention is one this codebase actually holds.

## Escape hatches

A rule that is right nine times out of ten still needs a tenth answer.

```ts
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself
export const decodeBackup = (payload: unknown) => …
```

**The directive has to be the line immediately above the code.** A `--` reason
that wraps onto a second `//` line silently moves the target down one line and
the suppression stops working. Put the prose in a comment _above_ the
directive and keep the reason after `--` short. There are four suppressions in
this repo today (`src/db/backup.ts` ×2, `src/db/repositories/support.ts` ×2,
`src/lib/backupFile.ts`) and they are all the same case: the schema decode
boundary, where `unknown` is the correct type and a named one would be the
unchecked claim the rule exists to prevent. The two in `support.ts` are the
generic `rowDecoder` every repository builds its read path from; they used to
be one per repository, and folding the shape into one place folded the
suppressions with it.

`.oxlintrc.json`'s `overrides` are the other hatch, for a directory rather than
a line. `.claude/**` and `.codex/**` opt out of `no-runtime-typeof` there,
because the agent hooks are plain `.mjs` reading hand-written JSON with no type
layer to decode into.

Neither hatch is free. A rule that needs more than a handful of them is a rule
whose premise does not hold here; change or drop the rule instead of papering
over it.

## What we changed

Vendored means ours. The deviations from upstream, each in the file it affects:

- **`no-unknown-returns` skips `defineSlots<…>()`.** A Vue slot entry's return
  type is not a contract anyone reads, and Vue's own `Slot` type returns `any`,
  so `() => unknown` is the _stricter_ thing to write there and flagging it
  would push every `<script setup>` towards the weaker annotation. The
  exemption is scoped to that macro's type argument; `() => unknown` anywhere
  else in the same file is still an error. Sixteen of the nineteen findings on
  first run were this.
- **`no-runtime-typeof` runs with `allowInTypeGuards: true`.** Upstream's
  default bans `typeof` outright. This project decodes with `effect/Schema`
  wherever there is a domain type to decode into. Where there is not, say when
  walking a message catalogue or narrowing a union in a plain `.ts` module, a
  type predicate is the honest tool, and confining the check to one is the point.
- **The whole tree is reformatted to this project's Prettier settings** and
  linted by our ESLint config. To diff against upstream, clone it, run our
  Prettier over its `src/`, and compare.

## Keeping it current

`oxlint`, `@oxlint/plugins`, and `eslint-plugin-oxlint` are pinned together in
`pnpm-workspace.yaml`'s `lint` catalog and have to move together. The JS plugin
API is alpha and explicitly not semver: the AST types change between patch
releases. The move from 1.70 to 1.79 that landed with this plugin was forced by
exactly that. `BindingIdentifier.typeAnnotation` was typed `null` in 1.70, so
a rule reading a `const`'s declared type did not compile.

Upstream changes are pulled by hand, deliberately. Clone `anti-slop`, diff its
`src/` against `tools/oxlint/anti-slop/`, and take what is worth taking. The
whole reason the rules are here rather than in `package.json` is that they are
opinions, and an opinion that arrives by `pnpm update` is one nobody agreed to.
