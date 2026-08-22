---
type: Architecture Decision
title: Mutation testing
description: Why Stryker grades the unit tier only, how the scope is drawn, and how to read a surviving mutant.
tags: [testing, mutation-testing, stryker, vitest, ci]
status: stable
---

# Mutation testing

Coverage says a line ran. Mutation testing says an assertion cared. Stryker
changes one operator, literal, or branch at a time and reruns the tests: a
mutant that dies was caught, a mutant that survives is a line your tests
execute without checking.

```bash
pnpm test:mutation                              # ~10 s, whole scope
pnpm exec stryker run -m src/db/converters.ts   # one file
```

The HTML report lands in `reports/mutation/mutation.html` (gitignored).

## It grades the unit tier, and only the unit tier

`stryker.config.mjs` points `vitest.configFile` at `vitest.unit.config.ts`, not
at `vitest.config.ts`. This is the load-bearing choice, for two reasons.

Stryker's runner calls `createVitest()` once and then adopts every project in
the config it is handed. Aiming it at `vitest.config.ts` would boot the three
Playwright browser projects once per Stryker worker, and Stryker's default
concurrency is `n-1` cores. A run that takes ten seconds against the Node tier
takes tens of minutes against the browser tiers.

The deeper reason is the same one behind the [tiers](testing-strategy.md): a
mutant is only informative if some test _could_ have caught it. Grading pure
logic against the tier that owns pure logic gives a number that means something.
Grading it against a tier that never loads the file gives you a survivor that
says nothing except "wrong tier".

## Drawing the scope

Stryker's default `mutate` glob covers `src/**` including `.vue`, since its
instrumenter really does parse SFC `<script>` blocks. Left at the default, every
mutant outside the unit tier's reach survives by construction and buries the
handful that matter. So the scope is written out by hand, and the rule for
editing it is: a file belongs in `mutate` when the unit tier owns its logic
end to end.

Three things are deliberately outside it:

- `src/db/repositories/**`. Half of `notes.ts` is the Dexie-backed layer,
  which only the browser tier exercises; the other half is the in-memory fake.
  Mutating a test double grades the double, not the product. When the first run
  included this file, 57 of its mutants came back "no coverage" and dragged the
  headline score from 85% to 44% while saying nothing about test quality.
- `src/db/generateId.ts` and `src/lib/observability.ts`, a `crypto.randomUUID`
  wrapper and a `import.meta.env.DEV` gate. Every mutant there is equivalent.
- The browser half of `src/lib/backupFile.ts`. `downloadBackup` and
  `readBackupFile` touch `Blob`/`File`. They sit under a `// Stryker disable
all` comment rather than being excluded with the file, because
  `backupFilename` above them is pure, unit-tested, and worth grading.

Prefer a `// Stryker disable` comment in the source over a `mutate` exclusion
when only _part_ of a file is out of reach. It survives refactors that line
ranges do not, and it explains itself where the next reader is already looking.

## Mutants no test can kill

Some survivors are not missing assertions. Marking those with a reason is the
honest response; writing a test that asserts something no one should depend on
is not. There are two kinds here, and they are different.

### Equivalent mutants

An equivalent mutant changes the code without changing its behavior. This
codebase has one recurring class: span names. Every repository
method is an `Effect.fn('NotesRepo.list')` and `exportData` ends in
`Effect.withSpan('Backup.exportData')`. That naming _is_ the instrumentation
(see the observability note in the [knowledge index](index.md)), but it is observability, not
behavior. Mutating `Effect.fn('Notes.noteAge')` to `Effect.fn('')` changes
nothing a unit test should assert. Those sites carry:

```ts
// Stryker disable next-line StringLiteral: the span name is observability, not behavior. No unit test should assert it
```

**`disable next-line` attaches to a syntax node, not to a line number.** The
comment has to sit immediately above the mutated expression. Putting it above
`).pipe(Effect.withSpan('Backup.exportData'))` silently did nothing, because the
comment landed between the call's arguments and the closing paren; breaking the
pipe across lines so the comment sits directly on the `Effect.withSpan(...)`
argument worked. If a disable comment appears to be ignored, that is why. Check
the reported mutant location against what the comment is actually touching.

Reach for the block form (`// Stryker disable X` … `// Stryker restore X`) only
when the whole range is genuinely exempt. Wrapping `exportData` in it to silence
the span name would also have exempted `app: 'vue-pwa-starter'`, a string
literal that a test does and should assert on.

The same trap catches `disable next-line`, because a mutator name covers _every_
mutant of that kind on the line. Silencing two unkillable `Regex` mutants on
`ISO_DATE` also silenced six the tests were killing, and the score went to 100%
by deleting the evidence. If suppressing a survivor drops the file's mutant
count by more than the survivors, it suppressed too much.

