import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'

/**
 * The 2k entry sheet (`features/training/components/BenchmarkSheet.vue`).
 *
 * Its own object rather than methods on `PlansScreen`, mirroring the
 * component that renders it: the sheet is portalled outside the screen's
 * subtree, and it is opened from two different places on that screen.
 *
 * The time is entered on a pad, so `type` means "press the digits that make
 * this time" — the colon and the point are the mask's, not the user's.
 */
export class BenchmarkSheet {
  get dialog(): Locator {
    return page.getByRole('dialog', { name: 'Your 2k time' })
  }

  get field(): Locator {
    return page.getByRole('button', { name: /^2k time/ })
  }

  get pad(): Locator {
    return page.getByRole('dialog', { name: '2k time' })
  }

  get save(): Locator {
    return page.getByRole('button', { name: 'Save' })
  }

  padKey(key: string): Locator {
    return this.pad.getByRole('button', { name: key })
  }

  async openPad(): Promise<void> {
    await this.field.click()
    await expect.element(this.pad).toBeVisible()
  }

  async pressKeys(...keys: Array<string>): Promise<void> {
    for (const key of keys) await this.padKey(key).click()
  }

  async type(time: string): Promise<void> {
    await this.openPad()
    await this.pressKeys(...time.replace(/\D/g, ''))
    await this.padKey('Confirm value').click()
    await expect.element(this.pad).not.toBeInTheDocument()
  }

  async submit(): Promise<void> {
    await this.save.click()
  }

  readonly expectOpen = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.dialog).toBeVisible()
  })

  readonly expectClosed = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.dialog).not.toBeInTheDocument()
  })

  /** The live echo of what the entered time means per 500 m. */
  readonly expectPace = vi.defineHelper(async (split: string): Promise<void> => {
    await expect.element(page.getByText(`That is ${split} per 500 m.`)).toBeVisible()
  })

  readonly expectPrefilled = vi.defineHelper(async (time: string): Promise<void> => {
    await expect.element(this.field).toHaveTextContent(time)
  })

  readonly expectSaveDisabled = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.save).toBeDisabled()
  })
}
