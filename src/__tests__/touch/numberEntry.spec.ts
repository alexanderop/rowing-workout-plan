import { describe, expect } from 'vitest'
import { it } from '../fixtures'

/**
 * The premise of the pad, under the pointer it was built for.
 *
 * `inputmode="numeric"` raises a keyboard with no colon on it in iOS Safari,
 * which is why a time was slow to type here. The fix was not a better
 * inputmode — it was leaving no text field for a software keyboard to open
 * over. That is a claim about the DOM, so it is asserted against the DOM.
 */
describe('touch number entry', () => {
  it('runs under a coarse pointer', async ({ log }) => {
    const screen = await log()
    await screen.expectReady()

    expect(matchMedia('(pointer: coarse)').matches).toBe(true)
  })

  it('has no text field in the sheet for a software keyboard to answer', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    const dialog = screen.sheet.anyDialog.element()

    expect([...dialog.querySelectorAll('input, textarea, [contenteditable]')]).toEqual([])
  })

  it('enters a whole workout without a keyboard ever appearing', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    await screen.sheet.fill({ distance: '10000', time: '42:00' })

    await screen.sheet.expectResult('2:06.0 /500m · 175 W')
    expect([...document.querySelectorAll('input')]).toEqual([])
  })
})
