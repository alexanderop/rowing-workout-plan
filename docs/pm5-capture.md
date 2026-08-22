---
type: Playbook
title: Capturing PM5 frames
description: How to record raw Bluetooth frames off a Concept2 PM5 into the fixtures the decoder is graded on.
tags: [erg, bluetooth, fixtures, testing]
status: stable
---

# Capturing PM5 frames

Slice 8 decodes the PM5's Bluetooth notifications into numbers, and it is
written from Concept2's own document — vendored at
[`specs/reference/`](../specs/reference/README.md). What the document cannot
provide is evidence that the reading was right. A decoder tested only against
its author's interpretation is tested against nothing, and a wrong divisor
does not throw: it puts `2:06.3` on screen where the truth was `1:52.4`,
confidently, until a rower notices mid-piece.

So the fixtures have to be **bytes off a real erg**. None of the published PM5
projects ship those — they all store decoded values, the output side — which
is why this harness exists.

## What it does, and what it deliberately does not

`/dev/capture` connects to a PM5, subscribes to the multiplexed characteristic
`ce060080-…`, and writes every notification down as hex exactly as it arrived,
id byte included. It understands nothing about the contents. That is the whole
design: a capture is evidence, and evidence that has been interpreted on the
way in cannot be used to check the interpreter.

The route is spread into the table behind `import.meta.env.DEV`, which Vite
replaces with a literal `false` for a production build — so Rollup drops the
branch, the dynamic import with it, and neither the view nor
`src/lib/ergBluetooth.ts` reaches the shipped bundle. Confirm after a change
with `pnpm build-only && grep -rl ce060030 dist/assets/`, which should find
nothing.

## Getting it onto a phone

**This is the part that catches people out.** Web Bluetooth needs a *secure
context*: HTTPS, or an origin the browser treats as local. A dev server reached
from a phone at `http://192.168.x.x:5173` is neither, and Chrome refuses
without ever showing the device chooser — `isErgBluetoothSupported()` comes
back false and the screen says so.

The clean fix is to make the phone see the dev server as `localhost`:

```bash
pnpm dev                          # on the laptop, port 5173
adb reverse tcp:5173 tcp:5173     # phone plugged in, USB debugging on
```

Then open `http://localhost:5173/dev/capture` **on the phone**. The port is
forwarded over USB, the origin is `localhost`, and Chrome treats it as secure.

Two alternatives, both worse: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
with the LAN origin pasted in (works, and is a flag you will forget you set),
or deploying a build to any HTTPS host.

Bluetooth itself also wants Location enabled on Android, and the page must be
in the foreground — a screen that locks mid-capture stops receiving
notifications.

## Recording a session

1. Turn the erg on and leave the PM5 on its main menu. Do **not** pair it in
   Android's Bluetooth settings; Web Bluetooth does its own pairing and a
   system-level bond can hold the connection.
2. Open `/dev/capture`, tap **Connect and record**, pick the monitor
   (`PM5 4301…`) in Chrome's chooser.
3. Watch the frame list. It should fill immediately, and the hex should
   *change* — a frozen list with a rising count means something is wrong. The
   count alone cannot tell a live stream from a stuck one, which is why the
   last five frames are on screen.
4. Row. A capture is only as useful as what is in it, so cover the states the
   decoder has to handle: sitting still, rowing, resting between reps, and the
   end of the piece.
5. Type what you rowed into **What you rowed** — it is stored in the file, and
   it is what makes the capture checkable later.
6. **Stop**, then **Download**.

Commit the file to `src/__tests__/fixtures/pm5/`. One capture per session,
named for what it is (`six-by-1k.json`, `steady-10k.json`).

### What is worth capturing

The epic's "done when" for slice 8 is a captured 6×1k replaying into the right
splits, so that session is the one that matters. Two more are cheap and worth
having:

- **A short steady piece.** The simplest possible frames, and the baseline for
  "is elapsed time really in hundredths".
- **Thirty seconds of sitting still**, before touching the handle. Every field
  at rest, which is what pins the zero cases and the `255 = invalid` heart rate.

## What happens next

With the file committed, slice 8 decodes it from the interface definition and
asserts the results against what the PM5 was actually showing you. Write the
monitor's own readout into the notes field as you go — "finished 6×1k, avg
1:52.4, 6,000 m, 27:31" — because that turns the capture from bytes into an
assertion.
