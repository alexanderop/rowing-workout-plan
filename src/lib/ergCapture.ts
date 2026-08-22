import { downloadBlob } from './download'

/**
 * Recording raw PM5 notifications into a file, with nothing interpreted on
 * the way.
 *
 * This is the other half of the evidence argument in `ergBluetooth.ts`. The
 * decoder in slice 8 is written from Concept2's interface definition, and a
 * decoder tested only against its author's reading of a document is tested
 * against nothing — so the fixtures it is graded on have to come from a real
 * erg, and they have to be *bytes*. Every published PM5 project stores decoded
 * values instead, which is why none of them could be used here.
 *
 * Platform edge: the clock, the DOM and the download all live at this
 * boundary. No decoding, deliberately: the only transformation is bytes to
 * hex, which is reversible and therefore not an opinion.
 */

/** One notification, as it arrived. */
export interface CapturedFrame {
  /** Milliseconds since the capture started. Relative, so a file is portable. */
  readonly at: number
  /** The whole value, id byte included, lowercase and unseparated. */
  readonly hex: string
}

/** The file the harness writes, and slice 8's fixtures are cut from. */
export interface CapturePayload {
  readonly version: number
  /** Wall clock at the first frame, so a capture can be dated. */
  readonly capturedAt: number
  readonly device: string
  readonly service: string
  readonly characteristic: string
  /** What was actually rowed, in the capturer's words. */
  readonly notes: string
  readonly frames: ReadonlyArray<CapturedFrame>
}

/** Bumped when the file's shape changes, so an old capture is still readable. */
const CAPTURE_VERSION = 1

/**
 * A `DataView` as lowercase hex.
 *
 * The view is the browser's own buffer and is reused between notifications,
 * so this reads it out immediately rather than storing it — a stored view is
 * a window onto whatever arrived last, which produces a capture where every
 * frame is identical and nothing says so.
 */
export function toHex(value: DataView): string {
  let hex = ''
  for (let index = 0; index < value.byteLength; index += 1)
    hex += value.getUint8(index).toString(16).padStart(2, '0')

  return hex
}

export function buildCapture(fields: {
  capturedAt: number
  device: string
  notes: string
  service: string
  characteristic: string
  frames: ReadonlyArray<CapturedFrame>
}): CapturePayload {
  return { version: CAPTURE_VERSION, ...fields }
}

/**
 * `pm5-capture-2026-08-22T19-04-11.json`.
 *
 * Colons are replaced because Windows will not have them in a filename and
 * silently mangles the download; the rest of the ISO stamp is kept so the
 * files sort chronologically wherever they land.
 */
export function captureFilename(capturedAt: number): string {
  const stamp = new Date(capturedAt).toISOString().slice(0, 19).replaceAll(':', '-')

  return `pm5-capture-${stamp}.json`
}

/**
 * Hand the capture to the browser as a file.
 *
 * The sink is a parameter with the real one as its default, so a spec passes
 * a stand-in instead of mocking the module out from under it — the same
 * injection `startPeriodicUpdateCheck` uses for a registration. Indented
 * JSON on purpose: these files get read and diffed by hand.
 */
export function downloadCapture(
  payload: CapturePayload,
  save: (blob: Blob, filename: string) => void = downloadBlob,
): void {
  const json = JSON.stringify(payload, undefined, 2)

  save(new Blob([json], { type: 'application/json' }), captureFilename(payload.capturedAt))
}
