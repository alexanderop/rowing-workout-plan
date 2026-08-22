import { describe, expect, it } from 'vitest'
import { buildCapture, captureFilename, downloadCapture, toHex } from '@/lib/ergCapture'

/**
 * The capture file, which is the whole deliverable: slice 8's decoder is
 * graded against these bytes, so anything this module gets wrong is a wrong
 * fixture, and a wrong fixture is worse than none — it makes a broken decoder
 * pass.
 */

const view = (...bytes: Array<number>): DataView => new DataView(new Uint8Array(bytes).buffer)

describe('toHex', () => {
  it('writes every byte as two lowercase digits', () => {
    expect(toHex(view(0x31, 0x00, 0x0f, 0xff))).toBe('31000fff')
  })

  it('pads a byte below sixteen, which is what keeps the string reversible', () => {
    // Without the pad, [0x0a, 0x0b] and [0xab] both come out as "ab" and the
    // capture cannot be read back into the bytes that produced it.
    expect(toHex(view(0x0a, 0x0b))).toBe('0a0b')
    expect(toHex(view(0x0a, 0x0b))).not.toBe(toHex(view(0xab)))
  })

  it('keeps the leading id byte, which is what tells one message from another', () => {
    // The multiplexed characteristic carries the message id in byte 0 —
    // 0x31 is general status, 0x32 additional status. Dropping it would make
    // every frame in the capture anonymous.
    expect(toHex(view(0x31, 0x01)).startsWith('31')).toBe(true)
    expect(toHex(view(0x32, 0x01)).startsWith('32')).toBe(true)
  })

  it('is empty for an empty view rather than throwing', () => {
    expect(toHex(view())).toBe('')
  })

  it('reads the whole 19-byte payload a general status frame carries', () => {
    const frame = Array.from({ length: 20 }, (_unused, index) => index)

    expect(toHex(view(...frame))).toHaveLength(40)
  })
})

describe('buildCapture', () => {
  const fields = {
    capturedAt: 1_755_900_251_000,
    device: 'PM5 430123456',
    notes: "6 x 1k / 1' rest",
    service: 'ce060030-43e5-11e4-916c-0800200c9a66',
    characteristic: 'ce060080-43e5-11e4-916c-0800200c9a66',
    frames: [{ at: 0, hex: '3100' }],
  }

  it('stamps the file with a version, so an old capture stays readable', () => {
    expect(buildCapture(fields).version).toBe(1)
  })

  it('keeps everything it was given', () => {
    expect(buildCapture(fields)).toMatchObject(fields)
  })

  it('records which characteristic the frames came off', () => {
    // A capture that does not say what it captured is a capture nobody can
    // check against the interface definition.
    expect(buildCapture(fields).characteristic).toContain('ce060080')
  })
})

describe('captureFilename', () => {
  it('is stamped with the capture time, to the second', () => {
    expect(captureFilename(Date.UTC(2026, 7, 22, 19, 4, 11))).toBe(
      'pm5-capture-2026-08-22T19-04-11.json',
    )
  })

  it('has no colons in it, which Windows will not save', () => {
    expect(captureFilename(Date.UTC(2026, 7, 22, 19, 4, 11))).not.toContain(':')
  })

  it('sorts chronologically as text, which is how the files will be read', () => {
    const earlier = captureFilename(Date.UTC(2026, 7, 22, 9, 0, 0))
    const later = captureFilename(Date.UTC(2026, 7, 22, 19, 0, 0))

    expect([later, earlier].toSorted()).toEqual([earlier, later])
  })
})

describe('downloadCapture', () => {
  it('hands over pretty-printed JSON under the stamped name', async () => {
    const payload = buildCapture({
      capturedAt: Date.UTC(2026, 7, 22, 19, 4, 11),
      device: 'PM5',
      notes: '',
      service: 'a',
      characteristic: 'b',
      frames: [{ at: 12, hex: '3100' }],
    })
    const saved: Array<{ blob: Blob; filename: string }> = []

    downloadCapture(payload, (blob, filename) => saved.push({ blob, filename }))

    expect(saved).toHaveLength(1)
    const [only] = saved
    expect(only?.filename).toBe('pm5-capture-2026-08-22T19-04-11.json')
    expect(only?.blob.type).toBe('application/json')

    const text = (await only?.blob.text()) ?? ''
    // Indented on purpose: these files get read and diffed by hand.
    expect(text).toContain('\n  "frames"')
    expect(JSON.parse(text)).toEqual(payload)
  })
})
