import { describe } from 'vitest'
import { expect } from 'vitest'
import { it } from '../../fixtures'

describe('number entry on a fine pointer', () => {
  it('keeps the existing text field and does not render the touch pad', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    await screen.sheet.fill({ time: '43:07' })

    await screen.sheet.expectTime('43:07')
    await screen.sheet.expectTimePadAbsent()
  })

  it('distinguishes a zero duration from malformed time', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    await screen.sheet.fill({ time: '0:00' })

    await expect
      .element(screen.sheet.anyDialog.getByText('Time must be greater than zero'))
      .toBeVisible()
    await expect
      .element(screen.sheet.anyDialog.getByText('Enter a time like 43:07'))
      .not.toBeInTheDocument()
  })
})