If a fourth or fifth of these appears, the pattern is worth an [ignore
plugin](https://stryker-mutator.io/docs/stryker-js/configuration/#ignorers)
instead of a comment per site. `packages/instrumenter/src/frameworks/angular-ignorer.ts`
in the Stryker reference is a working template, and `Effect.fn(<span name>)` is
a single-predicate match.

### Mutants killed where the runner cannot see it

The second kind is not equivalent at all. The mutant _is_ caught, just not as
a failing assertion. Emptying the field list of `DbNote` or `NoteDraft` in
`converters.ts` makes `DbNote.fields.pinned` undefined, so `Schema.optionalKey`
throws while `StoredDbNote` is still being constructed at module scope. Every
test file that imports the module then fails to load.

Vitest reports that as four failed _files_ and zero failed _tests_. Stryker's
vitest runner collects results by walking the test cases inside each collected
file ([`collectTestsFromSuite`](https://github.com/stryker-mutator/stryker-js/blob/master/packages/vitest-runner/src/vitest-helpers.ts)),
and a file that never finished importing contributes none, so it sees an
all-green run and reports the mutant as survived. No assertion can fix this;
the module the assertion would live in is the one that will not load.

These carry a `// Stryker disable next-line ObjectLiteral` naming the real
reason. Worth knowing generally: a mutant that breaks module initialization
is invisible to this runner, so a survivor on a top-level declaration is worth
checking with `pnpm test:unit` against the mutant applied by hand before
assuming the tests are at fault.

## How to read a survivor

A survivor is a question, not a verdict. Work through it in this order:

1. **Is it equivalent?** Can any observable behavior distinguish the mutant from
   the original? If not, mark it with a reason and move on.
2. **Is it in the right tier?** If the covering test lives in the browser tier,
   the survivor is a scope bug. Fix `mutate`, not the test.
3. **Otherwise it is a missing assertion.** Write the test that kills it.

The scope sits at 100%: 58 mutants, all killed, nothing uncovered. It did
not start there. The first run scored 86.89% with eight survivors, and each one
resolved to a different step of the list above, which makes them the worked
examples:

**Missing assertions (step 3), in `domain.ts`.** `if (elapsed < HOUR)` and
`if (elapsed < DAY)` both survived flipping to `<=`. The spec pinned the
60-_second_ boundary exactly and then tested the hour and day buckets from the
middle, at 90 minutes and 3 days. `<` and `<=` agree everywhere except at the
boundary itself, so a test from the middle of a bucket passes under both and
says nothing about which one is written. Two tests at exactly 60 minutes and
exactly 24 hours killed them. The fix is the general shape: an off-by-one
survivor means the test is standing somewhere other than the edge.

**A design problem wearing a survivor's clothes, in `backupFile.ts`.** Both
anchors of `/^\d{4}-\d{2}-\d{2}$/` survived, and the reason was that
`exportedAt.slice(0, 10)` had already bounded the input to exactly the pattern's
width, so the anchors could not match anything the slice had not already
guaranteed. Not a missing test: unreachable code. Dropping the slice and reading
the match off `/^\d{4}-\d{2}-\d{2}/` directly made the anchor load-bearing again,
killable by one test (`'junk 2026-08-07'` must not name a file), and shorter.
A survivor on a guard is sometimes telling you the guard is redundant, and
deleting the redundancy beats suppressing the mutant.

**A public contract nothing asserted, also in `backupFile.ts`.** The
`'BackupFile.BackupFileError'` tag and the error's field list both survived.
`SettingsView.vue` matches that tag in an exhaustive `Effect.catchTags` and
builds its log record from `operation`, so both are a contract with a caller,
one the type system cannot point at, since the match is by string. Now pinned.

**Two the runner cannot see, in `converters.ts`**, the import-time kills
described above.

Note what none of these were. Every one of those files had full line coverage.
They had tests that _exercised_ a guard and never _challenged_ it, which is the
gap mutation testing exists to find and coverage cannot.

## Where it runs

Its own CI job on every PR (`.github/workflows/ci.yml`), and never in the
pre-commit hook or `pnpm check`. Those are sub-15-second gates and this is a
ten-second one that will grow with the scope.

`thresholds.break` fails the build under 90, against a scope that is at 100. The
gap is not slack for new survivors. It is there because part of the unit tier is
property-based and fast-check draws a fresh seed per run, so a mutant that only
some inputs distinguish can flicker between killed and survived. Ten points
absorbs that. Six survivors do not fit in it.

`incremental: true` caches verdicts for unchanged code in `reports/`, which is
gitignored. Locally the second run is near-instant; CI always runs cold.

## Version coupling

`@stryker-mutator/vitest-runner` resolves the project's own `vitest/node` out of
the sandbox rather than using its bundled copy. That is deliberate on Stryker's
side and it is what makes `@effect/vitest` work here: a plugin that registers
itself on the project's Vitest instance while Stryker loads a second instance
produces "no tests found" rather than an error. The runner is developed against
the vitest it expects to find, so the two pins in `pnpm-workspace.yaml` move
together, 9.6.x against vitest 4.1.x.
