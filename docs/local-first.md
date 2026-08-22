---
type: Architecture Decision
title: Local-first
description: Which Ink & Switch local-first ideals this starter commits to, and how the data layer implements them.
tags: [local-first, data, indexeddb, rationale]
status: stable
---

# Local-first

This starter follows the [Ink & Switch local-first ideals](https://www.inkandswitch.com/local-first/). The ones that shape the code:

1. **No spinners.** Every interaction hits IndexedDB on-device; nothing blocks on a network.
2. **Network optional.** The service worker precaches the app; it boots and works fully offline.
3. **The Long Now.** Data written today has to be readable by every future version of the app.
4. **Security and privacy by default.** Data never leaves the device.
5. **Ownership and control.** The user can export everything, any time, as plain JSON.

## How the data layer implements this

### One way in

All storage access goes through `src/db/index.ts`. Views, features, and composables import repositories from there, never Dexie directly. The ESLint boundary rules and the architecture tests enforce this, and it is what keeps the storage engine swappable, say for a future sync engine.

### Schema changes are migrations plus converters, always both

`src/db/schema.ts` shows the worked example (v1 → v2 adds `pinned` and `updatedAt`):

- **The Dexie `upgrade()`** rewrites rows already in the database when the app updates.
- **The converter** (`src/db/converters.ts`) decodes and normalizes _any_ stored row into a complete domain object at read time.

Why both? Because the migration only sees rows that were in the database at upgrade time. Old JSON backups imported later, or rows arriving from a future sync peer, bypass it. The stored schema (`StoredDbNote`) keeps old-shape fields optional, so the compiler forces every read through the converter. The rule:

> Never trust the shape of stored data; trust the converter.

"Never trust" is meant literally: a table's TypeScript type is a claim, not a check. IndexedDB rows outlive app versions, get restored with a profile, and are editable from devtools, so `NotesRepo.list` decodes every row against the schema and fails with a `DatabaseError` when one does not match. One bad row fails the whole read on purpose. `StoredDbNote` accepts every shape this app has ever written, so a row that misses it is damaged rather than old, and silently dropping it would show a short list the user might then export over their last good backup.

The same schema does triple duty: Dexie's table typing, that read-path decode, and backup validation in `src/db/backup.ts`. One definition means a field added to a note cannot reach disk while quietly disappearing from every export.

All three paths are tested: the upgrade in `src/__tests__/db/migration.spec.ts`, the decode and converter rules in the unit tier, the rejected-row path in `src/__tests__/db/notes.spec.ts`, and the backup round-trip in `src/__tests__/db/backup.spec.ts`, which imports a v1-era file.

### Persistent storage is requested at boot

`src/lib/persistentStorage.ts` calls `navigator.storage.persist()` from `src/main.ts`. Without it the origin's storage is _best effort_, and browsers treat that literally: Safari clears IndexedDB after seven days without a visit, Chrome and Firefox clear it when the disk gets tight. There is no server copy here, so eviction is not a cache miss. It is the user's data, gone.

The request can be denied, and browsers decide on their own engagement heuristics (installed to the home screen, bookmarked, used often). The outcome is logged, never surfaced: "the browser might delete your notes" is not something a user can act on. What they can act on is the export, which is why it exists.

The same quota is what the runtime caches in `vite.config.ts` draw from. See the note there on why the cache routes are restricted to same-origin requests.

### Export/import

`src/db/backup.ts` exports the whole database as versioned, human-readable JSON and validates imports with zod. The settings screen wires both up. When you add a table, add it to the backup payload in the same commit. A backup that silently misses a table is worse than none.

### Deleting everything

Ownership cuts both ways: if the data is the user's, so is the decision to be rid of it. `src/db/deleteAll.ts` empties every table behind the "Delete everything" control in settings — a confirmation first, and a program that runs through `dbMutation` so every screen re-reads rather than showing rows that are gone. It clears the tables rather than dropping the database, because dropping it takes the schema with it and leaves every open connection reading something that no longer exists (`resetDatabase` still does that, for test isolation only).

A new table has to be added to `deleteAllData` in the same commit too, for the mirror image of the backup reason: a table left out survives a wipe the user asked for. The unit tier asserts the wipe through `exportData`, so the two lists are checked against each other rather than both being trusted.

Preferences — theme, language, the dismissed install hint — are deliberately not touched. They are settings rather than data, and someone deleting their rowing history did not ask to be handed the app in a language they do not read.

### What is deliberately out of scope

Multi-device sync and CRDTs. The seams for them exist (single db entry point, converters, versioned export), but the starter stays honest: it ships what it tests.
