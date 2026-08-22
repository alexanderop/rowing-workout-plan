---
type: Playbook
title: Driving the app with agent-browser
description: How an agent verifies a feature end to end in a real browser before claiming it works, and what the test tiers cannot tell it.
tags: [testing, browser-automation, agent-browser, verification, pwa]
status: stable
---

# Driving the app with agent-browser

`agent-browser` is a CLI that drives a real Chromium over CDP. It is installed
globally, it needs no dependency in this repo, and it is how an agent sees the
feature it just built. The rule it exists for:

> A change is not verified because `pnpm check` passed. It is verified when the
> flow has been walked in a browser, clicked, typed, saved and reloaded, and the
> data was still there.

The [test tiers](testing-strategy.md) grade whether the code is right. This
grades whether the app _is_ right: the sheet actually opens, the keyboard inset
does not eat the save button, the note survives a reload. Those are the things a
green suite has been known to lie about, and they are the whole product in a
[local-first](local-first.md) PWA.

Read the CLI's own guide before the first command in a session, with
`agent-browser skills get core --full`. It ships with the binary, so it is
always version-matched, and it covers the parts this document does not repeat
(auth vaults, network routing, tracing, tabs, iOS simulator).

## When to reach for it

| Reach for it                                                             | Instead of                        |
| ------------------------------------------------------------------------ | --------------------------------- |
| Finishing a feature, to walk the new flow before saying it works         | Claiming done off `pnpm check`    |
| A layout, safe-area, or keyboard bug that only shows on a phone viewport | Guessing from the CSS             |
| "Does this persist?"                                                     | Reading the repository code again |
| Reproducing a bug report                                                 | Writing the fix first             |

It is not a test tier. Nothing it does is committed, nothing it does runs in
CI. When a walkthrough finds a real bug, the fix ships with a test in the tier
that owns it, and the browser walk is what told you which tier that is.

## The loop

```bash
pnpm dev                                        # in a background shell, :5173

agent-browser --session-name vps set device "iPhone 15"
agent-browser --session-name vps open http://localhost:5173
agent-browser --session-name vps wait --text "Notes"     # ← see below, this matters
agent-browser --session-name vps snapshot -i
agent-browser --session-name vps click @e4
```

`snapshot -i` prints the accessibility tree of the interactive elements with
`@eN` refs, a few hundred tokens instead of a DOM dump, and it reads the app
the way a screen reader does, so a control missing its label is visible right
there:

```text
- heading "Notes" [level=1, ref=e2]
- navigation "Main navigation" [ref=e1]
  - button "Notes" [ref=e3]
  - button "Add a note" [ref=e4]
  - button "Settings" [ref=e5]
```

`--session-name` keeps one browser across commands and is worth passing every
time: without it, parallel work in another session shares the same default
browser.

### Refs go stale, and this app hydrates late

Every snapshot renumbers the refs, so a ref taken before the page changed points
at nothing you meant. In this app that bites at the very first command, because
the routes are lazy (`() => import('@/views/NotesView.vue')`). Open the page and
snapshot immediately, and you get the shell's bottom nav with no view under it.
The refs shift the moment the view mounts, and the next click lands somewhere
else and reports `✓ Done` while doing nothing.

**Wait for something the view owns before the first snapshot**, and re-snapshot
after anything that changes the page: a route change, a sheet opening, a write
landing. When a ref click silently does nothing, a stale ref is the first
suspect, not the code.

`find` sidesteps refs entirely and is the more durable form for controls you can
name, since it resolves at click time:

```bash
agent-browser --session-name vps find role button click --name "Add a note"
agent-browser --session-name vps find label "Title" fill "Buy milk"
```

### Wait for the thing, not for a duration

`wait --text` and `wait @ref` need the string to actually exist. `wait --text
"Add note"` sits there for the full timeout because the sheet's heading is
`notes.form.heading`, which is "New note". Take the wording from
`src/i18n/messages/en.ts` rather than from memory, or wait for a ref.

## Walking a note end to end

The canonical check for this codebase, capture then persist then survive a
reload, verified against the dev server:

