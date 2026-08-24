# Monitor photo captures

What the vision model actually said about a real photo of a real PM5, saved
word for word. `monitorPhoto.spec.ts` grades the parser against these.

Same rule as [the Bluetooth captures](../pm5/README.md): a capture is
evidence, and evidence that has been interpreted on the way in cannot be used
to check the interpreter. Nothing here is cleaned up, re-spaced or spell
checked — `projted`, `flish` and `87A` are the model's own reading of a
blurry LCD, and the parser has to cope with exactly them.

## The file

One `.txt` per photo, holding the raw reply of
`readMonitorPhoto(photo, MONITOR_PHOTO_TASK)` — Florence-2's transcription,
where every line of text is followed by the eight `<loc_n>` corners of the
box it sat in, in thousandths of the image.

Recorded by running `src/lib/monitorPhotoModel.ts` against the photo. The
model is deterministic (`do_sample: false`), so a re-record of the same photo
on the same weights and quantisation reproduces the file.

## What each file has to say

| File | What the monitor was showing |
| --- | --- |
| `just-row-4559m.txt` | Just Row, mid-piece: `4559 m`, `2:44.5 ave /500m`, `2:30 /500m` current, `20 s/m`, `874 m split`, `4559 projected finish`. No total time anywhere on the screen — the duration has to come from the average split, and 4559 m at 2:44.5 is 25:00. |

That sentence is the assertion. A file with no note is a wall of `<loc_>`
tokens nobody can check a parser against.
