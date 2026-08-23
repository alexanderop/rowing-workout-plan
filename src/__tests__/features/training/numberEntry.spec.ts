import { describe, expect } from 'vitest'
import { userEvent } from 'vitest/browser'
import { it } from '../../fixtures'

/**
 * Every number in this app is entered the same way: a trigger that reads out
 * its value, and a pad that edits a draft of it.
 *
 * The mask is unit-tested in `unit/lib/numericInput.spec.ts`. What is here is
 * the part the mask cannot promise on its own — that the draft is transactional,
 * that a physical keyboard reaches it, and that a field which needs no
 * suggestions offers none.
 */
describe('number entry', () => {
  it('types a time from digits, so the colon is never typed', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    await screen.sheet.openPad('time')
    await screen.sheet.pressKeys('time', '4', '3', '0', '7')

    await screen.sheet.expectDraft('time', '43:07')
  })

  it('shows the transient seconds pair on the way to a valid time', async ({ log }) => {
    // `6:00` is only reachable through `0:60`. The pad shows the draft it is
    // holding rather than correcting it mid-word, and says nothing about it
    // being wrong — because it is not, it is unfinished.
    const screen = await log()
    await screen.logRow()

    await screen.sheet.openPad('time')
    await screen.sheet.pressKeys('time', '6', '0')
    await screen.sheet.expectDraft('time', '0:60')

    await screen.sheet.pressKeys('time', '0')

    await screen.sheet.expectDraft('time', '6:00')
  })

  it('keeps the field as it was when the pad is cancelled', async ({ log }) => {
    const screen = await log()
    await screen.logRow()
    await screen.sheet.enter('time', '42:00')

    await screen.sheet.openPad('time')
    await screen.sheet.pressKeys('time', '9', '9', '9', '9')
    await screen.sheet.padKey('time', 'Cancel').click()

    await screen.sheet.expectValue('time', '42:00')
  })

  it('rounds a transient draft into the value it adds up to on confirm', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    await screen.sheet.openPad('time')
    await screen.sheet.pressKeys('time', '6', '0')
    await screen.sheet.padKey('time', 'Confirm value').click()

    await screen.sheet.expectValue('time', '1:00')
  })

  it('shortens the entry a digit at a time', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    await screen.sheet.openPad('time')
    await screen.sheet.pressKeys('time', '4', '3', '00')
    await screen.sheet.expectDraft('time', '43:00')

    await screen.sheet.pressKeys('time', 'Backspace')

    await screen.sheet.expectDraft('time', '4:30')
  })

  it('offers the distances a rower types, and no suggestion at all for a time', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    await screen.sheet.openPad('distance')
    await screen.sheet.padKey('distance', '10000 m').click()
    await screen.sheet.padKey('distance', 'Confirm value').click()
    await screen.sheet.expectValue('distance', '10000')

    await screen.sheet.openPad('time')

    await expect
      .element(screen.sheet.pad('time').getByRole('group', { name: 'Suggested values' }))
      .not.toBeInTheDocument()
  })

  it('takes digits and Enter from a keyboard, for the desk the erg is not at', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    await screen.sheet.openPad('time')
    await userEvent.keyboard('4307')
    await screen.sheet.expectDraft('time', '43:07')

    await userEvent.keyboard('{Enter}')

    await screen.sheet.expectValue('time', '43:07')
  })

  it('reads a field out by its label and its value', async ({ log }) => {
    // The trigger is the field: a screen reader that hears only "Time" has
    // been told the label and not the answer.
    const screen = await log()
    await screen.logRow()
    await screen.sheet.enter('rate', '24')

    await expect
      .element(screen.sheet.rate)
      .toHaveAccessibleName('Rate in strokes per minute (optional) 24')
  })
})
