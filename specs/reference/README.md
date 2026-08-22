# Reference documents

Third-party specifications the trainer's decoding is built from. Vendored
rather than linked because a byte layout read from a dead URL is a byte layout
nobody can check, and because slices 8–11 are unbuildable without it.

## PM5_BluetoothSmartInterfaceDefinition.pdf

_Concept2 Performance Monitor Bluetooth Smart Communications Interface
Definition_, revision 1.30, dated 2 March 2022. 39 pages.

|           |                                                                                             |
| --------- | ------------------------------------------------------------------------------------------- |
| Source    | `http://www.concept2.co.in/files/pdf/us/monitors/PM5_BluetoothSmartInterfaceDefinition.pdf` |
| Retrieved | 22 August 2026                                                                              |
| SHA-256   | `874b776908a9303fe91c6b860223fe23f3682f619752e5ed3c2c261c8b828e8e`                          |
| Copyright | Concept2, Inc. Redistributed here for reference; not ours to license.                       |

**The URL is a regional mirror, and that is not a mistake.** The same path
under `www.concept2.com` and `www.concept2.co.uk` returns a 404 HTML page,
and Concept2's own developer hub
([c2usa.fogbugz.com/?W193758](https://c2usa.fogbugz.com/?W193758)) links the
USB SDK and the logbook API but not this document. The `.co.in` and `.cn`
mirrors serve it. The checksum above is what makes the copy in this repository
verifiable regardless of which mirror survives.

### What it is the authority for

Everything slices 8–11 decode. In particular **Table 4 — C2 Multiplexed
Information: Data Definitions** (from page 25), which gives the field order
and the scaling for each multiplexed message id:

- `0x0031` general status (19 bytes) — elapsed time 0.01 s lsb, distance 0.1 m
  lsb, workout/interval/workout/rowing/stroke state enums, total work distance,
  workout duration and its type, drag factor.
- `0x0032` additional status 1 (19 bytes) — speed 0.001 m/s lsb, stroke rate,
  heart rate (255 = invalid), current and average pace 0.01 s lsb, rest
  distance and time, average power, erg machine type.
- The remaining ids, plus Appendix A's enumerated values, on the pages after.

Three-byte fields are little-endian lo/mid/hi triples, and the multiplexed
byte length **excludes** the leading id byte — so a notification is N+1 bytes.

**Read the offsets and scalings out of this document, never out of a
recollection or out of another implementation.** A wrong divisor does not
throw: it renders `2:06.3` where the truth was `1:52.4`, passes every test
written against the same wrong assumption, and is found by a rower mid-piece.
That is the whole reason the epic marks slice 8 "cannot start from memory".

### Prior art, for cross-checking only

Neither is vendored, and neither is the authority. Read them the way you would
read a second opinion — after the document, not instead of it.

- [ergarcade/pm5-base](https://github.com/ergarcade/pm5-base) (MIT) — browser
  Web Bluetooth and Web HID, plain classes, no build step. `lib/pm5-ble.js`
  decodes the same multiplexed ids and cites this document by page. The closest
  prior art to what slice 8 needs.
- [tijmenvangulik/ErgometerJS](https://github.com/tijmenvangulik/ErgometerJS)
  (Apache-2.0) — the veteran PM3/4/5 driver, BLE and USB, TypeScript.

### What is still missing

Raw frames captured off a real erg, for `src/__tests__/fixtures/pm5/`. The
published projects store **decoded** values rather than the bytes they came
from — `ergarcade/pm5-dump`'s `dumps/*.json` are objects like
`{ elapsedTime: 0, distance: 0, … }` — so none of them substitutes for a
capture. A decoder tested only against its own author's assumptions is tested
against nothing.