```bash
agent-browser --session-name vps find role button click --name "Add a note"
agent-browser --session-name vps find label "Title" fill "Buy milk"
agent-browser --session-name vps find label "Note" fill "Oat, from the corner shop"
agent-browser --session-name vps find role button click --name "Save"
agent-browser --session-name vps wait --text "Buy milk"

agent-browser --session-name vps reload
agent-browser --session-name vps wait --text "Buy milk"   # ← the local-first claim
```

That last line is the assertion. Everything before it is setup.

### Reading IndexedDB directly

The UI showing a note is not proof of what landed on disk. Read the rows:

```bash
cat <<'EOF' | agent-browser --session-name vps eval --stdin
(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('vue-pwa-starter')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const rows = await new Promise((resolve, reject) => {
    const req = db.transaction('notes').objectStore('notes').getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return rows.map((r) => ({ title: r.title, pinned: r.pinned }))
})()
EOF
```

```json
[{ "pinned": false, "title": "Buy milk" }]
```

Two mechanics that cost a round trip each if you learn them the hard way.
`eval` runs a plain script body, so top-level `await` is a syntax error: wrap
async work in an `(async () => { … })()` IIFE, whose promise the CLI awaits. And
use the `--stdin` heredoc for anything with quotes; inline `eval "…"` only
survives simple expressions.

This is also how you check a migration: write a row in the old shape, reload,
and read back what the converter produced.

### Resetting between runs

State is the point of this app, so it persists across your walkthroughs too. A
note left over from the last run will sit at the top of the list and make the
next one lie. Wipe the database and reload:

```bash
cat <<'EOF' | agent-browser --session-name vps eval --stdin
(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('vue-pwa-starter')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  return 'deleted'
})()
EOF
agent-browser --session-name vps reload
agent-browser --session-name vps wait --text "No notes yet"
```

Dexie holds the connection open, so the delete fires `blocked` and only
completes once the reload drops it. The reload is part of the recipe, not a
nicety, and the empty state is how you know it worked.

## Looking at it

This shell is mobile-first, so drive it at a phone size or you are checking a
layout no user has:

```bash
agent-browser --session-name vps set device "iPhone 15"
agent-browser --session-name vps set media dark             # or light
agent-browser --session-name vps screenshot notes-dark.png  # --full for scroll height
```

Read the screenshot back. It is the only check that catches a safe-area
misfire, an overlapping sheet, or text the theme made invisible, none of which
show up in a snapshot tree or a passing spec.

Screenshots taken this way are not visual-tier baselines. The
[visual tier](testing-strategy.md) owns those, its baselines are
platform-specific, and `pnpm test:visual:update` is the only thing that writes
them. Save yours somewhere temporary.

## Errors the app swallowed

```bash
agent-browser --session-name vps console      # console log, --clear to reset
agent-browser --session-name vps errors       # uncaught page errors
```

Worth a look after any walkthrough. Plenty of what this codebase does
deliberately fails quietly. `src/lib/persistentStorage.ts` logs a `console.debug`
and moves on, by design (see the Effect boundary rule in the [knowledge index](index.md)), so
`console` is where those decisions become visible. An uncaught error in
`errors` is never fine.

## What the dev server cannot tell you

`pnpm dev` runs the service worker (`devOptions.enabled` in `vite.config.ts`),
which makes offline _look_ verifiable:

```bash
agent-browser --session-name vps set offline on
agent-browser --session-name vps reload
```

Treat that as a smoke check only. The dev SW precaches a different asset graph
than the built one, so it proves the app tolerates a dead network, not that the
shipped bundle does. The real answer is the e2e tier, which runs against
`vite preview` and asserts the worker actually served the reload
(`test/e2e/features/notes.feature`). If you want to drive the production build by
hand, point the CLI at `pnpm build && pnpm preview` instead of the dev server.

Two more things it will not tell you. It is not an accessibility audit:
`pnpm test:a11y` runs axe, while the snapshot tree only shows you what a control
is named. And a single walkthrough is not a regression test. It goes stale the
moment you close the browser, which is why anything it finds ends up in a tier.

## Cleaning up

```bash
agent-browser close --all
```

Leave the browser running across a session's commands; close it when you are
done. Kill the dev server too. A stray `vite` on :5173 will serve stale code to
the next run and cost someone an hour.
