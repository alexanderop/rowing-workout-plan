import { describe, expect } from 'vitest'
import { it } from '../fixtures'

describe('touch number entry', () => {
  it('runs under a coarse pointer', async ({ log }) => {
    const screen = await log()
    await screen.expectReady()

    expect(matchMedia('(pointer: coarse)').matches).toBe(true)
  })

  it('enters 43:07 from digits without exposing a malformed intermediate value', async ({
    log,
  }) => {
    const screen = await log()
    await screen.logRow()
    await screen.sheet.openTimePad()

    await expect.element(screen.sheet.time).toHaveAttribute('inputmode', 'none')
    await screen.sheet.pressTimeKeys('4', '3', '0', '7')
    await screen.sheet.expectTime('43:07')
    await expect.element(screen.sheet.time).toHaveFocus()
    await expect
      .element(screen.sheet.anyDialog.getByText('Enter a time like 43:07'))
      .not.toBeInTheDocument()
  })

  it('keeps valid times reachable through a transient seconds pair', async ({ log }) => {
    const screen = await log()
    await screen.logRow()
    await screen.sheet.openTimePad()

    await screen.sheet.pressTimeKeys('6', '0')
    await screen.sheet.expectTime('0:60')
    await expect
      .element(screen.sheet.anyDialog.getByText('Enter a time like 43:07'))
      .not.toBeInTheDocument()

    await screen.sheet.pressTimeKeys('0')

    await screen.sheet.expectTime('6:00')
  })

  it('closes the pad and reveals validation when Time loses focus', async ({ log }) => {
    const screen = await log()
    await screen.logRow()
    await screen.sheet.openTimePad()

    await screen.sheet.pressTimeKeys('6', '0')
    await screen.sheet.anyDialog.getByRole('heading', { name: 'Log a row' }).click()

    await screen.sheet.expectTimePadAbsent()
    await expect.element(screen.sheet.time).not.toHaveFocus()
    await expect.element(screen.sheet.anyDialog.getByText('Enter a time like 43:07')).toBeVisible()
  })

  it('shows the parser error when advancing from incomplete time', async ({ log }) => {
    const screen = await log()
    await screen.logRow()
    await screen.sheet.openTimePad()

    await screen.sheet.pressTimeKeys('6', '0', 'Next')

    await expect.element(screen.sheet.rate).toHaveFocus()
    await expect.element(screen.sheet.anyDialog.getByText('Enter a time like 43:07')).toBeVisible()
  })

  it('supports the 00 shortcut and backspace', async ({ log }) => {
    const screen = await log()
    await screen.logRow()
    await screen.sheet.openTimePad()

    await screen.sheet.pressTimeKeys('4', '3', '00')
    await screen.sheet.expectTime('43:00')

    await screen.sheet.pressTimeKeys('Backspace')
    await screen.sheet.expectTime('4:30')
  })

  it('moves to rate and puts focus back on a real input', async ({ log }) => {
    const screen = await log()
    await screen.logRow()
    await screen.sheet.openTimePad()

    await screen.sheet.pressTimeKeys('4', '3', '0', '7', 'Next')

    await expect.element(screen.sheet.rate).toHaveFocus()
    await screen.sheet.expectTimePadAbsent()
  })

  it('keeps the real input available to an external keyboard', async ({ log }) => {
    const screen = await log()
    await screen.logRow()

    await screen.sheet.fill({ time: '43:07' })

    await screen.sheet.expectTime('43:07')
    await expect.element(screen.sheet.time).toHaveFocus()
    await expect.element(screen.sheet.timePad).toBeVisible()
  })
})
