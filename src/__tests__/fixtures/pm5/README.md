# PM5 captures

Raw Bluetooth notifications recorded off a real Concept2 PM5, as hex. Slice 8's
decoder is graded against these.

Empty until a capture lands. **That is the outstanding blocker on slice 8** —
the decoder can be written from
[`specs/reference/`](../../../../specs/reference/README.md), but a decoder
tested only against its author's reading of a document is tested against
nothing.

Record one with `/dev/capture`; the how, and the secure-context problem that
stops it working from a phone, are in
[docs/pm5-capture.md](../../../../docs/pm5-capture.md).

## The file

```json
{
  "version": 1,
  "capturedAt": 1787432577181,
  "device": "PM5 430123456",
  "service": "ce060030-43e5-11e4-916c-0800200c9a66",
  "characteristic": "ce060080-43e5-11e4-916c-0800200c9a66",
  "notes": "6 x 1k / 1' rest — finished 27:31, avg 1:52.4, 6,000 m",
  "frames": [{ "at": 7, "hex": "31000000..." }]
}
```

`at` is milliseconds since the capture started, so a file is portable. `hex` is
the whole notification **including the leading id byte** — `0x31` is general
status, `0x32` additional status 1 — because that byte is what tells one
message from another.

Nothing in the file is decoded, deliberately. A capture is evidence, and
evidence that has been interpreted on the way in cannot be used to check the
interpreter.

## What to put in `notes`

Whatever the monitor was showing when you stopped. That sentence is what turns
a wall of hex into an assertion: "avg 1:52.4 over 6,000 m in 27:31" is the
answer slice 8's decoder has to arrive at from these bytes.
