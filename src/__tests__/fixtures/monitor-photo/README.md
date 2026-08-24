# Monitor photo captures

What the on-device text recogniser actually said about a real photo of a real
PM5, saved word for word. `monitorPhoto.spec.ts` grades the parser against
these.

Same rule as [the Bluetooth captures](../pm5/README.md): a capture is evidence,
and evidence that has been interpreted on the way in cannot be used to check the
interpreter. Nothing here is cleaned up, re-spaced or spell checked — `splt`,
`prolected`, `Iinlsh` and the `rn` where the screen says `m` are the recogniser's
own reading of a blurry LCD, and the parser has to cope with exactly them.

## The files

One `.json` per photo, holding the array `readMonitorPhoto(photo)` resolved
with: every line of text the recogniser read, the box it sat in as pixels of
the photo, and how sure it was.

Recorded by running `src/lib/monitorPhotoModel.ts` — the shipped module, in
the built app, in Chromium — against the photo.

**A re-record reproduces the file per backend, not across them.** Both models
are convolutional and take no samples, so the same weights on the same
execution provider give the same answer every time. WebGPU and WASM do not
agree to the last bit, though, and the difference reaches the text: the same
`m` that one reads as `m`, the other reads as `rn`. So the two captures here
are deliberately one of each — `just-row-4559m.json` on WebGPU,
`just-row-4559m-close.json` on WASM — and the parser has to hold for both.

To pin a recording to the WASM path, take the property the module checks off
the prototype before importing it: `delete Navigator.prototype.gpu`.

## What each file has to say

### `just-row-4559m.json`

Just Row, mid-piece: `4559 m`, `2:44.5 ave /500m`, `2:30 /500m` current,
`20 s/m`, `874 m split`, `4559 projected finish`. No total time anywhere on
the screen — the duration has to come from the average split, and 4559 m at
2:44.5 is 25:00.

### `just-row-4559m-close.json`

The same screen, photographed closer, so the LCD fills more of the frame.
Reads to the same row. It is here because it is the photo the previous model
failed: Florence-2 read the stacked `s/m` beside the stroke rate as a plain
`m`, which handed the distance field to the `:00` next to it.

Those sentences are the assertions. A file with no note is a wall of boxes
nobody can check a parser against.

## What is in them that is not text

The recogniser is shown a photograph of a machine, not a page, so it also
reads the PM5's six round rubber buttons and the edges of its frame. Those
lines are in the captures and they are not trimmed out — a capture with the
awkward rows removed would prove nothing about the rules that exist to
survive them.

Being unsure is not what marks a button out. They run well up into the range
the real lines occupy, so the confidence column sorts nothing on its own —
which is why the parser leans on how tall a line is, and treats confidence
only as a floor under the worst of it.
